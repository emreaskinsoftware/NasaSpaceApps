import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CasePackage, LinkConfig, ReferenceSession } from '@aster/contracts';
import { acceptReply, buildPackage, canonicalJson, GroundStation, LinkSim, ReliableSender, sha256Hex, verifyPackage } from '@aster/comms';
import { MissionRuntime, forkCommands, newRunSpec, type ViewRequest } from '@aster/runtime';
import { MissionHost } from '../../apps/web/src/workers/host';
import { GroundDb, MissionDb } from '../../apps/web/src/storage/db';
import type { FromWorker } from '../../apps/web/src/workers/protocol';

const ROOT = join(__dirname, '../..');
const refs = JSON.parse(readFileSync(join(ROOT, 'data/reference/sessions.json'), 'utf8')) as Record<string, ReferenceSession[]>;
const REQ: ViewRequest = { crewId: 'crew-1', metrics: [], windowMs: 60000, endMs: null, eventId: null, includeTruth: false };
const cfg = (p: Partial<LinkConfig> = {}): LinkConfig => ({ profile: 'near-real-time demonstration', oneWayDelayMs: 1300, bandwidthBytesPerSec: 20000, packetLoss: 0, up: true, ...p });
const runTo = (rt: MissionRuntime, ms: number) => { while (rt.nowMs < ms) rt.tick(); return rt; };
const one = (id: string, seed = 7) => new MissionRuntime(newRunSpec(id, seed, null, ['crew-1']), refs);

describe('hashing and packages', () => {
  it('SHA-256 matches known vectors and canonical JSON is key-order independent', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('é'.repeat(100))).toHaveLength(64);
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
  it('a tampered package fails verification and is rejected by the ground without being stored', () => {
    const rt = runTo(one('SIM-12'), 60000);
    const pkg = rt.outbox.entries[0].payload;
    expect(verifyPackage(pkg)).toBe(true);
    const bad: CasePackage = { ...pkg, limitations: [...pkg.limitations, 'clinically validated'] };
    expect(verifyPackage(bad)).toBe(false);
    const g = new GroundStation();
    expect(g.receive(bad, 1)).toMatchObject({ hashOk: false });
    expect(g.cases.size).toBe(0);
    expect(g.receive({ nonsense: true }, 2)).toBeNull();
    expect(g.rejected.map((r) => r.reason)).toEqual(['checksum-mismatch', 'schema']);
  });
  it('packages carry pseudonyms, the exact event revision, declared missing items and bounded snippets', () => {
    const rt = runTo(one('SIM-12'), 60000);
    const pkg = rt.outbox.entries[0].payload;
    expect(pkg.crewPseudonym).toBe('CM-1');
    expect(JSON.stringify(pkg)).not.toContain('Vega');
    expect(pkg.packageId).toBe(`${pkg.eventId}@r${pkg.eventRevision}`);
    expect(pkg.snippets.length).toBeGreaterThan(0);
    expect(pkg.snippets.every((s) => s.values.length <= 600)).toBe(true);
    const ev = rt.latestEvent(pkg.eventId)!;
    expect(buildPackage({ ...ev, revision: pkg.eventRevision }, 'CM-1', pkg.generatedAtMs, pkg.snippets, pkg.missing).packageId).toBe(pkg.packageId);
  });
});

describe('link simulator and reliable delivery', () => {
  const frame = (id: string, bytes = 2000) => ({ kind: 'package' as const, id, body: {}, bytes });
  it('never delivers earlier than propagation delay plus serialization time', () => {
    const link = new LinkSim(cfg(), () => 0.5);
    link.send('up', frame('a'), 0);
    const min = link.minLatencyMs(2000);
    expect(min).toBe(1300 + 100);
    expect(link.poll('up', min - 1)).toEqual([]);
    expect(link.poll('up', min).map((f) => f.id)).toEqual(['a']);
  });
  it('serialises frames at the configured bandwidth (a second frame waits for the first)', () => {
    const link = new LinkSim(cfg({ bandwidthBytesPerSec: 1000 }), () => 0.5);
    link.send('up', frame('a', 1000), 0); link.send('up', frame('b', 1000), 0);
    expect(link.poll('up', 2300).map((f) => f.id)).toEqual(['a']);
    expect(link.poll('up', 3300).map((f) => f.id)).toEqual(['b']);
  });
  it('keeps entries queued through an outage and retries after loss', () => {
    let lose = true;
    const link = new LinkSim(cfg({ packetLoss: 0.5 }), () => (lose ? 0 : 1), [[0, 10000]]);
    const s = new ReliableSender<{ n: number }>('up', 'package');
    s.enqueue('p1', { n: 1 }, 2, 0);
    for (let t = 0; t < 10000; t += 100) s.tick(t, link);
    expect(s.entries[0]).toMatchObject({ state: 'queued', attempts: 0 }); // outage: persisted, not failed
    for (let t = 10000; t < 20000; t += 100) { s.tick(t, link); expect(link.poll('up', t)).toEqual([]); }
    expect(s.entries[0].attempts).toBeGreaterThan(0); // lost frame -> no acknowledgement -> retry scheduled
    lose = false;
    let delivered: string[] = [];
    for (let t = 20000; t < 60000 && !delivered.length; t += 100) { s.tick(t, link); delivered = link.poll('up', t).map((f) => f.id); }
    expect(delivered).toEqual(['p1']);
    s.onAck('p1', 60000);
    expect(s.entries[0].state).toBe('delivered');
    expect(s.enqueue('p1', { n: 1 }, 2, 61000)).toBeNull(); // idempotent enqueue
  });
  it('sends higher priority first but ages waiting entries so low priority cannot starve', () => {
    const link = new LinkSim(cfg({ bandwidthBytesPerSec: 50 }), () => 0.5);
    const s = new ReliableSender<number>('up', 'package');
    s.enqueue('low', 0, 1, 0);
    s.enqueue('high-1', 0, 3, 100000);
    const order: string[] = [];
    const orig = link.send.bind(link);
    link.send = (d, f, t) => { order.push(f.id); return orig(d, f, t); };
    s.tick(100000, link);
    expect(order[0]).toBe('high-1');
    const s2 = new ReliableSender<number>('up', 'package'), order2: string[] = [];
    const link2 = new LinkSim(cfg(), () => 0.5); const o2 = link2.send.bind(link2);
    link2.send = (d, f, t) => { order2.push(f.id); return o2(d, f, t); };
    s2.enqueue('low', 0, 1, 0); s2.enqueue('high', 0, 3, 200000);
    s2.tick(200000, link2);
    expect(order2[0]).toBe('low'); // waited > 2 priority steps
  });
  it('reply acceptance rejects cross-run and unknown-package replies and flags stale revisions', () => {
    const base = { schemaVersion: 1, replyId: 'p@r1/reply-1', runId: 'run-a', packageId: 'p@r1', eventId: 'e', eventRevision: 1, authorRole: 'ground-specialist', createdAtMs: 1, requestedEvidence: [], text: 'ok' };
    const known = new Map([['p@r1', { eventId: 'e', eventRevision: 1 }]]);
    expect(acceptReply({ ...base, runId: 'run-b' }, 'run-a', known, () => 1)).toEqual({ error: 'cross-run-reply' });
    expect(acceptReply(base, 'run-a', new Map(), () => 1)).toEqual({ error: 'unknown-package' });
    expect(acceptReply({ ...base, text: '' }, 'run-a', known, () => 1)).toEqual({ error: 'schema' });
    expect(acceptReply(base, 'run-a', known, () => 4)).toMatchObject({ stale: true, localRevision: 4 });
    expect(acceptReply(base, 'run-a', known, () => 1)).toMatchObject({ stale: false });
    // a reply cannot be re-pointed at another event or a fake future revision to defeat the stale flag
    expect(acceptReply({ ...base, eventId: 'other' }, 'run-a', known, () => 1)).toEqual({ error: 'mismatched-context' });
    expect(acceptReply({ ...base, eventRevision: 999999 }, 'run-a', known, () => 1)).toEqual({ error: 'mismatched-context' });
  });
});

describe('mission runtime', () => {
  it('SIM-12: the case survives the outage, is delivered once despite a duplicate receipt, and gets a revision-linked reply', () => {
    const rt = one('SIM-12');
    runTo(rt, 119000);
    expect(rt.outbox.entries[0].state).toBe('queued');
    expect(rt.ground.cases.size).toBe(0);
    runTo(rt, 126000);
    expect(rt.outbox.entries[0].state).toBe('delivered');
    const c = [...rt.ground.cases.values()][0];
    expect(c.receivedAtMs - 120000).toBeGreaterThanOrEqual(rt.link.minLatencyMs(rt.outbox.entries[0].sizeBytes) - 100);
    runTo(rt, 128000);
    expect(rt.ground.cases.size).toBe(1);
    expect(c.duplicates).toBe(1);
    rt.apply({ type: 'groundReply', packageId: c.pkg.packageId, text: 'Confirm garment fit.', requestedEvidence: ['contact.force 60 s'], authorRole: 'ground-specialist' });
    runTo(rt, 132000);
    expect(rt.replies).toHaveLength(1);
    expect(rt.replies[0].reply).toMatchObject({ eventId: c.pkg.eventId, eventRevision: c.pkg.eventRevision, runId: rt.spec.runId });
    expect(rt.outbox.entries[0].state).toBe('acknowledged');
    expect(rt.groundOut.entries[0].state).toBe('delivered');
  });
  it('SIM-13: a late reply to a superseded revision is marked stale and does not overwrite the current state', () => {
    const rt = one('SIM-13');
    runTo(rt, 62000);
    const c = [...rt.ground.cases.values()][0];
    expect(c.pkg.eventRevision).toBe(1);
    rt.apply({ type: 'groundReply', packageId: c.pkg.packageId, text: 'Old context.', requestedEvidence: [], authorRole: 'ground-specialist' });
    const before = rt.latestEvent(c.pkg.eventId)!;
    runTo(rt, 100000);
    const r = rt.replies[0], now = rt.latestEvent(c.pkg.eventId)!;
    expect(r.stale).toBe(true);
    expect(now.revision).toBeGreaterThan(r.reply.eventRevision);
    expect(now.revision).toBeGreaterThanOrEqual(before.revision);
    expect(now.state).toBe('resolved'); // local state decided locally, not by the reply
  });
  it('pausing the virtual clock freezes inference and transport together; replay reproduces the exact run', () => {
    const rt = one('SIM-12');
    runTo(rt, 121000);
    const frozen = JSON.stringify(rt.view(REQ).outbox);
    expect(JSON.stringify(rt.view(REQ).outbox)).toBe(frozen); // no tick -> nothing moves
    rt.apply({ type: 'ack', eventId: rt.outbox.entries[0].payload.eventId });
    runTo(rt, 200000);
    const again = MissionRuntime.replay(rt.spec, refs, rt.commands, rt.nowMs);
    const a = rt.view(REQ), b = again.view(REQ);
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    expect(JSON.stringify(b.outbox)).toBe(JSON.stringify(a.outbox));
    expect(b.events.some((e) => e.state === 'acknowledged' || e.revision > 1)).toBe(true);
  });
  it('a fork is a new run that inherits injections but no acknowledgements, outbox or replies; the parent is untouched', () => {
    const parent = one('SIM-12');
    runTo(parent, 60000);
    parent.apply({ type: 'inject', injection: { atMs: 0, kind: 'set', crewId: 'crew-1', track: 'vent', value: 1.1 } });
    parent.apply({ type: 'ack', eventId: parent.outbox.entries[0].payload.eventId });
    runTo(parent, 130000);
    const snap = JSON.stringify(parent.view(REQ).outbox);
    const spec = newRunSpec('SIM-12', 7, { runId: parent.spec.runId, atMs: 100000 }, ['crew-1']);
    const cmds = forkCommands(parent.commands, 100000);
    expect(cmds.map((c) => c.type)).toEqual(['inject']);
    const fork = MissionRuntime.replay(spec, refs, cmds, 100000, { reconstructUntilMs: 100000 });
    expect(fork.spec.runId).not.toBe(parent.spec.runId);
    expect(fork.manifest.parentRunId).toBe(parent.spec.runId);
    expect(fork.outbox.entries).toHaveLength(0);
    expect(fork.replies).toHaveLength(0);
    expect(fork.view(REQ).events.every((e) => e.runId === spec.runId && e.state !== 'acknowledged')).toBe(true);
    expect(JSON.stringify(parent.view(REQ).outbox)).toBe(snap);
  });
  it('drops invalid stored commands on recovery and bounds what a peer can make the stores hold', () => {
    const spec = newRunSpec('SIM-01', 1, null, ['crew-1']);
    const bad = [{ t: 0, type: 'linkProfile', profile: '__proto__' }, { t: 0, type: 'inject', injection: { atMs: 0, kind: 'set', crewId: 'crew-1', track: 'constructor', value: 1 } }, { t: 0, type: 'nope' }, { t: 100, type: 'autoQueue', on: false }];
    const rt = MissionRuntime.replay(spec, refs, bad as never, 1000);
    expect(rt.droppedCommands).toBe(3);
    expect(rt.autoQueue).toBe(false);
    expect(() => rt.apply({ type: 'groundReply', packageId: 'x', text: 'y'.repeat(2001), requestedEvidence: [], authorRole: 'ground-specialist' })).toThrow();
    const g = new GroundStation({ maxCases: 1, maxRejected: 3, maxRepliesPerPackage: 2 });
    for (let i = 0; i < 10; i++) g.receive({ junk: i }, i);
    expect(g.rejected).toHaveLength(3);
    const src = runTo(one('SIM-12'), 60000).outbox.entries[0].payload;
    expect(g.receive(src, 1)).toMatchObject({ hashOk: true, duplicate: false });
    expect(g.receive({ ...src, packageId: 'forged-id' }, 2)).toBeNull(); // packageId must equal eventId@rRevision
    expect([1, 2, 3].map((n) => g.makeReply(src.packageId, 'ok', [], 'ground-specialist', 5, n) !== null)).toEqual([true, true, false]);
  });
  it('the operator view never contains simulator truth unless the researcher route asks for it', () => {
    const rt = runTo(one('SIM-02'), 30000);
    const v = rt.view(REQ);
    expect(v.truth).toBeNull();
    expect(JSON.stringify(v)).not.toContain('inhaledMeanPpm');
    expect(rt.view({ ...REQ, includeTruth: true }).truth!.breaths.length).toBeGreaterThan(3);
  });
});

describe('browser persistence (IndexedDB)', () => {
  let n = 0;
  const mkHost = (name: string) => { const msgs: FromWorker[] = []; return { host: new MissionHost(refs, (m) => msgs.push(m), new MissionDb(`${name}-m`), new GroundDb(`${name}-g`)), msgs }; };
  it('recovers a reloaded run without duplicating events or losing acknowledgements', async () => {
    const name = `t${n++}`, a = mkHost(name);
    await a.host.start('SIM-12', 7);
    runTo(a.host.rt!, 60000);
    await a.host.command({ type: 'ack', eventId: a.host.rt!.outbox.entries[0].payload.eventId });
    runTo(a.host.rt!, 130000);
    await a.host.checkpoint();
    const before = a.host.rt!.view(REQ);
    const b = mkHost(name); // "reload": a new host over the same databases
    await b.host.init();
    const after = b.host.rt!.view(REQ);
    expect(b.host.status().recovered).toBe(true);
    expect(after.manifest.runId).toBe(before.manifest.runId);
    expect(JSON.stringify(after.events)).toBe(JSON.stringify(before.events));
    expect(JSON.stringify(after.outbox)).toBe(JSON.stringify(before.outbox));
    expect(await b.host.db.eventRevisions.count()).toBe([...a.host.rt!.revisions.values()].flat().length);
    expect(await b.host.gdb.cases.count()).toBe(before.ground.cases.length); // ground store holds delivered packages only
  });
  it('reset and a new scenario create new run ids and preserve the previous run', async () => {
    const h = mkHost(`t${n++}`).host;
    await h.start('SIM-01', 1);
    const first = h.rt!.spec.runId;
    await h.start('SIM-01', 1);
    expect(h.rt!.spec.runId).not.toBe(first);
    expect((await h.db.runs.toArray()).map((r) => r.active).sort()).toEqual([0, 1]);
  });
  it('SIM-15: a storage failure is visible, blocks "saved", keeps the last durable checkpoint and recovers on retry', async () => {
    const { host, msgs } = mkHost(`t${n++}`);
    await host.start('SIM-15', 3);
    runTo(host.rt!, 60000);
    await host.checkpoint();
    expect(host.status().persist).toMatchObject({ ok: true, lastDurableMs: 60000 });
    runTo(host.rt!, 90000);
    await host.checkpoint();
    expect(host.status().persist).toMatchObject({ ok: false, lastDurableMs: 60000, simulatedFault: true });
    const cmds = await host.db.commands.count();
    await host.command({ type: 'autoQueue', on: false });
    expect(await host.db.commands.count()).toBe(cmds);           // not written
    expect(host.rt!.autoQueue).toBe(true);                        // and therefore not applied
    expect(msgs.some((m) => m.type === 'error' && m.op === 'command')).toBe(true);
    await host.retryPersist();
    expect(host.status().persist).toMatchObject({ ok: true, lastDurableMs: 90000 });
  });
});

describe('localisation', () => {
  const dir = join(ROOT, 'apps/web/src/locales');
  const en = JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8')) as Record<string, string>;
  it.each(['tr', 'de', 'fr', 'es', 'ar', 'ja'])('%s has complete key parity and matching placeholders', (l) => {
    const d = JSON.parse(readFileSync(join(dir, `${l}.json`), 'utf8')) as Record<string, string>;
    expect(Object.keys(d).sort()).toEqual(Object.keys(en).sort());
    const ph = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort().join();
    for (const k of Object.keys(en)) expect(ph(d[k]), k).toBe(ph(en[k]));
    expect(d['settings.wipePrompt']).toContain('RESET');
  });
});
