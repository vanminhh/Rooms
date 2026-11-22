// BE-P2-09 · e2e runner helpers: runId, names, unique codes and phones, run log, cleanup.
// No DB calls here: cleanup.mjs reads the DB and passes the facts in. Only the run log file is written.
// cleanup.mjs loads this file with plain Node type stripping: no enums, no parameter properties.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomInt } from 'node:crypto';
import { join } from 'node:path';
import type { Prisma, PrismaClient } from '@prisma/client';

export type E2eTable = 'buildings' | 'rooms' | 'services' | 'users'
                     | 'room_prices' | 'rate_plans' | 'viewings' | 'room_images';

export const E2E_TABLES: readonly E2eTable[] = [
  'buildings', 'rooms', 'services', 'users', 'room_prices', 'rate_plans', 'viewings', 'room_images',
];

export interface E2eRunLog {
  runId: string; startedAt: string; endedAt: string | null;
  status: 'RUNNING' | 'CLEANED' | 'FAILED_CLEANUP';
  kind?: 'contracts';
  buildingCodes: string[]; ids: Record<E2eTable, number[]>;
}

export const E2E_PREFIX = '[E2E';
export const CLEANUP_NOTE = '[E2E] dọn dữ liệu thử';
export const E2E_PLATE_PREFIX = 'E2';
export const RUNS_DIR = 'test/e2e-runs';

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DIGITS = '0123456789';
const SEED_PHONES = ['0900000001', '0900000002', '0900000003', '0900000004', '0900000005'];
const MAX_TRIES = 20;
const HANOI_OFFSET_MS = 7 * 3600_000; // UTC+7, no DST

function randomChars(alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

// Hà Nội time, minute precision: '20261101T1245-A7KQ'. `rand` returns only the 4-char random part.
export function newRunId(now: Date = new Date(), rand: () => string = () => randomChars(ALNUM, 4)): string {
  const iso = new Date(now.getTime() + HANOI_OFFSET_MS).toISOString();
  return `${iso.slice(0, 10).replaceAll('-', '')}T${iso.slice(11, 13)}${iso.slice(14, 16)}-${rand()}`;
}

export function e2eName(runId: string, what: string): string {
  return `[E2E ${runId}] ${what}`;
}

export function contractFixtureTerms(runId: string): string {
  return e2eName(runId, 'Contract fixture');
}

// services.name is VARCHAR(50): too long throws, it is never cut.
export function e2eServiceName(what: string): string {
  const name = `[E2E] ${what}`;
  if (Array.from(name).length > 50) throw new Error(`Service name over 50 characters: "${name}"`);
  return name;
}

// In memory only, never written to the run log.
export function randomPassword(): string {
  return randomBytes(12).toString('base64url');
}

export async function uniqueBuildingCode(
  exists: (code: string) => Promise<boolean>,
  rand: () => string = () => randomChars(ALNUM, 4),
): Promise<string> {
  for (let i = 0; i < MAX_TRIES; i++) {
    const code = `E2${rand()}`;
    if (!(await exists(code))) return code;
  }
  throw new Error(`No free e2e building code after ${MAX_TRIES} tries`);
}

export async function uniquePhone(
  exists: (phone: string) => Promise<boolean>,
  rand: () => string = () => randomChars(DIGITS, 8),
): Promise<string> {
  for (let i = 0; i < MAX_TRIES; i++) {
    const phone = `09${rand()}`;
    if (SEED_PHONES.includes(phone)) continue; // seed accounts are never touched, so no DB check
    if (!(await exists(phone))) return phone;
  }
  throw new Error(`No free e2e phone after ${MAX_TRIES} tries`);
}

export async function uniqueVehiclePlate(exists: (plate: string) => Promise<boolean>): Promise<string> {
  for (let i = 0; i < MAX_TRIES; i++) {
    const plate = E2E_PLATE_PREFIX + randomBytes(6).toString('hex').toUpperCase();
    if (!(await exists(plate))) return plate;
  }
  throw new Error(`No free e2e vehicle plate after ${MAX_TRIES} tries`);
}

function emptyIds(): Record<E2eTable, number[]> {
  return {
    buildings: [], rooms: [], services: [], users: [],
    room_prices: [], rate_plans: [], viewings: [], room_images: [],
  };
}

export function logPath(runId: string, dir: string = RUNS_DIR): string {
  return join(dir, `${runId}.json`);
}

const LOG_KEYS = ['runId', 'startedAt', 'endedAt', 'status', 'buildingCodes', 'ids'];

function isRunLog(value: unknown): value is E2eRunLog {
  if (typeof value !== 'object' || value === null) return false;
  const log = value as Record<string, unknown>;
  if (!LOG_KEYS.every((key) => key in log) || typeof log.status !== 'string') return false;
  const ids = log.ids;
  if (typeof ids !== 'object' || ids === null) return false;
  return typeof log.runId === 'string'
    && E2E_TABLES.every((table) => Array.isArray((ids as Record<string, unknown>)[table]));
}

export class E2eRun {
  readonly runId: string;
  readonly log: E2eRunLog;
  private readonly file: string;

  // An existing log for this runId is loaded, not overwritten (cleanup.mjs finishes old runs this way).
  constructor(runId: string = newRunId(), dir: string = RUNS_DIR, kind?: E2eRunLog['kind']) {
    this.runId = runId;
    this.file = logPath(runId, dir);
    mkdirSync(dir, { recursive: true });
    this.log = existsSync(this.file)
      ? (JSON.parse(readFileSync(this.file, 'utf8')) as E2eRunLog)
      : {
          runId, startedAt: new Date().toISOString(), endedAt: null,
          status: 'RUNNING', kind, buildingCodes: [], ids: emptyIds(),
        };
    this.save();
  }

  record(table: E2eTable, id: number): void {
    if (!this.log.ids[table].includes(id)) this.log.ids[table].push(id);
    this.save();
  }

  recordBuildingCode(code: string): void {
    if (!this.log.buildingCodes.includes(code)) this.log.buildingCodes.push(code);
    this.save();
  }

  finish(status: 'CLEANED' | 'FAILED_CLEANUP'): void {
    this.log.status = status;
    this.log.endedAt = new Date().toISOString();
    this.save();
  }

  private save(): void {
    writeFileSync(this.file, `${JSON.stringify(this.log, null, 2)}\n`);
  }
}

// Every log, including CLEANED ones (cleanup.mjs needs them to tell logged rows from unlogged ones).
export function readAllLogs(dir: string = RUNS_DIR): E2eRunLog[] {
  if (!existsSync(dir)) return [];
  const logs: E2eRunLog[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    const file = join(dir, name);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      parsed = null;
    }
    if (isRunLog(parsed)) logs.push(parsed);
    else console.error(`Nhật ký hỏng, bỏ qua: ${file}`);
  }
  return logs;
}

export function readLogs(dir: string = RUNS_DIR): E2eRunLog[] {
  return readAllLogs(dir).filter((log) => log.status !== 'CLEANED');
}

export type E2eCleanupDb = Pick<PrismaClient,
  'viewing' | 'roomPrice' | 'ratePlan' | 'room' | 'service' | 'building' | 'user' | 'session'
  | 'contract' | 'contractService' | 'vehicle' | 'invoice'>;

// Rows with a contract, invoice or contract link: never updated (PLAN 2.9b). reason is shown to the owner.
export interface SkippedRow { table: E2eTable; id: number; reason: string }

export const LINKED_TITLE = 'Có hợp đồng/hóa đơn liên kết – không xử lý';

function contractFixtureWhere(log: E2eRunLog): Prisma.ContractWhereInput {
  const prefix = e2eName(log.runId, '');
  return {
    terms: contractFixtureTerms(log.runId),
    buildingId: { in: log.ids.buildings }, building: { name: { startsWith: prefix }, code: { in: log.buildingCodes } },
    roomId: { in: log.ids.rooms },
    createdById: { in: log.ids.users }, createdBy: { fullName: { startsWith: prefix } },
    tenantId: { in: log.ids.users }, tenant: { fullName: { startsWith: prefix } },
    previousContractId: null, nextContract: null,
    signedAt: null, movedInAt: null, signedScanAssetId: null,
    // BE-P4-13: a fixture may carry MONTHLY drafts of its own; they must be cancelled by this cleanup first.
    invoices: { every: { type: 'MONTHLY', status: 'CANCELLED', cancelReason: CLEANUP_NOTE } },
    services: { every: { serviceId: { in: log.ids.services } } },
    vehicles: { every: { plate: { startsWith: E2E_PLATE_PREFIX },
      buildingId: { in: log.ids.buildings }, serviceId: { in: log.ids.services } } },
    OR: [{ viewing: null }, { viewing: { id: { in: log.ids.viewings } } }],
    depositCancelledViewings: { every: { id: { in: log.ids.viewings } } },
  };
}

// BE-P3-12 / G-05. The test's transaction locks the fixture rooms before this step.
// Keep the contract, signer, service links and audit history.
export async function cleanupContractRun(tx: E2eCleanupDb, log: E2eRunLog, removedOn: Date): Promise<SkippedRow[]> {
  if (log.kind !== 'contracts') throw new Error('Expected a contracts e2e run');
  const where = { ...contractFixtureWhere(log), status: 'HOLD' as const };
  // BE-P4-13: cancel the fixture's own MONTHLY drafts, only on contracts whose every invoice is such a draft or already retired.
  const drafted = await tx.contract.findMany({ where: { ...where, invoices: { every: { type: 'MONTHLY', OR: [
    { status: 'DRAFT' }, { status: 'CANCELLED', cancelReason: CLEANUP_NOTE }] } } }, select: { id: true } });
  if (drafted.length > 0) {
    await tx.invoice.updateMany({ where: { contractId: { in: drafted.map(c => c.id) }, type: 'MONTHLY', status: 'DRAFT' },
      data: { status: 'CANCELLED', cancelReason: CLEANUP_NOTE } });
  }
  const contracts = await tx.contract.findMany({ where, select: { id: true, createdById: true } });
  for (const contract of contracts) {
    const result = await tx.contract.updateMany({
      where: { ...where, id: contract.id }, data: { status: 'CANCELLED', cancelReason: CLEANUP_NOTE },
    });
    if (result.count !== 1) throw new Error(`Contract fixture ${contract.id} changed during cleanup`);
    await tx.vehicle.updateMany({ where: { contractId: contract.id, plate: { startsWith: E2E_PLATE_PREFIX },
      buildingId: { in: log.ids.buildings }, serviceId: { in: log.ids.services }, isActive: true },
      data: { isActive: false, removedAt: removedOn } });
    await tx.viewing.updateMany({
      where: { id: { in: log.ids.viewings }, depositCancelledByContractId: contract.id, calledAt: null },
      data: { calledById: contract.createdById, calledAt: new Date() },
    });
  }
  return cleanupRun(tx, log);
}

// Called by cleanupRun and by the list mode of cleanup.mjs, so both agree.
// A viewing counts as linked through the contract that holds it, even if that contract is outside the log.
export async function linkedRows(
  db: Pick<PrismaClient, 'contract' | 'contractService' | 'vehicle'>, log: E2eRunLog,
): Promise<SkippedRow[]> {
  const { rooms, buildings, users, services, viewings } = log.ids;
  const retired = log.kind === 'contracts' ? await db.contract.findMany({
    where: {
      ...contractFixtureWhere(log), status: 'CANCELLED', cancelReason: CLEANUP_NOTE,
      AND: { depositCancelledViewings: { none: { calledAt: null } } },
    }, select: { id: true },
  }) : [];
  const protectedContract = retired.length === 0 ? {} : { id: { notIn: retired.map(contract => contract.id) } };
  const contracts = await db.contract.findMany({
    where: { ...protectedContract, OR: [
      { roomId: { in: rooms } }, { buildingId: { in: buildings } },
      { tenantId: { in: users } }, { createdById: { in: users } },
      { viewing: { id: { in: viewings } } },
      { depositCancelledViewings: { some: { id: { in: viewings } } } },
    ] },
    select: {
      id: true, code: true, roomId: true, buildingId: true, tenantId: true, createdById: true,
      viewing: { select: { id: true } }, depositCancelledViewings: { where: { id: { in: viewings } }, select: { id: true } },
      _count: { select: { invoices: true } },
    },
  });
  const found = new Map<string, { table: E2eTable; id: number; reasons: string[] }>();
  const link = (table: E2eTable, id: number, reason: string): void => {
    const key = `${table}:${id}`;
    const row = found.get(key) ?? { table, id, reasons: [] };
    if (!row.reasons.includes(reason)) row.reasons.push(reason);
    found.set(key, row);
  };
  for (const c of contracts) {
    const invoices = c._count.invoices;
    const reason = `hợp đồng ${c.code}${invoices > 0 ? ` + ${invoices} hóa đơn` : ''}`;
    if (rooms.includes(c.roomId)) link('rooms', c.roomId, reason);
    if (buildings.includes(c.buildingId)) link('buildings', c.buildingId, reason);
    if (users.includes(c.tenantId)) link('users', c.tenantId, reason);
    if (users.includes(c.createdById)) link('users', c.createdById, reason);
    if (c.viewing && viewings.includes(c.viewing.id)) link('viewings', c.viewing.id, reason);
    for (const viewing of c.depositCancelledViewings) link('viewings', viewing.id, reason);
  }
  const serviceLinks = await db.contractService.findMany({
    where: { serviceId: { in: services }, contract: protectedContract }, select: { serviceId: true, contract: { select: { code: true } } },
  });
  for (const s of serviceLinks) link('services', s.serviceId, `hợp đồng ${s.contract.code}`);
  // Parking links live on vehicles, not contract_services. Preserve catalog
  // services used by any protected contract, including historical vehicles.
  const vehicleLinks = services.length ? await db.vehicle.findMany({
    where: { serviceId: { in: services }, contract: protectedContract },
    select: { serviceId: true, contract: { select: { code: true } } },
  }) : [];
  for (const vehicle of vehicleLinks) link('services', vehicle.serviceId, `hợp đồng ${vehicle.contract.code}`);
  return [...found.values()].map((row) => ({ table: row.table, id: row.id, reason: row.reasons.join('; ') }));
}

// Each step touches only ids from the log minus the skipped rows. A failing step does not stop the others;
// the errors are thrown together at the end as an AggregateError that also carries the skipped rows.
export async function cleanupRun(db: E2eCleanupDb, log: E2eRunLog): Promise<SkippedRow[]> {
  const skipped = await linkedRows(db, log);
  const skip = new Set(skipped.map((row) => `${row.table}:${row.id}`));
  const ids = Object.fromEntries(E2E_TABLES.map((table) => [
    table, log.ids[table].filter((id) => !skip.has(`${table}:${id}`)),
  ])) as Record<E2eTable, number[]>;
  const now = new Date();
  const steps: [E2eTable, () => Promise<unknown>][] = [
    ['viewings', () => db.viewing.updateMany({
      where: { id: { in: ids.viewings }, status: { in: ['NEW', 'CONFIRMED'] } },
      data: { status: 'CANCELLED', outcomeNote: CLEANUP_NOTE },
    })],
    ['room_prices', () => db.roomPrice.updateMany({
      where: { id: { in: ids.room_prices }, status: 'PENDING' },
      data: { status: 'REJECTED', reviewNote: CLEANUP_NOTE },
    })],
    ['rate_plans', () => db.ratePlan.updateMany({
      where: { id: { in: ids.rate_plans }, status: 'PENDING' },
      data: { status: 'REJECTED', reviewNote: CLEANUP_NOTE },
    })],
    ['rooms', () => db.room.updateMany({ where: { id: { in: ids.rooms } }, data: { isActive: false } })],
    ['services', () => db.service.updateMany({ where: { id: { in: ids.services } }, data: { isActive: false } })],
    ['buildings', () => db.building.updateMany({ where: { id: { in: ids.buildings } }, data: { isActive: false } })],
    ['users', async () => {
      await db.user.updateMany({ where: { id: { in: ids.users } }, data: { isActive: false } });
      await db.session.updateMany({
        where: { userId: { in: ids.users }, revokedAt: null },
        data: { revokedAt: now },
      });
    }],
  ];

  const errors: unknown[] = [];
  for (const [table, step] of steps) {
    if (ids[table].length === 0) continue;
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw Object.assign(
      new AggregateError(errors, `cleanup of ${log.runId} failed in ${errors.length} step(s)`),
      { skipped },
    );
  }
  return skipped;
}

// Facts read by cleanup.mjs. `linked` holds the linkedRows reason of the row (contract code), same text as --apply.
export interface CleanupFacts {
  ids: Partial<Record<E2eTable, { id: number; isActive: boolean; linked: string[] }[]>>;
  unlogged: { table: E2eTable; id: number; name: string }[];
}

// Pure: lists what --apply would do for one log, in Vietnamese for the owner. Writes nothing.
export function planCleanup(log: E2eRunLog, facts: CleanupFacts): string[] {
  const lines = [`Nhật ký ${log.runId} · ${log.status} · bắt đầu ${log.startedAt}`];
  const linkedLines: string[] = [];
  for (const table of E2E_TABLES) {
    for (const id of log.ids[table]) {
      if (table === 'room_images') {
        lines.push(`  ${table} #${id}: giữ nguyên (lịch sử)`);
        continue;
      }
      const row = facts.ids[table]?.find((r) => r.id === id);
      if (!row) {
        lines.push(`  ${table} #${id}: không còn trong DB`);
        continue;
      }
      if (row.linked.length > 0) {
        const state = row.isActive ? 'còn mở' : 'đã dọn hoặc đã duyệt';
        linkedLines.push(`  ${table} #${id}: ${state} · đang dính ${row.linked.join(', ')}`);
        continue;
      }
      lines.push(`  ${table} #${id}: ${row.isActive ? 'còn mở → sẽ dọn' : 'đã dọn hoặc đã duyệt → giữ nguyên'}`);
    }
  }
  if (linkedLines.length > 0) lines.push(LINKED_TITLE, ...linkedLines);
  if (facts.unlogged.length > 0) {
    lines.push('Bản ghi tên [E2E không nằm trong nhật ký nào (chỉ báo, không xử lý):');
    for (const row of facts.unlogged) lines.push(`  ${row.table} #${row.id} "${row.name}"`);
  }
  return lines;
}

// --apply output: skipped rows grouped by table with ids and reasons, then the total. Empty when none skipped.
export function skippedReport(skipped: SkippedRow[]): string[] {
  if (skipped.length === 0) return [];
  const lines = [LINKED_TITLE];
  for (const table of E2E_TABLES) {
    const rows = skipped.filter((row) => row.table === table);
    if (rows.length === 0) continue;
    lines.push(`  ${table}`);
    for (const row of rows) lines.push(`    #${row.id} · ${row.reason}`);
  }
  lines.push(`Bỏ qua ${skipped.length} bản ghi`);
  return lines;
}
