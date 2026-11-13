/**
 * Browser-local persistence (IndexedDB via Dexie). Not encrypted: synthetic demo records only.
 * The mission DB and the ground DB are separate stores; the ground console never reads the mission store.
 */
import Dexie, { type Table } from 'dexie';
import type { CasePackage, GroundReply, HealthEvent } from '@aster/contracts';
import type { Command, OutboxRow, RunSpec } from '@aster/runtime';

export interface RunRow { runId: string; spec: RunSpec; lastMs: number; active: 0 | 1; updatedAt: number }
export interface CommandRow { id?: number; runId: string; cmd: Command }

export class MissionDb extends Dexie {
  runs!: Table<RunRow, string>;
  commands!: Table<CommandRow, number>;
  eventRevisions!: Table<{ key: string; runId: string; ev: HealthEvent }, string>;
  outbox!: Table<{ id: string; runId: string; row: OutboxRow }, string>;
  constructor(name = 'aster-mission') {
    super(name);
    this.version(1).stores({ runs: 'runId, active, updatedAt', commands: '++id, runId', eventRevisions: 'key, runId', outbox: 'id, runId' });
  }
}
export class GroundDb extends Dexie {
  cases!: Table<{ packageId: string; runId: string; receivedAtMs: number; pkg: CasePackage }, string>;
  replies!: Table<{ replyId: string; runId: string; reply: GroundReply }, string>;
  constructor(name = 'aster-ground') {
    super(name);
    this.version(1).stores({ cases: 'packageId, runId', replies: 'replyId, runId' });
  }
}

/** Raw detailed streams are regenerated deterministically from (spec, commands); only bounded metadata is stored. */
export const RETENTION = { rawDetailMinutes: 30, maxRuns: 12 };
