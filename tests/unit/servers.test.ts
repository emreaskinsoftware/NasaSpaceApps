/**
 * Gateway + ground exercised over REAL HTTP/WebSocket on ephemeral loopback ports with temporary SQLite directories.
 * The gateway runs with a manual clock (autoTick: false) so mission time can be advanced deterministically.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { DatabaseSync } from 'node:sqlite';
import type { CasePackage, GroundReply, HealthEvent, Receipt } from '@aster/contracts';
import { buildPackage, verifyPackage } from '@aster/comms';
import { buildGateway, type GatewayOptions } from '../../apps/gateway/src/server';
import { WS_BEARER_PREFIX, WS_PROTOCOL } from '../../apps/gateway/src/common';
import { buildGround, type GroundOptions } from '../../apps/ground/src/server';

const TOKEN = 'test-token-0123456789-abcdefghij';
const dirs: string[] = [];
const open: { close(): Promise<unknown> }[] = [];
const tmp = (): string => { const d = mkdtempSync(join(tmpdir(), 'aster-test-')); dirs.push(d); return d; };
afterEach(async () => { for (const a of open.splice(0).reverse()) await a.close().catch(() => undefined); });
afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* best effort on Windows */ } } });

async function listen(app: FastifyInstance, port = 0): Promise<string> {
  open.push(app);
  await app.listen({ host: '127.0.0.1', port });
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}
const startGround = async (o: GroundOptions = {}, port = 0) => { const app = buildGround({ dataDir: tmp(), ...o }); return { app, url: await listen(app, port) }; };
const startGateway = async (o: GatewayOptions = {}) => { const app = await buildGateway({ dataDir: tmp(), autoTick: false, ...o }); return { app, url: await listen(app), ctl: app.aster }; };

const json = async (url: string, init?: RequestInit): Promise<{ status: number; body: any; headers: Headers }> => {
  const res = await fetch(url, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
};
const post = (url: string, body: unknown, headers: Record<string, string> = {}) => json(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
/** Raw request so restricted headers (Host, Origin) can be forged the way an attacker's browser/DNS would present them. */
const raw = (url: string, headers: Record<string, string>, method = 'GET'): Promise<{ status: number; headers: Record<string, unknown>; text: string }> =>
  new Promise((resolve, reject) => {
    const req = httpRequest(url, { method, headers }, (res) => { let text = ''; res.on('data', (c) => (text += c)); res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text })); });
    req.on('error', reject); req.end();
  });
/** Outcome of a WebSocket handshake: 'open' or the HTTP status that refused the upgrade. */
const wsOutcome = (url: string, opts: WebSocket.ClientOptions = {}, protocols?: string[]): Promise<{ result: 'open' | number; ws: WebSocket }> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url.replace('http', 'ws') + '/api/v1/telemetry', protocols, opts);
    ws.once('open', () => resolve({ result: 'open', ws }));
    ws.once('unexpected-response', (req, res) => { res.resume(); req.destroy(); resolve({ result: res.statusCode ?? 0, ws }); });
    ws.once('error', (e) => reject(e));
  });
const nextMessage = (ws: WebSocket, type: string): Promise<any> => new Promise((resolve) => {
  const on = (d: WebSocket.RawData): void => { const m = JSON.parse(d.toString()); if (m.type === type) { ws.off('message', on); resolve(m); } };
  ws.on('message', on);
});

const FIRST_CASE_MS = 41_000; // SIM-12 seed 7 opens its first review event (auto-queued) at ~40.1 s mission time
/** Summaries from the list endpoint, each completed with its full package from the single-package endpoint. */
const groundCases = async (url: string): Promise<{ total: number; cases: { pkg: CasePackage; duplicates: number; claimedOrigin: string }[] }> => {
  const list = (await json(`${url}/api/v1/ground/packages`)).body;
  const cases = [];
  for (const c of list.cases) cases.push((await json(`${url}/api/v1/ground/packages/${encodeURIComponent(c.packageId)}`)).body);
  return { total: list.total, cases };
};
/** A valid, correctly hashed package for an arbitrary run (ground does not know or care which mission produced it). */
const makePackage = (runId: string, n: number, origin: HealthEvent['origin'] = 'simulated'): CasePackage => buildPackage({
  id: `${runId}:EVT:${n}`, revision: 1, missionId: 'mission-demo', runId, crewId: 'crew-1', openedAtMs: 1000, updatedAtMs: 2000, severity: 'review', state: 'open', ruleId: 'INT-CON-01', ruleVersion: '1.0.0',
  evidenceIds: [], explanationKey: 'k', explanationParams: {}, limitations: [], guidanceId: null, origin, evidence: [], module: 'integrity',
}, 'Crew A', 2000, [], []);
/** Minimal stand-in for a broken or hostile ground: answers /health and package POSTs correctly, replies via `replies()`. */
async function stubGround(replies: (url: string) => { body: string; headers?: Record<string, string> }): Promise<string> {
  const stub: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/health') return res.end('{"ok":true}');
      if (req.method === 'POST') { const p = JSON.parse(body); return res.end(JSON.stringify({ packageId: p.packageId, runId: p.runId, receivedAtMs: 1, duplicate: false, hashOk: true })); }
      const r = replies(req.url ?? '');
      for (const [k, v] of Object.entries(r.headers ?? {})) res.setHeader(k, v);
      res.end(r.body);
    });
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  open.push({ close: () => new Promise((r) => { stub.closeAllConnections(); stub.close(r); }) });
  return `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;
}

describe('gateway <-> ground over real HTTP', () => {
  it('delivers a case package to ground and records the receipt; duplicates and tampering are handled', async () => {
    const ground = await startGround();
    const gw = await startGateway({ groundUrl: ground.url });
    await gw.ctl.settle();
    gw.ctl.advance(FIRST_CASE_MS);
    expect(gw.ctl.runtime.outbox.entries).toHaveLength(1);
    expect(gw.ctl.runtime.outbox.entries[0].state).toBe('sending');
    await gw.ctl.settle();

    const snap = await json(`${gw.url}/api/v1/missions/mission-demo/snapshot`);
    expect(snap.status).toBe(200);
    expect(snap.body.outbox).toHaveLength(1);
    expect(snap.body.outbox[0]).toMatchObject({ state: 'delivered', eventRevision: 1 });
    expect(snap.body.truth).toBeNull();
    expect(snap.body.link.simulated).toBe(false);
    expect(snap.body.manifest.origin).toBe('simulated');

    const stored = await groundCases(ground.url);
    expect(stored.total).toBe(1);
    const pkg = stored.cases[0].pkg;
    expect(pkg.packageId).toBe(snap.body.outbox[0].id);
    expect(verifyPackage(pkg)).toBe(true);

    // duplicate POST: idempotent by packageId
    const dup = await post(`${ground.url}/api/v1/ground/packages`, pkg);
    expect(dup.status).toBe(200);
    expect(dup.body as Receipt).toMatchObject({ packageId: pkg.packageId, duplicate: true, hashOk: true });
    expect((await groundCases(ground.url)).total).toBe(1);
    expect((await groundCases(ground.url)).cases[0].duplicates).toBe(1);

    // tampered evidence, same hash: rejected and not stored (also under a fresh packageId)
    const tampered: CasePackage = { ...pkg, limitations: [...pkg.limitations, 'edited in transit'] };
    for (const t of [tampered, { ...tampered, eventRevision: 9, packageId: `${pkg.eventId}@r9` }]) {
      const res = await post(`${ground.url}/api/v1/ground/packages`, t);
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ error: 'checksum_mismatch', receipt: { hashOk: false, duplicate: false } });
    }
    expect((await groundCases(ground.url)).total).toBe(1);
    expect((await post(`${ground.url}/api/v1/ground/packages`, { ...pkg, contentHash: 'zz' })).status).toBe(400);
    expect((await post(`${ground.url}/api/v1/ground/packages`, { ...pkg, packageId: `${pkg.packageId}-x` })).status).toBe(400); // id must be eventId@rRevision

    // manual queue endpoint (already queued revision -> no second entry)
    const again = await post(`${gw.url}/api/v1/cases/${encodeURIComponent(pkg.eventId)}/packages`, {});
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ packageId: pkg.packageId, alreadyQueued: true, changed: false, state: 'delivered' });
    expect(gw.ctl.runtime.commands).toHaveLength(0); // a no-op is not appended to the command log
    expect(gw.ctl.runtime.outbox.entries).toHaveLength(1);
    expect((await post(`${gw.url}/api/v1/cases/no-such-event/packages`, {})).status).toBe(404);
  });

  it('keeps the entry queued while ground is down and delivers exactly once after ground restarts on the same database', async () => {
    const groundDir = tmp();
    const ground = await startGround({ dataDir: groundDir });
    const port = Number(new URL(ground.url).port);
    const gw = await startGateway({ groundUrl: ground.url });
    await gw.ctl.settle();
    gw.ctl.advance(FIRST_CASE_MS);
    await gw.ctl.settle();
    const first = gw.ctl.runtime.outbox.entries[0];
    expect(first.state).toBe('delivered');

    await ground.app.close(); // ground goes down
    await gw.ctl.settle();
    expect((await json(`${gw.url}/api/v1/missions/mission-demo/snapshot`)).body.link.effectiveUp).toBe(false);
    gw.ctl.advance(20_000); // event is revised at ~60.1 s
    const queued = await post(`${gw.url}/api/v1/cases/${encodeURIComponent(first.payload.eventId)}/packages`, {});
    expect(queued.status).toBe(202);
    expect(queued.body).toMatchObject({ alreadyQueued: false, changed: true, state: 'queued', eventRevision: 2 });
    gw.ctl.advance(5_000);
    await gw.ctl.settle();
    const second = gw.ctl.runtime.outbox.entries.find((e) => e.id === queued.body.packageId)!;
    expect(second).toMatchObject({ state: 'queued', attempts: 0, deliveredAtMs: null });

    const ground2 = await startGround({ dataDir: groundDir }, port); // restart: same DB, same address
    expect((await groundCases(ground2.url)).total).toBe(1); // hydrated from SQLite
    await gw.ctl.settle();
    gw.ctl.advance(200);
    await gw.ctl.settle();
    expect(second.state).toBe('delivered');
    const after = await groundCases(ground2.url);
    expect(after.total).toBe(2);
    expect(after.cases.map((c) => c.pkg.packageId).sort()).toEqual([first.id, second.id].sort());
    // the restarted ground still de-duplicates a package it received before the restart
    const dup = await post(`${ground2.url}/api/v1/ground/packages`, first.payload);
    expect(dup.body).toMatchObject({ duplicate: true, hashOk: true });
    expect((await groundCases(ground2.url)).total).toBe(2);
  });

  it('links a ground reply to the package/event revision and delivers it to the mission; cross-run replies are rejected', async () => {
    const ground = await startGround();
    const gw = await startGateway({ groundUrl: ground.url });
    await gw.ctl.settle();
    gw.ctl.advance(FIRST_CASE_MS);
    await gw.ctl.settle();
    const entry = gw.ctl.runtime.outbox.entries[0];
    gw.ctl.advance(20_000); // local event moves on to revision 2 before the reply arrives

    const made = await post(`${ground.url}/api/v1/ground/replies`, { packageId: entry.id, text: 'Please repeat the contact check.', requestedEvidence: ['contact.force 60 s'], authorRole: 'ground-specialist' });
    expect(made.status).toBe(201);
    expect(made.body.reply).toMatchObject({ packageId: entry.id, eventId: entry.payload.eventId, eventRevision: 1, runId: gw.ctl.runtime.spec.runId });
    expect((await post(`${ground.url}/api/v1/ground/replies`, { packageId: 'unknown-package', text: 'x' })).status).toBe(404);
    expect((await post(`${ground.url}/api/v1/ground/replies`, { packageId: entry.id, text: '' })).status).toBe(400);
    expect((await json(`${ground.url}/api/v1/ground/replies?runId=run-other&after=0`)).body.replies).toEqual([]);

    await gw.ctl.settle();
    await gw.ctl.settle(); // a second poll must not duplicate the reply
    const snap = (await json(`${gw.url}/api/v1/missions/mission-demo/snapshot`)).body;
    expect(snap.replies).toHaveLength(1);
    expect(snap.replies[0]).toMatchObject({ stale: true, localRevisionAtReceipt: 2, reply: { replyId: made.body.reply.replyId, eventRevision: 1, text: 'Please repeat the contact check.' } });
    expect(snap.outbox[0].state).toBe('acknowledged');
    expect(snap.diagnostics.rejectedReplies).toBe(0);

    // A (misbehaving) ground that returns a reply for another run: the mission must refuse it.
    const foreign = { ...made.body.reply, replyId: 'foreign/reply-1', runId: 'run-other' };
    const stubUrl = await stubGround(() => ({ body: JSON.stringify({ replies: [{ seq: 1, reply: foreign }], next: 1 }) }));
    const gw2 = await startGateway({ groundUrl: stubUrl });
    gw2.ctl.advance(FIRST_CASE_MS);
    await gw2.ctl.settle();
    expect(gw2.ctl.transport.stats.replies).toBe(1);
    expect(gw2.ctl.runtime.replies).toHaveLength(0);
    expect(gw2.ctl.runtime.view({ crewId: 'crew-1', metrics: [], windowMs: 1000, endMs: null, eventId: null, includeTruth: false }).diagnostics.rejectedReplies).toBe(1);
  });

  it('recovers the same events, acknowledgements and outbox after a gateway restart, without duplicates', async () => {
    const ground = await startGround();
    const gwDir = tmp();
    const gw = await startGateway({ groundUrl: ground.url, dataDir: gwDir });
    await gw.ctl.settle();
    gw.ctl.advance(45_000);
    await gw.ctl.settle();
    const runId = gw.ctl.runtime.spec.runId;
    const eventId = gw.ctl.events[0].id;
    const ack = await post(`${gw.url}/api/v1/cases/${encodeURIComponent(eventId)}/ack`, {});
    expect(ack.status).toBe(200);
    expect(ack.body).toMatchObject({ eventId, state: 'acknowledged', changed: true });
    // acknowledging again changes nothing and must not grow the command log
    for (let i = 0; i < 3; i++) expect((await post(`${gw.url}/api/v1/cases/${encodeURIComponent(eventId)}/ack`, {})).body).toMatchObject({ state: 'acknowledged', changed: false });
    expect(gw.ctl.runtime.commands).toHaveLength(1);
    // one ground reply is received (and persisted with its cursor) before the restart
    const reply = await post(`${ground.url}/api/v1/ground/replies`, { packageId: gw.ctl.runtime.outbox.entries[0].id, text: 'Noted.' });
    await gw.ctl.settle();
    expect(gw.ctl.runtime.replies).toHaveLength(1);
    expect(gw.ctl.transport.replyCursor).toBe(reply.body.seq);
    const before = (await json(`${gw.url}/api/v1/exports/${encodeURIComponent(runId)}`)).body;
    expect(before.manifest).toMatchObject({ runId, scenarioId: 'SIM-12', seed: 7, origin: 'simulated' });
    expect(before.commands).toHaveLength(1);
    expect(before.commands[0]).toMatchObject({ type: 'ack', eventId });
    const eventsBefore = (await json(`${gw.url}/api/v1/events?after=0`)).body;
    expect(eventsBefore.events.length).toBeGreaterThanOrEqual(2);
    expect(eventsBefore.next).toBe(eventsBefore.total);
    expect((await json(`${gw.url}/api/v1/events?after=${eventsBefore.next}`)).body.events).toEqual([]);
    await gw.app.close();

    const gw2 = await startGateway({ groundUrl: ground.url, dataDir: gwDir });
    expect(gw2.ctl.recovered).toBe(true);
    expect(gw2.ctl.runtime.spec.runId).toBe(runId);
    expect(gw2.ctl.runtime.nowMs).toBeGreaterThanOrEqual(45_000);
    expect(gw2.ctl.runtime.nowMs).toBeLessThanOrEqual(45_100);
    expect(gw2.ctl.runtime.latestEvent(eventId)!.state).toBe('acknowledged');
    expect(gw2.ctl.droppedCommands).toBe(0);
    // the reply comes back from the gateway's own database; the cursor resumes, nothing is re-ingested from 0
    expect(gw2.ctl.transport.replyCursor).toBe(reply.body.seq);
    expect(gw2.ctl.runtime.replies.map((r) => r.reply.replyId)).toEqual([reply.body.reply.replyId]);
    const after = (await json(`${gw2.url}/api/v1/exports/${encodeURIComponent(runId)}`)).body;
    expect(after.events).toEqual(before.events);
    expect(after.commands).toEqual(before.commands);
    expect((await json(`${gw2.url}/api/v1/events?after=0`)).body.events).toEqual(eventsBefore.events);
    // the recovered outbox re-offers its case; ground answers "duplicate" and stores nothing new
    await gw2.ctl.settle();
    gw2.ctl.advance(200);
    await gw2.ctl.settle();
    expect(gw2.ctl.runtime.outbox.entries.map((e) => e.state)).toEqual(['delivered']);
    expect(gw2.ctl.transport.stats.replies).toBe(0);
    expect(gw2.ctl.runtime.replies).toHaveLength(1);
    const cases = await groundCases(ground.url);
    expect(cases.total).toBe(1);
    expect(cases.cases[0].duplicates).toBe(1);
    expect((await json(`${gw2.url}/api/v1/exports/run-does-not-exist`)).status).toBe(404);
  });
});

describe('security', () => {
  it('refuses a non-loopback bind without a sufficiently long token', async () => {
    await expect(buildGateway({ dataDir: tmp(), autoTick: false, host: '0.0.0.0' })).rejects.toThrow(/Refusing to start/);
    await expect(buildGateway({ dataDir: tmp(), autoTick: false, host: '192.168.1.20', token: 'short' })).rejects.toThrow(/at least 24/);
    expect(() => buildGround({ dataDir: tmp(), host: '0.0.0.0' })).toThrow(/Refusing to start/);
    expect(() => buildGround({ dataDir: tmp(), host: '::' })).toThrow(/Refusing to start/);
  });

  it('requires the bearer token on every route except /health when a token is configured', async () => {
    const gw = await startGateway({ host: '0.0.0.0', token: TOKEN, groundUrl: 'http://127.0.0.1:9' });
    const ground = await startGround({ host: '0.0.0.0', token: TOKEN });
    expect((await json(`${gw.url}/health`)).status).toBe(200);
    expect((await json(`${ground.url}/health`)).status).toBe(200);
    for (const url of [`${gw.url}/api/v1/capabilities`, `${gw.url}/api/v1/events`, `${gw.url}/api/v1/missions/mission-demo/snapshot`, `${ground.url}/api/v1/ground/packages`, `${ground.url}/api/v1/ground/replies`]) {
      expect((await json(url)).status).toBe(401);
      expect((await json(url, { headers: { authorization: 'Bearer wrong-token-wrong-token-wrong' } })).status).toBe(401);
      expect((await json(url, { headers: { authorization: `Bearer ${TOKEN}x` } })).status).toBe(401);
      expect((await json(url, { headers: { authorization: `Basic ${TOKEN}` } })).status).toBe(401);
      const ok = await json(url, { headers: { authorization: `Bearer ${TOKEN}` } });
      expect(ok.status).toBe(200);
    }
    const denied = await json(`${gw.url}/api/v1/capabilities`);
    expect(denied.body).toEqual({ error: 'unauthorized' });
    expect(JSON.stringify(denied.body)).not.toContain(TOKEN);
    expect((await post(`${ground.url}/api/v1/ground/replies`, { packageId: 'p', text: 'x' })).status).toBe(401);
    // WebSocket upgrade: no token -> 401; Authorization header or bearer subprotocol -> accepted, token never echoed
    expect((await wsOutcome(gw.url)).result).toBe(401);
    expect((await wsOutcome(gw.url, {}, [WS_PROTOCOL, `${WS_BEARER_PREFIX}not-the-token-not-the-token`])).result).toBe(401);
    const a = await wsOutcome(gw.url, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(a.result).toBe('open');
    a.ws.close();
    const b = await wsOutcome(gw.url, {}, [WS_PROTOCOL, `${WS_BEARER_PREFIX}${TOKEN}`]);
    expect(b.result).toBe('open');
    expect(b.ws.protocol).toBe(WS_PROTOCOL);
    b.ws.close();
  });

  it('rejects disallowed Origin and Host on HTTP and on the WebSocket upgrade; CORS is allow-list only', async () => {
    const gw = await startGateway({ groundUrl: 'http://127.0.0.1:9' });
    const ground = await startGround();
    const host = new URL(gw.url).host;
    for (const base of [gw.url, ground.url]) {
      for (const origin of ['https://evil.example', 'null', 'http://localhost.evil.example', 'http://127.0.0.1.evil.example:5173', 'http://localhost:9999', 'http://127.0.0.1:8080', 'https://localhost:5173']) {
        const r = await raw(`${base}/health`, { origin });
        expect(r.status).toBe(403);
        expect(r.headers['access-control-allow-origin']).toBeUndefined();
      }
      const ok = await raw(`${base}/health`, { origin: 'http://localhost:5173' });
      expect(ok.status).toBe(200);
      expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(ok.headers['access-control-allow-origin']).not.toBe('*');
      const preflight = await raw(`${base}/health`, { origin: 'http://127.0.0.1:4173', 'access-control-request-method': 'POST' }, 'OPTIONS');
      expect(preflight.status).toBe(204);
      expect((await raw(`${base}/health`, { origin: 'https://evil.example', 'access-control-request-method': 'POST' }, 'OPTIONS')).status).toBe(403);
      // DNS rebinding: the attacker's hostname resolves to 127.0.0.1 but the Host header gives it away
      expect((await raw(`${base}/health`, { host: 'evil.example' })).status).toBe(403);
      expect((await raw(`${base}/health`, { host: `rebind.evil.example:${new URL(base).port}` })).status).toBe(403);
      expect((await raw(`${base}/health`, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
      // security headers on API responses
      expect(ok.headers['x-content-type-options']).toBe('nosniff');
      expect(ok.headers['cache-control']).toBe('no-store');
      expect(String(ok.headers['content-security-policy'])).toContain("default-src 'none'");
    }
    expect((await wsOutcome(gw.url, { origin: 'https://evil.example' })).result).toBe(403);
    expect((await wsOutcome(gw.url, { origin: 'http://localhost:9999' })).result).toBe(403); // another local web app is still cross-origin
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:4173']) { const w = await wsOutcome(gw.url, { origin }); expect(w.result).toBe('open'); w.ws.close(); }
    expect((await wsOutcome(gw.url, { headers: { host: 'evil.example' } })).result).toBe(403);
    const good = await wsOutcome(gw.url, { origin: `http://${host}` });
    expect(good.result).toBe('open');
    good.ws.close();
    // an explicit allow-list replaces the loopback default
    const strict = await startGateway({ groundUrl: 'http://127.0.0.1:9', allowedOrigins: ['https://console.example'] });
    expect((await raw(`${strict.url}/health`, { origin: 'http://localhost:5173' })).status).toBe(403);
    expect((await raw(`${strict.url}/health`, { origin: 'https://console.example' })).headers['access-control-allow-origin']).toBe('https://console.example');
  });

  it('returns 413 for oversized bodies and generic 400/404 errors without stack traces', async () => {
    const gw = await startGateway({ groundUrl: 'http://127.0.0.1:9' });
    const ground = await startGround();
    const big = JSON.stringify({ text: 'x'.repeat(1024 * 1024 + 64) });
    for (const url of [`${gw.url}/api/v1/imports`, `${ground.url}/api/v1/ground/packages`]) {
      const r = await json(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: big });
      expect(r.status).toBe(413);
      expect(r.body).toEqual({ error: 'payload_too_large' });
    }
    // ground accepts at most 256 KB per package POST
    expect((await json(`${ground.url}/api/v1/ground/packages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pad: 'x'.repeat(300 * 1024) }) })).status).toBe(413);
    const clean = (r: { status: number; body: any }, status: number): void => {
      expect(r.status).toBe(status);
      const text = JSON.stringify(r.body);
      expect(text).not.toMatch(/stack|node_modules|\.ts:|\bat \w+ \(|[A-Z]:\\\\|Error:/);
      expect(typeof r.body.error).toBe('string');
    };
    const badJson = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text": ' };
    clean(await json(`${gw.url}/api/v1/imports`, badJson), 400);
    clean(await json(`${ground.url}/api/v1/ground/packages`, badJson), 400);
    clean(await post(`${gw.url}/api/v1/imports`, { text: 1 }), 400);
    clean(await post(`${gw.url}/api/v1/imports`, { text: '', extra: true }), 400);
    clean(await post(`${ground.url}/api/v1/ground/packages`, { packageId: 'only-this' }), 400);
    clean(await json(`${gw.url}/api/v1/missions/bad%20id!/snapshot`), 400);
    clean(await json(`${gw.url}/api/v1/exports/..%2F..%2Fetc%2Fpasswd`), 400);
    clean(await json(`${gw.url}/api/v1/exports/${'a'.repeat(161)}`), 400);
    clean(await json(`${gw.url}/api/v1/events?after=-1`), 400);
    clean(await json(`${gw.url}/api/v1/events?after=1%3BDROP%20TABLE%20runs`), 400);
    clean(await json(`${gw.url}/api/v1/missions/mission-demo/snapshot?metrics=co2.cabin,evil`), 400);
    clean(await json(`${ground.url}/api/v1/ground/replies?after=abc`), 400);
    clean(await json(`${gw.url}/api/v1/missions/other-mission/snapshot`), 404);
    clean(await json(`${gw.url}/api/v1/exports/x'%20OR%20'1'='1`), 400);
    clean(await json(`${gw.url}/api/v1/nope`), 404);
    expect((await json(`${gw.url}/api/v1/events?after=0`)).status).toBe(200); // tables are intact
  });

  it('validates imports and external WebSocket telemetry without merging either into the simulated run', async () => {
    const gw = await startGateway({ groundUrl: 'http://127.0.0.1:9' });
    const o = (i: number, unit = 'ppm', origin = 'simulated') => ({
      schemaVersion: 1, id: `o-${i}`, missionId: 'm', runId: 'r', crewId: null, streamId: 'cabin:co2.cabin', sourceId: 'emu', sequence: i, observedAtMs: i * 1000, receivedAtUtc: '2026-01-01T00:00:00.000Z',
      clockUncertaintyMs: 0, metric: 'co2.cabin', value: 600, unit, origin, quality: 'valid', qualityReasons: [], provenanceId: 'p',
    });
    const imp = await post(`${gw.url}/api/v1/imports`, { text: [o(0), o(1, '%'), o(2)].map((x) => JSON.stringify(x)).join('\n') });
    expect(imp.status).toBe(200);
    expect(imp.body).toMatchObject({ accepted: 2, rejected: 1, origin: 'recorded', mergedIntoRun: false });
    expect(imp.body.errors[0]).toMatchObject({ row: 2 });
    const asText = await json(`${gw.url}/api/v1/imports`, { method: 'POST', headers: { 'content-type': 'application/x-ndjson' }, body: JSON.stringify(o(0)) });
    expect(asText.body).toMatchObject({ accepted: 1, rejected: 0 });

    const records = gw.ctl.runtime.view({ crewId: 'crew-1', metrics: [], windowMs: 1000, endMs: null, eventId: null, includeTruth: false }).diagnostics.records;
    const { result, ws } = await wsOutcome(gw.url);
    expect(result).toBe('open');
    const view = await nextMessage(ws, 'view');
    expect(view).toMatchObject({ origin: 'simulated', runId: gw.ctl.runtime.spec.runId, externalTelemetry: { mergedIntoRun: false } });
    // a sender may CLAIM 'hardware'; the gateway only tallies the claim and stamps what it received as 'recorded'
    ws.send(JSON.stringify({ type: 'batch', records: [o(0), o(1, 'ppm', 'hardware'), o(2, 'kPa'), { junk: true }] }));
    expect(await nextMessage(ws, 'ack')).toEqual({ type: 'ack', accepted: 2, rejected: 2, stampedOrigin: 'recorded', mergedIntoRun: false });
    ws.send('{not json');
    expect(await nextMessage(ws, 'error')).toEqual({ type: 'error', error: 'invalid_message' });
    ws.send(JSON.stringify({ type: 'batch', records: new Array(5001).fill(null) }));
    expect((await nextMessage(ws, 'error')).error).toBe('invalid_message');
    expect(gw.ctl.external).toMatchObject({ batches: 1, acceptedRecords: 2, rejectedRecords: 2, rejectedMessages: 2, claimedOrigins: { simulated: 1, hardware: 1 }, stampedOrigin: 'recorded', mergedIntoRun: false });
    expect(gw.ctl.runtime.view({ crewId: 'crew-1', metrics: [], windowMs: 1000, endMs: null, eventId: null, includeTruth: false }).diagnostics.records).toBe(records);

    // per-connection rate cap: a flood closes the socket with a policy code
    const closed = new Promise<number>((r) => ws.once('close', (code) => r(code)));
    for (let i = 0; i < 80; i++) ws.send(JSON.stringify({ type: 'batch', records: [] }));
    expect(await closed).toBe(1008);
    expect(gw.ctl.external.rateLimited).toBeGreaterThanOrEqual(1);
    // max message size: an oversized frame is refused by the server (1009 = message too big)
    const second = await wsOutcome(gw.url);
    const batchesBefore = gw.ctl.external.batches;
    const tooBig = new Promise<number>((r) => second.ws.once('close', (code) => r(code)));
    second.ws.send('x'.repeat(600 * 1024));
    expect([1009, 1006]).toContain(await tooBig); // refused; 1006 when the reset outruns the close frame
    expect(gw.ctl.external.batches).toBe(batchesBefore);

    const caps = (await json(`${gw.url}/api/v1/capabilities`)).body;
    expect(caps.capabilities.map((c: { verification: string }) => c.verification)).not.toContain('hardware-verified');
    expect(caps.run.origin).toBe('simulated');
  });
});

describe('security regressions (review findings)', () => {
  it('ground store is bounded in total and per run, lists summaries only, and survives a restart with the same limits', async () => {
    const dir = tmp();
    const ground = await startGround({ dataDir: dir, maxCases: 3, maxCasesPerRun: 2 });
    const send = (p: CasePackage) => post(`${ground.url}/api/v1/ground/packages`, p);
    const a1 = makePackage('run-a', 1, 'hardware'), a2 = makePackage('run-a', 2), a3 = makePackage('run-a', 3), b1 = makePackage('run-b', 1), c1 = makePackage('run-c', 1);
    expect((await send(a1)).status).toBe(201);
    expect((await send(a2)).status).toBe(201);
    const perRun = await send(a3); // run-a quota reached
    expect(perRun.status).toBe(507);
    expect(perRun.body).toEqual({ error: 'insufficient_storage' });
    expect((await send(b1)).status).toBe(201); // other runs are not starved by run-a
    expect((await send(c1)).status).toBe(507); // total capacity reached
    expect((await send(a1)).body).toMatchObject({ duplicate: true }); // already stored packages still de-duplicate
    expect((await send({ ...a3, limitations: ['x'] })).status).toBe(422); // tampering is still reported as such when full

    const list = (await json(`${ground.url}/api/v1/ground/packages`)).body;
    expect(list).toMatchObject({ total: 3, capacity: 3 });
    expect(Object.keys(list.cases[0]).sort()).toEqual(['claimedOrigin', 'contentHash', 'duplicates', 'eventId', 'eventRevision', 'packageId', 'receivedAtMs', 'ruleId', 'runId', 'severity']);
    expect(list.cases[0]).toMatchObject({ packageId: a1.packageId, claimedOrigin: 'hardware', duplicates: 1, ruleId: 'INT-CON-01', severity: 'review' });
    expect(JSON.stringify(list)).not.toContain('"evidence"');
    expect((await json(`${ground.url}/api/v1/ground/packages?limit=2&after=1`)).body.cases.map((c: { packageId: string }) => c.packageId)).toEqual([a2.packageId, b1.packageId]);
    expect((await json(`${ground.url}/api/v1/ground/packages?limit=51`)).status).toBe(400);
    expect((await json(`${ground.url}/api/v1/ground/packages?runId=run-b`)).body.total).toBe(1);
    const full = (await json(`${ground.url}/api/v1/ground/packages/${encodeURIComponent(a1.packageId)}`)).body;
    expect(full.pkg).toEqual(a1); // stored exactly as received (origin included)...
    expect(full.claimedOrigin).toBe('hardware'); // ...and surfaced as a claim
    expect((await json(`${ground.url}/api/v1/ground/packages/nope`)).status).toBe(404);
    expect((await json(`${ground.url}/api/v1/ground/packages/a%2Fb`)).status).toBe(400);

    // rejections are a bounded ring (limit 200): 230 bad packages never grow it past the cap
    for (let i = 0; i < 230; i++) await send({ ...a1, limitations: [`t${i}`] });
    expect((await json(`${ground.url}/api/v1/ground/packages`)).body.rejected).toBe(200);

    await ground.app.close();
    const again = await startGround({ dataDir: dir, maxCases: 3, maxCasesPerRun: 2 });
    expect((await json(`${again.url}/health`)).body).toMatchObject({ cases: 3, capacity: 3 });
    expect((await post(`${again.url}/api/v1/ground/packages`, c1)).status).toBe(507);
    expect((await post(`${again.url}/api/v1/ground/packages`, a3)).status).toBe(507);
  });

  it('ground caps replies per package and paginates the reply list', async () => {
    const dir = tmp();
    const ground = await startGround({ dataDir: dir });
    const pkg = makePackage('run-r', 1);
    await post(`${ground.url}/api/v1/ground/packages`, pkg);
    for (let i = 0; i < 20; i++) expect((await post(`${ground.url}/api/v1/ground/replies`, { packageId: pkg.packageId, text: `reply ${i}` })).status).toBe(201);
    const over = await post(`${ground.url}/api/v1/ground/replies`, { packageId: pkg.packageId, text: 'one too many' });
    expect(over.status).toBe(409);
    expect(over.body).toEqual({ error: 'reply_limit_reached' });
    const page1 = (await json(`${ground.url}/api/v1/ground/replies?runId=run-r&limit=15`)).body;
    expect(page1.replies).toHaveLength(15);
    expect(page1.more).toBe(true);
    const page2 = (await json(`${ground.url}/api/v1/ground/replies?runId=run-r&limit=15&after=${page1.next}`)).body;
    expect(page2.replies).toHaveLength(5);
    expect((await json(`${ground.url}/api/v1/ground/replies?limit=51`)).status).toBe(400);
    // the cap also holds after a restart (counted from the database, not from memory)
    await ground.app.close();
    const again = await startGround({ dataDir: dir });
    expect((await post(`${again.url}/api/v1/ground/replies`, { packageId: pkg.packageId, text: 'after restart' })).status).toBe(409);
  });

  it('mission side drops replies beyond the runtime caps and refuses oversized ground responses while reading', async () => {
    let replies: GroundReply[] = [];
    const flood = await stubGround((url) => ({ body: JSON.stringify(url.includes('after=0') ? { replies: replies.map((reply, i) => ({ seq: i + 1, reply })), next: replies.length } : { replies: [], next: 25 }) }));
    const gw = await startGateway({ groundUrl: flood });
    await gw.ctl.settle();
    gw.ctl.advance(FIRST_CASE_MS);
    const entry = gw.ctl.runtime.outbox.entries[0];
    replies = Array.from({ length: 25 }, (_, i) => ({
      schemaVersion: 1 as const, replyId: `${entry.id}/reply-${i + 1}`, runId: gw.ctl.runtime.spec.runId, packageId: entry.id, eventId: entry.payload.eventId, eventRevision: entry.payload.eventRevision,
      authorRole: 'ground-specialist' as const, createdAtMs: 1, requestedEvidence: [], text: `r${i}`,
    }));
    await gw.ctl.settle();
    expect(gw.ctl.runtime.replies).toHaveLength(20);
    expect(gw.ctl.transport.stats).toMatchObject({ replies: 20, droppedReplies: 5 });
    expect(gw.ctl.transport.replyCursor).toBe(25); // the cursor still moves past dropped replies
    const snap = (await json(`${gw.url}/api/v1/missions/mission-demo/snapshot`)).body;
    expect(snap.diagnostics.rejectedReplies).toBe(0);
    expect(snap.groundLink).toMatchObject({ replyCursor: 25, droppedReplies: 5 });

    // oversized response bodies: declared via Content-Length, and undeclared (chunked) — both refused, nothing ingested
    const bigBody = JSON.stringify({ replies: [], next: 0, pad: 'x'.repeat(2 * 1024 * 1024) });
    const variants: Record<string, string>[] = [{ 'content-length': String(Buffer.byteLength(bigBody)) }, { 'transfer-encoding': 'chunked' }];
    for (const headers of variants) {
      const big = await stubGround(() => ({ body: bigBody, headers }));
      const g = await startGateway({ groundUrl: big });
      await g.ctl.settle();
      expect(g.ctl.transport.stats.oversizedResponses).toBe(1);
      expect(g.ctl.transport.stats.replies).toBe(0);
      expect(g.ctl.transport.isUp()).toBe(false); // a ground that answers like this is treated as an outage
    }
  });

  it('rate-limits state-changing requests per remote address', async () => {
    const gw = await startGateway({ groundUrl: 'http://127.0.0.1:9', rateLimitPerMin: 3 });
    for (let i = 0; i < 3; i++) expect((await post(`${gw.url}/api/v1/imports`, { text: '' })).status).toBe(200);
    const limited = await post(`${gw.url}/api/v1/imports`, { text: '' });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'too_many_requests' });
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await post(`${gw.url}/api/v1/cases/any/ack`, {})).status).toBe(429);
    expect((await json(`${gw.url}/api/v1/events`)).status).toBe(200); // reads are not limited
    expect((await json(`${gw.url}/health`)).status).toBe(200);
  });

  it('validates stored command rows before replay: invalid rows are dropped, counted and never executed', async () => {
    const dir = tmp();
    const gw = await startGateway({ groundUrl: 'http://127.0.0.1:9', dataDir: dir });
    gw.ctl.advance(45_000);
    const runId = gw.ctl.runtime.spec.runId, eventId = gw.ctl.events[0].id;
    expect((await post(`${gw.url}/api/v1/cases/${encodeURIComponent(eventId)}/ack`, {})).body.changed).toBe(true);
    await gw.app.close();

    const db = new DatabaseSync(join(dir, 'gateway.sqlite'));
    const insert = db.prepare('INSERT INTO commands (run_id, seq, t, body) VALUES (?, ?, ?, ?)');
    insert.run(runId, 50, 100, JSON.stringify({ t: 100, type: 'shell', command: 'rm -rf /' }));
    insert.run(runId, 51, 200, '{not json');
    insert.run(runId, 52, 300, JSON.stringify({ t: 300, type: 'ack', eventId: { $ne: null } }));
    insert.run(runId, 53, 400, JSON.stringify({ t: -5, type: 'link', up: 'yes' }));
    db.close();

    const gw2 = await startGateway({ groundUrl: 'http://127.0.0.1:9', dataDir: dir });
    expect(gw2.ctl.recovered).toBe(true);
    expect(gw2.ctl.droppedCommands).toBe(4);
    expect(gw2.ctl.runtime.commands).toHaveLength(1);
    expect(gw2.ctl.runtime.commands[0]).toMatchObject({ type: 'ack', eventId });
    expect(gw2.ctl.runtime.latestEvent(eventId)!.state).toBe('acknowledged');
    expect((await json(`${gw2.url}/health`)).body.recovery).toEqual({ recovered: true, droppedCommands: 4 });
    expect((await json(`${gw2.url}/api/v1/missions/mission-demo/snapshot`)).body.diagnostics.droppedCommands).toBe(4);
    // new commands are appended after the highest stored sequence (no primary-key clash with the dropped rows)
    gw2.ctl.advance(16_000);
    const queued = await post(`${gw2.url}/api/v1/cases/${encodeURIComponent(eventId)}/packages`, {});
    expect(queued.status).toBe(202);
    expect(queued.body.changed).toBe(true);
  });

  it('closes WebSocket connections that stay silent past the idle window; responsive ones stay open', async () => {
    const gw = await startGateway({ groundUrl: 'http://127.0.0.1:9', wsIdleMs: 240 });
    const silent = await wsOutcome(gw.url, { autoPong: false });
    const alive = await wsOutcome(gw.url);
    expect(silent.result).toBe('open');
    const closedAt = await new Promise<number>((r) => { const t0 = Date.now(); silent.ws.once('close', () => r(Date.now() - t0)); });
    expect(closedAt).toBeLessThan(2000);
    await new Promise((r) => setTimeout(r, 400));
    expect(alive.ws.readyState).toBe(WebSocket.OPEN);
    expect(gw.ctl.external).toMatchObject({ idleClosed: 1, openConnections: 1 });
    alive.ws.close();
  });

  it('refuses to send the ground bearer token over plain http to a non-loopback host', async () => {
    await expect(buildGateway({ dataDir: tmp(), autoTick: false, groundUrl: 'http://ground.example:4320', groundToken: TOKEN })).rejects.toThrow(/plain http/);
    await expect(buildGateway({ dataDir: tmp(), autoTick: false, groundUrl: 'http://192.168.1.50:4320', groundToken: TOKEN })).rejects.toThrow(/Refusing to start/);
    for (const groundUrl of ['https://ground.example', 'http://127.0.0.1:9', 'http://localhost:9']) {
      const app = await buildGateway({ dataDir: tmp(), autoTick: false, groundUrl, groundToken: TOKEN });
      open.push(app);
    }
    const noToken = await buildGateway({ dataDir: tmp(), autoTick: false, groundUrl: 'http://ground.example:4320' }); // nothing secret to leak
    open.push(noToken);
  });
});
