import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  e2eServiceName, uniqueBuildingCode, uniquePhone, cleanupRun, linkedRows, planCleanup,
  skippedReport, E2eRun, readAllLogs, readLogs, E2E_TABLES, LINKED_TITLE,
  type E2eRunLog, type E2eCleanupDb, type SkippedRow, type CleanupFacts,
} from './run.js';

// CP-7 (BE-P2-09) · scripts/e2e/run.ts, scripts/e2e/cleanup.mjs. Outside edge mocked only:
// the Prisma read model (contract/contractService/viewing/roomPrice/ratePlan/room/service/
// building/user/session) as plain recording fakes, and the run-log directory as a real
// temp dir created with fs.mkdtemp and removed in afterEach (PLAN §1 rule 1 exception).
// The unit under test (run.ts functions) is never mocked.

function emptyIds(): E2eRunLog['ids'] {
  return Object.fromEntries(E2E_TABLES.map((t) => [t, []])) as E2eRunLog['ids'];
}
function makeLog(ids: Partial<E2eRunLog['ids']>, status: E2eRunLog['status'] = 'RUNNING'): E2eRunLog {
  return {
    runId: '20261101T1200-TEST', startedAt: '2026-11-01T12:00:00.000Z', endedAt: null,
    status, buildingCodes: [], ids: { ...emptyIds(), ...ids },
  };
}

interface FakeContractRow {
  id: number; code: string; roomId: number; buildingId: number; tenantId: number; createdById: number;
  viewingId: number | null; invoices: number;
}
interface FakeContractServiceRow { serviceId: number; contractCode: string }

function fakeCleanupDb(contracts: FakeContractRow[], services: FakeContractServiceRow[] = []): {
  db: EcCleanupDbWithCalls; calls: { updateMany: { table: string; args: unknown }[] };
} {
  const calls = { updateMany: [] as { table: string; args: unknown }[] };
  const updateMany = (table: string) => vi.fn(async (args: unknown) => {
    calls.updateMany.push({ table, args });
    return { count: 0 };
  });
  const contractFindMany = vi.fn(async (args: { where: { OR: Record<string, unknown>[] } }) => {
    return contracts.filter((c) => args.where.OR.some((cond) => {
      const [[key, val]] = Object.entries(cond) as [string, { in?: number[] } | { id: { in: number[] } }][];
      if (key === 'viewing') {
        const v = (val as { id: { in: number[] } }).id.in;
        return c.viewingId !== null && v.includes(c.viewingId);
      }
      const inList = (val as { in: number[] }).in;
      const rowVal = (c as unknown as Record<string, number>)[key];
      return inList.includes(rowVal);
    })).map((c) => ({
      id: c.id, code: c.code, roomId: c.roomId, buildingId: c.buildingId,
      tenantId: c.tenantId, createdById: c.createdById,
      viewing: c.viewingId !== null ? { id: c.viewingId } : null,
      _count: { invoices: c.invoices },
    }));
  });
  const contractServiceFindMany = vi.fn(async (args: { where: { serviceId: { in: number[] } } }) => {
    return services.filter((s) => args.where.serviceId.in.includes(s.serviceId))
      .map((s) => ({ serviceId: s.serviceId, contract: { code: s.contractCode } }));
  });
  const db = {
    contract: { findMany: contractFindMany },
    contractService: { findMany: contractServiceFindMany },
    viewing: { updateMany: updateMany('viewings') },
    roomPrice: { updateMany: updateMany('room_prices') },
    ratePlan: { updateMany: updateMany('rate_plans') },
    room: { updateMany: updateMany('rooms') },
    service: { updateMany: updateMany('services') },
    building: { updateMany: updateMany('buildings') },
    user: { updateMany: updateMany('users') },
    session: { updateMany: updateMany('session') },
  } as unknown as EcCleanupDbWithCalls;
  return { db, calls };
}
type EcCleanupDbWithCalls = E2eCleanupDb & {
  contract: { findMany: ReturnType<typeof vi.fn> };
  contractService: { findMany: ReturnType<typeof vi.fn> };
};

const tmpDirs: string[] = [];
function tmpRunsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-run-spec-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('CP-7 e2eServiceName', () => {
  it('3b: throws when the result would be over 50 chars, does not truncate', () => {
    const long = 'a'.repeat(60);
    expect(() => e2eServiceName(long)).toThrow(/50/);
    // not-truncated proof: a 44-char body (name = "[E2E] " + 44 = 50) must still pass
    expect(e2eServiceName('a'.repeat(44))).toHaveLength(50);
  });
});

describe('CP-7 uniqueBuildingCode / uniquePhone', () => {
  it('7: stops after exactly 20 tries and throws when exists is always true', async () => {
    const exists = vi.fn(async () => true);
    await expect(uniqueBuildingCode(exists, () => 'ABCD')).rejects.toThrow(/20/);
    expect(exists).toHaveBeenCalledTimes(20);
  });

  it('7b: rand() returns only the random part, the caller prepends the prefix', async () => {
    const code = await uniqueBuildingCode(async () => false, () => 'WXYZ');
    expect(code).toBe('E2WXYZ');
    const phone = await uniquePhone(async () => false, () => '12345678');
    expect(phone).toBe('0912345678');
  });

  it('8: uniquePhone matches the phone shape and retries on duplicate', async () => {
    const exists = vi.fn(async (p: string) => p === '0911111111');
    let n = 0;
    const rand = () => (n++ === 0 ? '11111111' : '22222222');
    const phone = await uniquePhone(exists, rand);
    expect(phone).toMatch(/^09\d{8}$/);
    expect(phone).toBe('0922222222');
    expect(exists).toHaveBeenCalledTimes(2);
  });

  it('9: never calls exists for the 5 seeded phone numbers, regenerates instead', async () => {
    const exists = vi.fn(async () => false);
    let n = 0;
    const seeds = ['00000001', '00000002', '00000003', '00000004', '00000005'];
    const rand = () => (n < seeds.length ? seeds[n++] : '99999999');
    const phone = await uniquePhone(exists, rand);
    expect(phone).toBe('0999999999');
    expect(exists).not.toHaveBeenCalledWith(expect.stringMatching(/^0900000000[1-5]$/));
  });
});

describe('CP-7 cleanupRun', () => {
  it('14: every updateMany touches only ids from the log; no delete/deleteMany/$executeRaw', async () => {
    const log = makeLog({ rooms: [1, 2], buildings: [3], viewings: [4] });
    const { db, calls } = fakeCleanupDb([]);
    await cleanupRun(db, log);
    for (const call of calls.updateMany) {
      const where = (call.args as { where: { id?: { in: number[] } } }).where;
      expect(where).toBeDefined();
      if (where.id) {
        const logged = log.ids[call.table as keyof E2eRunLog['ids']] ?? [];
        for (const id of where.id.in) expect(logged).toContain(id);
      }
    }
    expect((db as unknown as Record<string, unknown>).delete).toBeUndefined();
    expect((db as unknown as Record<string, unknown>).deleteMany).toBeUndefined();
    expect((db as unknown as Record<string, unknown>).$executeRaw).toBeUndefined();
  });

  it('18: users step updates user by id and session by userId, filtered on revokedAt null', async () => {
    const log = makeLog({ users: [10, 11] });
    const { db, calls } = fakeCleanupDb([]);
    await cleanupRun(db, log);
    const userCall = calls.updateMany.find((c) => c.table === 'users')!;
    expect((userCall.args as { where: { id: { in: number[] } } }).where.id.in).toEqual([10, 11]);
    const sessionCall = calls.updateMany.find((c) => c.table === 'session')!;
    const sessionWhere = sessionCall.args as { where: { userId: { in: number[] }; revokedAt: null } };
    expect(sessionWhere.where.userId.in).toEqual([10, 11]);
    expect(sessionWhere.where.revokedAt).toBeNull();
    expect((sessionCall.args as { where: { id?: unknown } }).where.id).toBeUndefined();
  });

  it('20: an empty log, or one table with an empty id list, skips that step (no updateMany call)', async () => {
    const log = makeLog({ rooms: [1] }); // every other table stays []
    const { db, calls } = fakeCleanupDb([]);
    const skipped = await cleanupRun(db, log);
    expect(skipped).toEqual([]);
    expect(calls.updateMany.map((c) => c.table)).toEqual(['rooms']);
  });

  it('21: one failing step does not stop the others; cleanupRun throws AggregateError with it', async () => {
    const log = makeLog({ rooms: [1], buildings: [2] });
    const { db } = fakeCleanupDb([]);
    const roomSpy = vi.fn(async () => { throw new Error('room step failed'); });
    db.room.updateMany = roomSpy;
    const buildingSpy = vi.fn(async () => ({ count: 0 }));
    db.building.updateMany = buildingSpy;
    await expect(cleanupRun(db, log)).rejects.toSatisfy((e: unknown) => {
      expect(e).toBeInstanceOf(AggregateError);
      expect((e as AggregateError).errors).toHaveLength(1);
      return true;
    });
    expect(roomSpy).toHaveBeenCalledTimes(1);
    expect(buildingSpy).toHaveBeenCalledTimes(1);
  });

  it('21b: two failing steps -> AggregateError.errors has exactly 2 elements', async () => {
    const log = makeLog({ rooms: [1], buildings: [2], services: [3] });
    const { db } = fakeCleanupDb([]);
    db.room.updateMany = vi.fn(async () => { throw new Error('room failed'); });
    db.building.updateMany = vi.fn(async () => { throw new Error('building failed'); });
    const serviceSpy = vi.fn(async () => ({ count: 0 }));
    db.service.updateMany = serviceSpy;
    await expect(cleanupRun(db, log)).rejects.toSatisfy((e: unknown) => {
      expect((e as AggregateError).errors).toHaveLength(2);
      return true;
    });
    expect(serviceSpy).toHaveBeenCalledTimes(1);
  });
});

describe('CP-7 planCleanup (list mode, pure)', () => {
  it('22: returns description lines, calls no write method, leaves the on-disk log untouched', async () => {
    const dir = tmpRunsDir();
    const run = new E2eRun('20261101T1200-PURE', dir);
    run.record('rooms', 1);
    const before = readFileSync(join(dir, `${run.runId}.json`), 'utf8');
    const facts: CleanupFacts = { ids: { rooms: [{ id: 1, isActive: true, linked: [] }] }, unlogged: [] };
    const lines = planCleanup(run.log, facts);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.some((l) => l.includes('rooms #1'))).toBe(true);
    const after = readFileSync(join(dir, `${run.runId}.json`), 'utf8');
    expect(after).toBe(before);
  });

  it('22b: a linked row names the contract code (not a numeric id); an inactive row is "đã dọn"', () => {
    const log = makeLog({ rooms: [1, 2] });
    const facts: CleanupFacts = {
      ids: { rooms: [
        { id: 1, isActive: true, linked: ['hợp đồng HD000001'] },
        { id: 2, isActive: false, linked: [] },
      ] },
      unlogged: [],
    };
    const lines = planCleanup(log, facts);
    const linkedLine = lines.find((l) => l.includes('#1'))!;
    expect(linkedLine).toContain('hợp đồng HD000001');
    expect(linkedLine).not.toMatch(/\bid\s*[:=]\s*\d/);
    const clearedLine = lines.find((l) => l.includes('#2'))!;
    expect(clearedLine).toContain('đã dọn');
  });
});

describe('CP-7 readAllLogs / readLogs', () => {
  it('24: a corrupted JSON file next to a good one is skipped with console.error, the good one still returned', () => {
    const dir = tmpRunsDir();
    const good = new E2eRun('20261101T1200-GOOD', dir);
    good.record('rooms', 1);
    writeFileSync(join(dir, '20261101T1201-BAD.json'), '{ not json');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logs = readAllLogs(dir);
    expect(logs.map((l) => l.runId)).toEqual(['20261101T1200-GOOD']);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('20261101T1201-BAD.json'));
    errorSpy.mockRestore();
  });
});

describe('CP-7 import paths (text check, matches npm run lint scope)', () => {
  it('28: run.spec.ts imports the compiled .js specifier, cleanup.mjs imports the real .ts file', () => {
    const specSelf = readFileSync(new URL('./run.spec.ts', import.meta.url), 'utf8');
    expect(specSelf).toMatch(/from '\.\/run\.js'/);
    const cleanupSrc = readFileSync(new URL('./cleanup.mjs', import.meta.url), 'utf8');
    expect(cleanupSrc).toMatch(/from '\.\/run\.ts'/);
  });
});

describe('CP-7 linked rows are never updated (PLAN §2.9b point 1, scenarios 30-30f)', () => {
  it('30: a room with a linked contract is excluded from updateMany and reported as skipped', async () => {
    const log = makeLog({ rooms: [1, 2] });
    const { db, calls } = fakeCleanupDb([
      { id: 100, code: 'HD000001', roomId: 1, buildingId: 999, tenantId: 999, createdById: 999, viewingId: null, invoices: 0 },
    ]);
    const skipped = await cleanupRun(db, log);
    const roomCall = calls.updateMany.find((c) => c.table === 'rooms')!;
    expect((roomCall.args as { where: { id: { in: number[] } } }).where.id.in).toEqual([2]);
    expect(skipped).toEqual([{ table: 'rooms', id: 1, reason: 'hợp đồng HD000001' }]);
  });

  it('30b: when every id of a table is linked, that table gets no updateMany call at all', async () => {
    const log = makeLog({ rooms: [1] });
    const { db, calls } = fakeCleanupDb([
      { id: 100, code: 'HD000001', roomId: 1, buildingId: 999, tenantId: 999, createdById: 999, viewingId: null, invoices: 0 },
    ]);
    await cleanupRun(db, log);
    expect(calls.updateMany.find((c) => c.table === 'rooms')).toBeUndefined();
  });

  it('30c: a service in contract_services and a tenant are both skipped; session is not touched for that user', async () => {
    const log = makeLog({ services: [5], users: [10] });
    const { db, calls } = fakeCleanupDb(
      [{ id: 100, code: 'HD000002', roomId: 999, buildingId: 999, tenantId: 10, createdById: 999, viewingId: null, invoices: 2 }],
      [{ serviceId: 5, contractCode: 'HD000002' }],
    );
    const skipped = await cleanupRun(db, log);
    expect(skipped).toEqual(expect.arrayContaining([
      { table: 'services', id: 5, reason: 'hợp đồng HD000002' },
      { table: 'users', id: 10, reason: 'hợp đồng HD000002 + 2 hóa đơn' },
    ]));
    expect(calls.updateMany.find((c) => c.table === 'services')).toBeUndefined();
    expect(calls.updateMany.find((c) => c.table === 'users')).toBeUndefined();
    expect(calls.updateMany.find((c) => c.table === 'session')).toBeUndefined();
    const serviceReason = skipped.find((s) => s.table === 'services')!.reason;
    // reason names the contract by its code (HD000002), never by the internal numeric contract id (100)
    expect(serviceReason).not.toContain('100');
    expect(serviceReason).toContain('HD000002');
  });

  it('30d: a logged viewing whose contract is outside the log is still skipped (viewing branch)', async () => {
    const log = makeLog({ viewings: [7] });
    const { db, calls } = fakeCleanupDb([
      { id: 100, code: 'HD000003', roomId: 999, buildingId: 999, tenantId: 999, createdById: 999, viewingId: 7, invoices: 0 },
    ]);
    const skipped = await cleanupRun(db, log);
    expect(skipped).toEqual([{ table: 'viewings', id: 7, reason: 'hợp đồng HD000003' }]);
    expect(calls.updateMany.find((c) => c.table === 'viewings')).toBeUndefined();
    expect(db.contract.findMany).toHaveBeenCalledTimes(1);
    expect(db.contractService.findMany).toHaveBeenCalledTimes(1);
  });

  it('30d2: a test manager who only created a contract (createdById) is skipped, session untouched', async () => {
    const log = makeLog({ users: [20] });
    const { db, calls } = fakeCleanupDb([
      { id: 100, code: 'HD000004', roomId: 999, buildingId: 999, tenantId: 999, createdById: 20, viewingId: null, invoices: 0 },
    ]);
    const skipped = await cleanupRun(db, log);
    expect(skipped).toEqual([{ table: 'users', id: 20, reason: 'hợp đồng HD000004' }]);
    expect(calls.updateMany.find((c) => c.table === 'users')).toBeUndefined();
    expect(calls.updateMany.find((c) => c.table === 'session')).toBeUndefined();
  });

  it('30e: linkedRows for one log makes exactly 2 read calls, even with viewing+createdById both matching', async () => {
    const log = makeLog({ viewings: [7], users: [20], rooms: [1] });
    const { db, calls } = fakeCleanupDb([
      { id: 100, code: 'HD000005', roomId: 1, buildingId: 999, tenantId: 999, createdById: 20, viewingId: 7, invoices: 0 },
    ]);
    await linkedRows(db, log);
    expect(db.contract.findMany).toHaveBeenCalledTimes(1);
    expect(db.contractService.findMany).toHaveBeenCalledTimes(1);
    expect(calls.updateMany).toHaveLength(0);
  });

  it('30f: list mode (linkedRows directly) and cleanupRun (SkippedRow[]) agree on the same set and reasons', async () => {
    const log = makeLog({ rooms: [1, 2], users: [20] });
    const contracts: FakeContractRow[] = [
      { id: 100, code: 'HD000006', roomId: 1, buildingId: 999, tenantId: 999, createdById: 20, viewingId: null, invoices: 0 },
    ];
    const { db: listDb } = fakeCleanupDb(contracts);
    const listLinked = await linkedRows(listDb, log);
    const { db: applyDb } = fakeCleanupDb(contracts);
    const applySkipped = await cleanupRun(applyDb, log);
    const normalize = (rows: SkippedRow[]) => [...rows].sort((a, b) => a.id - b.id);
    expect(normalize(listLinked)).toEqual(normalize(applySkipped));
  });
});

describe('CP-7 planCleanup heading and skippedReport output (scenarios 31-33c)', () => {
  it('31: the exact heading "Có hợp đồng/hóa đơn liên kết – không xử lý" appears once, linked rows only under it', () => {
    const log = makeLog({ rooms: [1, 2] });
    const facts: CleanupFacts = {
      ids: { rooms: [
        { id: 1, isActive: true, linked: ['hợp đồng HD000007'] },
        { id: 2, isActive: true, linked: [] },
      ] },
      unlogged: [],
    };
    const lines = planCleanup(log, facts);
    expect(lines.filter((l) => l === LINKED_TITLE)).toHaveLength(1);
    expect(LINKED_TITLE).toBe('Có hợp đồng/hóa đơn liên kết – không xử lý');
    const titleIndex = lines.indexOf(LINKED_TITLE);
    expect(lines[titleIndex + 1]).toContain('#1');
    expect(lines.some((l) => l.includes('#2') && l.includes('HD000007'))).toBe(false);
  });

  it('31b: no linked rows -> the heading is not printed', () => {
    const log = makeLog({ rooms: [1] });
    const facts: CleanupFacts = { ids: { rooms: [{ id: 1, isActive: true, linked: [] }] }, unlogged: [] };
    expect(planCleanup(log, facts)).not.toContain(LINKED_TITLE);
  });

  it('31c: the unlogged section and the linked section are separate, no row printed twice', () => {
    const log = makeLog({ rooms: [1] });
    const facts: CleanupFacts = {
      ids: { rooms: [{ id: 1, isActive: true, linked: ['hợp đồng HD000008'] }] },
      unlogged: [{ table: 'rooms', id: 99, name: '[E2E stray room]' }],
    };
    const lines = planCleanup(log, facts);
    expect(lines.filter((l) => l.includes('#99'))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('#1'))).toHaveLength(1);
    expect(lines.some((l) => l.includes('#99') && l.includes('HD000008'))).toBe(false);
  });

  it('32: skippedReport groups by table, lists id + reason per line and a matching total', () => {
    const skipped: SkippedRow[] = [
      { table: 'rooms', id: 1, reason: 'hợp đồng HD000009' },
      { table: 'users', id: 20, reason: 'hợp đồng HD000009' },
    ];
    const lines = skippedReport(skipped);
    expect(lines[0]).toBe(LINKED_TITLE);
    expect(lines.some((l) => l.includes('#1') && l.includes('HD000009'))).toBe(true);
    expect(lines.some((l) => l.includes('#20') && l.includes('HD000009'))).toBe(true);
    expect(lines.at(-1)).toBe(`Bỏ qua ${skipped.length} bản ghi`);
  });

  it('32b: no skipped rows -> skippedReport returns an empty array (nothing to print)', () => {
    expect(skippedReport([])).toEqual([]);
  });

  it('33: skipped rows remain -> the caller must finish FAILED_CLEANUP, never CLEANED', async () => {
    const dir = tmpRunsDir();
    const run = new E2eRun('20261101T1200-SKIP', dir);
    run.record('rooms', 1);
    const { db } = fakeCleanupDb([
      { id: 100, code: 'HD000010', roomId: 1, buildingId: 999, tenantId: 999, createdById: 999, viewingId: null, invoices: 0 },
    ]);
    const skipped = await cleanupRun(db, run.log);
    expect(skipped).toHaveLength(1);
    run.finish(skipped.length === 0 ? 'CLEANED' : 'FAILED_CLEANUP');
    expect(run.log.status).toBe('FAILED_CLEANUP');
    const onDisk = JSON.parse(readFileSync(join(dir, `${run.runId}.json`), 'utf8')) as E2eRunLog;
    expect(onDisk.status).toBe('FAILED_CLEANUP');
  });

  it('33b: no skipped rows, no step errors -> finish(CLEANED), endedAt filled', async () => {
    const dir = tmpRunsDir();
    const run = new E2eRun('20261101T1200-CLEAN', dir);
    run.record('rooms', 1);
    const { db } = fakeCleanupDb([]);
    const skipped = await cleanupRun(db, run.log);
    expect(skipped).toHaveLength(0);
    run.finish('CLEANED');
    expect(run.log.status).toBe('CLEANED');
    expect(run.log.endedAt).not.toBeNull();
  });

  it('33c: a step error and a skipped row together -> AggregateError carries both .errors and .skipped', async () => {
    const log = makeLog({ rooms: [1, 2], buildings: [3] });
    const { db } = fakeCleanupDb([
      { id: 100, code: 'HD000011', roomId: 1, buildingId: 999, tenantId: 999, createdById: 999, viewingId: null, invoices: 0 },
    ]);
    db.building.updateMany = vi.fn(async () => { throw new Error('building failed'); });
    let caught: unknown;
    try {
      await cleanupRun(db, log);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(1);
    const skipped = (caught as AggregateError & { skipped: SkippedRow[] }).skipped;
    expect(skipped).toEqual([{ table: 'rooms', id: 1, reason: 'hợp đồng HD000011' }]);
  });
});

describe('CP-7 six accepted deviations (PLAN §2.9c, scenario 34)', () => {
  it('34a: readAllLogs returns CLEANED logs too, readLogs filters them out', () => {
    const dir = tmpRunsDir();
    const cleaned = new E2eRun('20261101T1200-C1', dir);
    cleaned.finish('CLEANED');
    const running = new E2eRun('20261101T1200-R1', dir);
    expect(readAllLogs(dir).map((l) => l.runId).sort()).toEqual(['20261101T1200-C1', '20261101T1200-R1']);
    expect(readLogs(dir).map((l) => l.runId)).toEqual([running.runId]);
  });

  it('34b: new E2eRun(existingRunId) loads the existing ids, does not overwrite them', () => {
    const dir = tmpRunsDir();
    const first = new E2eRun('20261101T1200-KEEP', dir);
    first.record('rooms', 42);
    const reloaded = new E2eRun('20261101T1200-KEEP', dir);
    expect(reloaded.log.ids.rooms).toEqual([42]);
  });

  it('34c: E2E_TABLES is exported and matches the keys of ids', () => {
    const log = makeLog({});
    expect([...E2E_TABLES].sort()).toEqual(Object.keys(log.ids).sort());
  });

  it('34d: planCleanup prints the unlogged section exactly once', () => {
    const log = makeLog({});
    const facts: CleanupFacts = { ids: {}, unlogged: [{ table: 'rooms', id: 5, name: '[E2E stray]' }] };
    const lines = planCleanup(log, facts);
    expect(lines.filter((l) => l.includes('#5'))).toHaveLength(1);
  });

  it('34e: e2eServiceName counts code points, not UTF-16 code units', () => {
    // astral character (surrogate pair, 2 UTF-16 units but 1 code point)
    const astral = '\u{1F600}'; // 1 code point, 2 UTF-16 units
    const body = astral.repeat(22); // name = "[E2E] " (6) + 22 code points = 28 <= 50
    expect(() => e2eServiceName(body)).not.toThrow();
    const over = astral.repeat(45); // 6 + 45 = 51 code points > 50
    expect(() => e2eServiceName(over)).toThrow(/50/);
  });
});
