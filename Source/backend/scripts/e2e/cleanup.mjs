// BE-P2-09 · CLI dọn dữ liệu thử [E2E. Run from Source/backend (RUNS_DIR is relative to cwd).
// Default: LIST only, writes nothing. `--apply <runId>`: cleans that one run's logged ids.
// Only the main session runs --apply, and only after the owner has seen the list.
// Imports './run.ts' with the real .ts extension: Node runs this file directly, without tsc,
// so the NodeNext '.js' rule does not apply here.
import { PrismaClient } from '@prisma/client';
import { E2E_PREFIX, E2E_TABLES, E2eRun, cleanupRun, linkedRows, planCleanup, readAllLogs, readLogs, skippedReport } from './run.ts';

// Rows still in the DB as { id, isActive }. isActive for viewings/prices/plans is the status cleanupRun would change.
const READERS = {
  buildings: async (db, where) => db.building.findMany({ where, select: { id: true, isActive: true } }),
  rooms: async (db, where) => db.room.findMany({ where, select: { id: true, isActive: true } }),
  services: async (db, where) => db.service.findMany({ where, select: { id: true, isActive: true } }),
  users: async (db, where) => db.user.findMany({ where, select: { id: true, isActive: true } }),
  room_prices: async (db, where) => (await db.roomPrice.findMany({ where, select: { id: true, status: true } }))
    .map((r) => ({ id: r.id, isActive: r.status === 'PENDING' })),
  rate_plans: async (db, where) => (await db.ratePlan.findMany({ where, select: { id: true, status: true } }))
    .map((r) => ({ id: r.id, isActive: r.status === 'PENDING' })),
  viewings: async (db, where) => (await db.viewing.findMany({ where, select: { id: true, status: true } }))
    .map((r) => ({ id: r.id, isActive: r.status === 'NEW' || r.status === 'CONFIRMED' })),
};

// Rows named [E2E that may be in no log (report only).
const NAMED = {
  buildings: async (db) => (await db.building.findMany({ where: { name: { contains: E2E_PREFIX } }, select: { id: true, name: true } }))
    .map((r) => ({ id: r.id, name: r.name })),
  services: async (db) => (await db.service.findMany({ where: { name: { contains: E2E_PREFIX } }, select: { id: true, name: true } }))
    .map((r) => ({ id: r.id, name: r.name })),
  users: async (db) => (await db.user.findMany({ where: { fullName: { contains: E2E_PREFIX } }, select: { id: true, fullName: true } }))
    .map((r) => ({ id: r.id, name: r.fullName })),
  viewings: async (db) => (await db.viewing.findMany({ where: { guestName: { contains: E2E_PREFIX } }, select: { id: true, guestName: true } }))
    .map((r) => ({ id: r.id, name: r.guestName })),
};

// Same linkedRows as --apply, so the list and the apply skip the same rows.
async function factsFor(db, logs) {
  const linked = new Map(); // `${table}:${id}` → reason
  for (const log of logs) {
    for (const row of await linkedRows(db, log)) linked.set(`${row.table}:${row.id}`, row.reason);
  }
  const ids = {};
  for (const table of Object.keys(READERS)) {
    const list = [...new Set(logs.flatMap((log) => log.ids[table]))];
    if (list.length === 0) continue;
    ids[table] = (await READERS[table](db, { id: { in: list } })).map((r) => {
      const reason = linked.get(`${table}:${r.id}`);
      return { id: r.id, isActive: r.isActive, linked: reason ? [reason] : [] };
    });
  }
  return ids;
}

async function unloggedFor(db, allLogs) {
  const unlogged = [];
  for (const [table, find] of Object.entries(NAMED)) {
    const logged = new Set(allLogs.flatMap((log) => log.ids[table]));
    for (const row of await find(db)) {
      if (!logged.has(row.id)) unlogged.push({ table, id: row.id, name: row.name });
    }
  }
  return unlogged;
}

function printSkipped(skipped) {
  const report = skippedReport(skipped);
  if (report.length > 0) console.log(report.join('\n'));
}

async function run(db) {
  const applyAt = process.argv.indexOf('--apply');
  if (applyAt !== -1) {
    const runId = process.argv[applyAt + 1];
    const log = readLogs().find((l) => l.runId === runId);
    if (!log) throw new Error(`Không có nhật ký chưa dọn nào tên "${runId}". Chạy không tham số để xem danh sách.`);
    const e2eRun = new E2eRun(log.runId);
    let skipped = [];
    try {
      skipped = await cleanupRun(db, log);
    } catch (error) {
      printSkipped(error?.skipped ?? []);
      e2eRun.finish('FAILED_CLEANUP');
      throw error;
    }
    printSkipped(skipped);
    // Any skipped row keeps the run in FAILED_CLEANUP, so it stays in the list (PLAN 2.9b point 4).
    e2eRun.finish(skipped.length === 0 ? 'CLEANED' : 'FAILED_CLEANUP');
    console.log(skipped.length === 0
      ? `Đã dọn nhật ký ${log.runId}.`
      : `Nhật ký ${log.runId} còn ${skipped.length} bản ghi bị bỏ qua, giữ FAILED_CLEANUP.`);
    return;
  }

  const pending = readLogs();
  const unlogged = await unloggedFor(db, readAllLogs());
  if (pending.length === 0 && unlogged.length === 0) {
    console.log('Không có nhật ký nào chưa dọn và không có bản ghi [E2E lạ.');
    return;
  }
  const ids = await factsFor(db, pending);
  // Unlogged rows are printed once, under the first log.
  const shown = pending.length > 0 ? pending : [{
    runId: '(không có nhật ký)', startedAt: '-', endedAt: null, status: 'CLEANED', buildingCodes: [],
    ids: Object.fromEntries(E2E_TABLES.map((table) => [table, []])),
  }];
  shown.forEach((log, i) => {
    console.log(planCleanup(log, { ids, unlogged: i === 0 ? unlogged : [] }).join('\n'));
  });
}

async function main() {
  const db = new PrismaClient();
  try {
    await run(db);
  } finally {
    await db.$disconnect();
  }
}

// `import.meta.main` (Node >= 24.2) as in prisma/seed.ts.
if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
