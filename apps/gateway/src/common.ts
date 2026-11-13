/**
 * Shared server hardening + SQLite bootstrap for the two local ASTER processes (mission gateway, ground).
 * Research prototype, simulated data. The policy is deliberately small and explicit:
 *  - loopback bind by default; a non-loopback bind refuses to start without ASTER_API_TOKEN (>= 24 chars)
 *  - Host allow-list (DNS-rebinding) + Origin allow-list (cross-site requests / WebSocket hijacking), HTTP and WS upgrade;
 *    by default only the ASTER web origins (Vite dev 5173 / preview 4173 on loopback) and the server's own origin are allowed
 *  - explicit CORS for allow-listed origins only, never a wildcard
 *  - bearer token compared in constant time; tokens and payloads are never logged
 *  - generic error bodies, no stack traces
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';

export const BODY_LIMIT_BYTES = 1024 * 1024;
export const MIN_TOKEN_LENGTH = 24;
export const WS_PROTOCOL = 'aster.v1';
/** Browsers cannot set Authorization on a WebSocket; they offer this subprotocol prefix + token next to WS_PROTOCOL. */
export const WS_BEARER_PREFIX = 'aster.bearer.';
/** Safe identifier for path/query parameters: no slashes, dots-only segments are harmless because ids are DB keys, never paths. */
export const ID_PATTERN = /^[A-Za-z0-9._:@-]{1,160}$/;

export interface SecurityOptions { host?: string; token?: string; allowedOrigins?: string[]; allowedHosts?: string[] }
export interface SecurityConfig { host: string; token: string | null; allowedOrigins: Set<string>; allowedHosts: Set<string> }
/** The ASTER web app (Vite dev / preview). Any other local web page is cross-origin and refused, even on loopback. */
export const DEFAULT_WEB_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173', 'http://localhost:4173'] as const;

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const bare = (h: string): string => h.trim().toLowerCase().replace(/^\[|\]$/g, '');
export const isLoopbackHost = (h: string): boolean => { const b = bare(h); return b === 'localhost' || b === '::1' || /^127(\.\d{1,3}){3}$/.test(b); };
const csv = (s: string | undefined): string[] | undefined => (s === undefined ? undefined : s.split(',').map((x) => x.trim()).filter(Boolean));

export function securityFromEnv(env: NodeJS.ProcessEnv = process.env): SecurityOptions {
  return { host: env.ASTER_BIND_HOST, token: env.ASTER_API_TOKEN, allowedOrigins: csv(env.ASTER_ALLOWED_ORIGINS), allowedHosts: csv(env.ASTER_ALLOWED_HOSTS) };
}

/** Throws (process refuses to start) when the configuration would expose the API without authentication. */
export function resolveSecurity(o: SecurityOptions): SecurityConfig {
  const host = o.host?.trim() || '127.0.0.1';
  const token = o.token ? o.token : null;
  if (token !== null && token.length < MIN_TOKEN_LENGTH) throw new Error(`ASTER_API_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`);
  if (!isLoopbackHost(host) && token === null) throw new Error(`Refusing to start: bind host is not loopback and ASTER_API_TOKEN is not set (min ${MIN_TOKEN_LENGTH} chars)`);
  const origins = new Set<string>(o.allowedOrigins?.length ? o.allowedOrigins.map((x) => new URL(x).origin) : DEFAULT_WEB_ORIGINS);
  const hosts = new Set<string>(LOOPBACK_HOSTS);
  if (!['0.0.0.0', '::', '[::]'].includes(host)) hosts.add(host.includes(':') && !host.startsWith('[') ? `[${host.toLowerCase()}]` : host.toLowerCase());
  for (const h of o.allowedHosts ?? []) hosts.add(h.toLowerCase());
  if (o.allowedOrigins?.length) for (const x of origins) hosts.add(new URL(x).hostname.toLowerCase());
  return { host, token, allowedOrigins: origins, allowedHosts: hosts };
}

/** Allow-listed origin, or the server's own origin (same-origin; `host` is the already allow-listed Host header). */
export function originAllowed(cfg: SecurityConfig, origin: string, host?: string): boolean {
  return cfg.allowedOrigins.has(origin) || (host !== undefined && origin === `http://${host.trim().toLowerCase()}`);
}
function hostAllowed(cfg: SecurityConfig, header: string | undefined): boolean {
  if (!header || header.length > 255) return false;
  const m = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.exec(header.trim());
  return m !== null && cfg.allowedHosts.has(m[1].toLowerCase());
}
const digest = (s: string): Buffer => createHash('sha256').update(s).digest();
/** Constant-time comparison (hash first so both buffers have equal length and length is not leaked). */
export const tokenMatches = (expected: string, given: string): boolean => timingSafeEqual(digest(expected), digest(given));

function presentedToken(req: FastifyRequest): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7);
  if (String(req.headers.upgrade ?? '').toLowerCase() === 'websocket') {
    for (const p of String(req.headers['sec-websocket-protocol'] ?? '').split(',')) {
      const t = p.trim();
      if (t.startsWith(WS_BEARER_PREFIX)) return t.slice(WS_BEARER_PREFIX.length);
    }
  }
  return null;
}

export class HttpError extends Error {
  constructor(readonly statusCode: number, readonly code: string, readonly issues?: { path: string; message: string }[]) { super(code); }
}
/** zod validation at the trust boundary; failures become a 400 with field paths only (no payload echo, no stack). */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw new HttpError(400, 'bad_request', r.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.').slice(0, 80), message: i.message.slice(0, 120) })));
}

const GENERIC: Record<number, string> = { 409: 'conflict', 507: 'insufficient_storage', 400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 405: 'method_not_allowed', 408: 'request_timeout', 413: 'payload_too_large', 415: 'unsupported_media_type', 429: 'too_many_requests', 503: 'unavailable' };

/** Fastify options shared by both servers: body limit, timeouts, no request logging (nothing sensitive can leak to logs). */
export const serverOptions = (bodyLimit = BODY_LIMIT_BYTES) => ({
  logger: false, bodyLimit, connectionTimeout: 10_000, requestTimeout: 10_000, keepAliveTimeout: 5_000, routerOptions: { maxParamLength: 200 }, return503OnClosing: true, forceCloseConnections: true,
}) as const;

export function registerSecurity(app: FastifyInstance, cfg: SecurityConfig): void {
  // A refused WebSocket upgrade is answered over a socket the HTTP server no longer tracks: close it explicitly
  // once the response is flushed, so refused handshakes can not accumulate open sockets.
  const endUpgrade = (req: FastifyRequest, reply: FastifyReply): void => {
    if (req.headers.upgrade === undefined) return;
    reply.header('Connection', 'close');
    reply.raw.once('finish', () => req.raw.socket.destroy());
  };
  const deny = (req: FastifyRequest, reply: FastifyReply, status: number, error: string): FastifyReply => { endUpgrade(req, reply); return reply.code(status).send({ error }); };
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Cache-Control', 'no-store').header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
      .header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY').header('Cross-Origin-Resource-Policy', 'same-site').header('Vary', 'Origin');
    if (!hostAllowed(cfg, req.headers.host)) return deny(req, reply, 403, 'forbidden');
    const origin = req.headers.origin;
    if (origin !== undefined) {
      if (typeof origin !== 'string' || !originAllowed(cfg, origin, req.headers.host)) return deny(req, reply, 403, 'forbidden');
      reply.header('Access-Control-Allow-Origin', origin).header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        .header('Access-Control-Allow-Headers', 'authorization, content-type').header('Access-Control-Max-Age', '600');
    } else if (req.headers['sec-fetch-site'] === 'cross-site') return deny(req, reply, 403, 'forbidden');
    if (req.method === 'OPTIONS') return reply.code(204).send();
    if (cfg.token !== null && req.url.split('?')[0] !== '/health') {
      const given = presentedToken(req);
      if (given === null || !tokenMatches(cfg.token, given)) return deny(req, reply.header('WWW-Authenticate', 'Bearer'), 401, 'unauthorized');
    }
  });
  app.setNotFoundHandler((req, reply) => deny(req, reply, 404, 'not_found'));
  app.setErrorHandler((err: unknown, req, reply) => {
    endUpgrade(req, reply);
    const e = err as { statusCode?: unknown; issues?: unknown };
    const status = err instanceof HttpError ? err.statusCode : typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500 ? e.statusCode : 500;
    const body: Record<string, unknown> = { error: err instanceof HttpError ? err.code : GENERIC[status] ?? (status === 500 ? 'internal_error' : 'bad_request') };
    if (err instanceof HttpError && err.issues) body.issues = err.issues;
    return reply.code(status).send(body);
  });
}

/**
 * Fixed-window rate limit per remote address for the given methods (state-changing routes). Memory is bounded:
 * the table is pruned of expired windows and, if still large, cleared.
 */
export function registerRateLimit(app: FastifyInstance, o: { max: number; windowMs: number; methods?: readonly string[] }): void {
  const methods = new Set(o.methods ?? ['POST', 'PUT', 'PATCH', 'DELETE']);
  const hits = new Map<string, { start: number; count: number }>();
  app.addHook('onRequest', async (req, reply) => {
    if (!methods.has(req.method)) return;
    const now = Date.now(), key = req.ip;
    let h = hits.get(key);
    if (!h || now - h.start >= o.windowMs) {
      if (hits.size >= 4096) { for (const [k, v] of hits) if (now - v.start >= o.windowMs) hits.delete(k); if (hits.size >= 4096) hits.clear(); }
      h = { start: now, count: 0 }; hits.set(key, h);
    }
    if (++h.count > o.max) return reply.code(429).header('Retry-After', String(Math.ceil((h.start + o.windowMs - now) / 1000))).send({ error: 'too_many_requests' });
  });
}

/** Open (or create) a SQLite database and apply forward-only migrations tracked in schema_version. Statements are parameterised everywhere else. */
export function openDb(dataDir: string, file: string, migrations: readonly string[]): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, file));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null } | undefined;
  for (let v = row?.v ?? 0; v < migrations.length; v++) {
    transaction(db, () => { db.exec(migrations[v]); db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v + 1); });
  }
  return db;
}
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** True when this module file is the process entry point (so importing a server file in tests never listens). */
export function isEntryPoint(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try { return resolve(fileURLToPath(metaUrl)).toLowerCase() === resolve(entry).toLowerCase(); } catch { return false; }
}
export function envPort(value: string | undefined, fallback: number): number {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error('Invalid port');
  return n;
}
