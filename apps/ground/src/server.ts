/**
 * ASTER ground process (research prototype, simulated data). A separate process with its own SQLite database:
 * receives case packages idempotently, verifies their content hash, and lets a ground specialist author replies
 * linked to the exact package/event revision. Replies are text + evidence requests only, never device control.
 * Storage is bounded (total cases, cases per run, replies per package) and list endpoints return small pages.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CasePackage, GroundReply, type Receipt } from '@aster/contracts';
import { GroundStation, verifyPackage, type GroundCase } from '@aster/comms';
import { envPort, HttpError, ID_PATTERN, isEntryPoint, openDb, parse, registerSecurity, resolveSecurity, securityFromEnv, serverOptions, transaction, type SecurityOptions } from '../../gateway/src/common';

export interface GroundOptions extends SecurityOptions { dataDir?: string; bodyLimit?: number; maxCases?: number; maxCasesPerRun?: number; maxRepliesPerPackage?: number }

export const PACKAGE_BODY_LIMIT_BYTES = 256 * 1024;
const PAGE_MAX = 50;
const MIGRATIONS = [
  `CREATE TABLE packages (package_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, received_at_ms REAL NOT NULL, duplicates INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL);
   CREATE TABLE replies (seq INTEGER PRIMARY KEY AUTOINCREMENT, reply_id TEXT NOT NULL UNIQUE, run_id TEXT NOT NULL, package_id TEXT NOT NULL REFERENCES packages(package_id), body TEXT NOT NULL);
   CREATE INDEX replies_run ON replies (run_id, seq);`,
];

const idParam = z.string().regex(ID_PATTERN);
const IdParams = z.object({ id: idParam });
const ReplyBody = z.strictObject({
  packageId: idParam,
  text: z.string().trim().min(1).max(2000),
  requestedEvidence: z.array(z.string().max(200)).max(8).default([]),
  authorRole: z.enum(['ground-specialist', 'simulated-responder']).default('ground-specialist'),
});
const page = { after: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_MAX) };
const RepliesQuery = z.object({ runId: idParam.optional(), ...page });
const ListQuery = z.object({ runId: idParam.optional(), ...page });

/** List rows carry no evidence payload. `claimedOrigin` is the sender's label, stored as received and not verified by ground. */
const summary = (c: GroundCase) => ({
  packageId: c.pkg.packageId, runId: c.pkg.runId, eventId: c.pkg.eventId, eventRevision: c.pkg.eventRevision, receivedAtMs: c.receivedAtMs,
  severity: c.pkg.summary.severity, ruleId: c.pkg.summary.ruleId, contentHash: c.pkg.contentHash, duplicates: c.duplicates, claimedOrigin: c.pkg.origin,
});

export function buildGround(opts: GroundOptions = {}): FastifyInstance {
  const sec = resolveSecurity(opts);
  const limits = { maxCases: opts.maxCases ?? 2000, maxRejected: 200, maxRepliesPerPackage: opts.maxRepliesPerPackage ?? 20 };
  const maxCasesPerRun = opts.maxCasesPerRun ?? 500;
  const db = openDb(opts.dataDir ?? '.aster-data', 'ground.sqlite', MIGRATIONS);
  const station = new GroundStation(limits);
  const perRun = new Map<string, number>();
  // Hydrate from SQLite so a restart keeps every received case (and keeps de-duplicating), within the same limits.
  for (const row of db.prepare('SELECT body, received_at_ms, duplicates FROM packages ORDER BY rowid LIMIT ?').all(limits.maxCases) as { body: string; received_at_ms: number; duplicates: number }[]) {
    let pkg;
    try { pkg = CasePackage.safeParse(JSON.parse(row.body)); } catch { continue; }
    if (!pkg.success) continue;
    station.cases.set(pkg.data.packageId, { pkg: pkg.data, receivedAtMs: row.received_at_ms, duplicates: row.duplicates });
    perRun.set(pkg.data.runId, (perRun.get(pkg.data.runId) ?? 0) + 1);
  }
  const insertPkg = db.prepare('INSERT INTO packages (package_id, run_id, received_at_ms, body) VALUES (?, ?, ?, ?)');
  const bumpDup = db.prepare('UPDATE packages SET duplicates = duplicates + 1 WHERE package_id = ?');
  const insertReply = db.prepare('INSERT INTO replies (reply_id, run_id, package_id, body) VALUES (?, ?, ?, ?)');
  const countReplies = db.prepare('SELECT COUNT(*) AS n FROM replies WHERE package_id = ?');

  const app = Fastify(serverOptions(opts.bodyLimit));
  registerSecurity(app, sec);
  app.addHook('onClose', async () => { db.close(); });

  app.get('/health', async () => ({ ok: true, service: 'aster-ground', cases: station.cases.size, capacity: limits.maxCases, dataOrigin: 'simulated' }));

  app.post('/api/v1/ground/packages', { bodyLimit: Math.min(PACKAGE_BODY_LIMIT_BYTES, opts.bodyLimit ?? PACKAGE_BODY_LIMIT_BYTES) }, async (req, reply) => {
    const pkg = parse(CasePackage, req.body);
    const known = station.cases.has(pkg.packageId);
    const receipt: Receipt | 'full' = transaction(db, () => {
      // Per-run quota: one run can not exhaust the store for every other run. Checked only for packages that would be stored.
      if (!known && (perRun.get(pkg.runId) ?? 0) >= maxCasesPerRun && verifyPackage(pkg)) return 'full';
      const r = station.receive(pkg, Date.now()); // null here = total store full (schema was already validated above)
      if (!r) return 'full';
      try {
        if (r.hashOk) { if (r.duplicate) bumpDup.run(pkg.packageId); else insertPkg.run(pkg.packageId, pkg.runId, r.receivedAtMs, JSON.stringify(pkg)); }
      } catch (e) { if (!known) station.cases.delete(pkg.packageId); throw e; }
      if (r.hashOk && !r.duplicate) perRun.set(pkg.runId, (perRun.get(pkg.runId) ?? 0) + 1);
      return r;
    });
    if (receipt === 'full') throw new HttpError(507, 'insufficient_storage');
    // A package whose evidence no longer matches its content hash is rejected and never stored.
    if (!receipt.hashOk) return reply.code(422).send({ error: 'checksum_mismatch', receipt });
    return reply.code(receipt.duplicate ? 200 : 201).send(receipt);
  });

  app.get('/api/v1/ground/packages', async (req) => {
    const q = parse(ListQuery, req.query);
    const all = [...station.cases.values()].filter((c) => !q.runId || c.pkg.runId === q.runId);
    const cases = all.slice(q.after, q.after + q.limit).map(summary);
    return { cases, next: q.after + cases.length, total: all.length, capacity: limits.maxCases, rejected: station.rejected.length };
  });

  app.get('/api/v1/ground/packages/:id', async (req) => {
    const c = station.cases.get(parse(IdParams, req.params).id);
    if (!c) throw new HttpError(404, 'not_found');
    return { ...summary(c), pkg: c.pkg };
  });

  app.post('/api/v1/ground/replies', async (req, reply) => {
    const b = parse(ReplyBody, req.body);
    if (!station.cases.has(b.packageId)) throw new HttpError(404, 'not_found');
    const out = transaction(db, () => {
      const n = (countReplies.get(b.packageId) as { n: number }).n;
      if (n >= limits.maxRepliesPerPackage) return 'limit' as const;
      const r = station.makeReply(b.packageId, b.text, b.requestedEvidence, b.authorRole, Date.now(), n + 1);
      if (!r) return 'limit' as const;
      const info = insertReply.run(r.replyId, r.runId, r.packageId, JSON.stringify(r));
      return { seq: Number(info.lastInsertRowid), reply: r };
    });
    if (out === 'limit') throw new HttpError(409, 'reply_limit_reached');
    return reply.code(201).send(out);
  });

  app.get('/api/v1/ground/replies', async (req) => {
    const q = parse(RepliesQuery, req.query);
    const rows = (q.runId
      ? db.prepare('SELECT seq, body FROM replies WHERE seq > ? AND run_id = ? ORDER BY seq LIMIT ?').all(q.after, q.runId, q.limit)
      : db.prepare('SELECT seq, body FROM replies WHERE seq > ? ORDER BY seq LIMIT ?').all(q.after, q.limit)) as { seq: number; body: string }[];
    const replies = rows.map((r) => ({ seq: r.seq, reply: GroundReply.parse(JSON.parse(r.body)) }));
    return { replies, next: replies.length ? replies[replies.length - 1].seq : q.after, more: replies.length === q.limit };
  });

  return app;
}

if (isEntryPoint(import.meta.url)) {
  try {
    const sec = securityFromEnv();
    const app = buildGround({ ...sec, dataDir: process.env.ASTER_DATA_DIR });
    const host = sec.host?.trim() || '127.0.0.1';
    const address = await app.listen({ host, port: envPort(process.env.ASTER_GROUND_PORT, 4320) });
    console.log(`[aster-ground] listening on ${address} (research prototype, simulated data; auth ${sec.token ? 'bearer token required' : 'loopback only'})`);
    for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => void app.close().then(() => process.exit(0)));
  } catch (e) {
    console.error(`[aster-ground] ${e instanceof Error ? e.message : 'failed to start'}`);
    process.exit(1);
  }
}
