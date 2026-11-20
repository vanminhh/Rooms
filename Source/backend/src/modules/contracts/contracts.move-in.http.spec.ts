import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { MailerService } from '../mailer/mailer.service.js';

const roles = new Map<number, Role>([[1, 'BOSS'], [2, 'MANAGER'], [3, 'TENANT'], [4, 'GUEST'], [5, 'MANAGER']]);
const DATE = '2026-11-20';
const BODY = { electric: 1_290, water: 105, readOn: DATE };
const PRIVATE_SCAN = 'private-move-in-scan-fixture';

interface Reading {
  id: number;
  roomId: number;
  contractId: number | null;
  kind: 'ELECTRIC' | 'WATER';
  value: number;
  readOn: Date;
  isOpening: boolean;
  isMeterReplaced: boolean;
  oldMeterFinal: number | null;
  readById: number;
  note: string | null;
}

function initialState() {
  return {
    users: new Map([...roles].map(([id, role]) => [id, { id, role, isActive: true, mustChangePassword: false,
      passwordHash: `test-only-move-in-hash-${id}`, fullName: `Fixture ${id}`, phone: `090000000${id}` }])),
    buildings: new Map<number, any>([
      [7, { id: 7, managerId: 2, isActive: true, waterMode: 'PER_PERSON', code: 'CG01', name: 'Tòa A' }],
      [8, { id: 8, managerId: 5, isActive: true, waterMode: 'PER_M3', code: 'DD01', name: 'Tòa B' }],
    ]),
    contract: { id: 42, code: 'HD000042', roomId: 30, buildingId: 7, tenantId: 3,
      status: 'HOLD', signedAt: new Date('2026-11-19T03:00:00Z') as Date | null,
      movedInAt: null as Date | null, previousContractId: null as number | null,
      startDate: new Date(DATE), endDate: new Date('2027-02-19'), termMonths: 3,
      rent: 2_500_000, deposit: 2_500_000, signedScanAssetId: PRIVATE_SCAN,
      createdAt: new Date('2026-11-18T03:00:00Z') },
    invoices: [{ id: 70, contractId: 42, type: 'DEPOSIT', status: 'PAID', total: 2_500_000 }],
    readings: [] as Reading[],
    audits: [] as any[],
  };
}

const comparable = (value: any): any => value instanceof Date ? value.getTime() : value;

function scalarMatches(actual: any, expected: any): boolean {
  if (expected instanceof Date || expected === null || typeof expected !== 'object') {
    return comparable(actual) === comparable(expected);
  }
  return Object.entries(expected).every(([operator, value]: [string, any]) => {
    if (operator === 'equals') return scalarMatches(actual, value);
    if (operator === 'not') return !scalarMatches(actual, value);
    if (operator === 'in') return value.some((item: any) => scalarMatches(actual, item));
    if (operator === 'notIn') return !value.some((item: any) => scalarMatches(actual, item));
    if (actual === null || actual === undefined) return false;
    const left = comparable(actual);
    const right = comparable(value);
    if (operator === 'lt') return left < right;
    if (operator === 'lte') return left <= right;
    if (operator === 'gt') return left > right;
    if (operator === 'gte') return left >= right;
    throw new Error(`Unsupported scalar filter in move-in fixture: ${operator}`);
  });
}

function matches(row: any, where: any = {}): boolean {
  const group = (value: any): any[] => Array.isArray(value) ? value : [value];
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return group(value).every(item => matches(row, item));
    if (key === 'OR') return group(value).some(item => matches(row, item));
    if (key === 'NOT') return group(value).every(item => !matches(row, item));
    return scalarMatches(row[key], value);
  });
}

function ordered(rows: any[], orderBy: any): any[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      for (const [field, direction] of Object.entries(clause)) {
        const left = comparable(a[field]);
        const right = comparable(b[field]);
        if (left !== right) return (left < right ? -1 : 1) * (direction === 'desc' ? -1 : 1);
      }
    }
    return 0;
  });
}

// The fake exposes only fields in the service's actual Prisma SELECT.
function project(row: any, select: any): any {
  if (row === null || row === undefined) return row;
  if (Array.isArray(row)) return row.map(value => project(value, select));
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, value]: [string, any]) =>
    [key, value === true ? row[key] : project(row[key], value.select)]));
}

describe('BE-P3-20 / CON-10..11 / MTR-02..04/06: move-in over HTTP', () => {
  let app: INestApplication;
  let state = initialState();
  let queue = Promise.resolve();
  let reassignOnTransaction = false;
  let failAudit = false;
  let failWaterInsert = false;
  let conflictUpdate = false;
  const mailer = { send: vi.fn(async () => {}) };
  const contractRow = () => {
    const building = state.buildings.get(state.contract.buildingId);
    return { ...state.contract, building: { ...building, manager: state.users.get(building.managerId) ?? null },
      tenant: state.users.get(state.contract.tenantId), room: { id: 30, code: 'P301', buildingId: 7,
        building: { ...building, manager: state.users.get(building.managerId) ?? null } },
    };
  };
  const contractLookup = async ({ where, select }: any) => matches(state.contract, where) ? project(contractRow(), select) : null;
  const readingRows = ({ where, orderBy, select, take, skip = 0 }: any) => {
    const rows = ordered(state.readings.filter(row => matches(row, where)), orderBy);
    return rows.slice(skip, take === undefined ? undefined : skip + take).map(row => project(row, select));
  };
  const db: any = {
    user: { findUnique: vi.fn(async ({ where, select }: any) => project(state.users.get(where.id) ?? null, select)) },
    building: { findMany: vi.fn(async ({ where, select }: any) => [...state.buildings.values()]
      .filter(building => matches(building, where)).map(building => project(building, select))) },
    contract: {
      findUnique: vi.fn(contractLookup), findFirst: vi.fn(contractLookup),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (conflictUpdate || !matches(state.contract, where)) return { count: 0 };
        Object.assign(state.contract, data);
        return { count: 1 };
      }),
    },
    invoice: { findFirst: vi.fn(async ({ where, select, orderBy }: any) =>
      project(ordered(state.invoices.filter(invoice => matches(invoice, where)), orderBy)[0] ?? null, select)) },
    meterReading: {
      findFirst: vi.fn(async (args: any) => readingRows({ ...args, take: 1 })[0] ?? null),
      findMany: vi.fn(async (args: any) => readingRows(args)),
      create: vi.fn(async ({ data, select }: any) => {
        if (failWaterInsert && data.kind === 'WATER') throw new Error('BE-P3-20 simulated second reading failure');
        if (data.isOpening && state.readings.some(row => row.isOpening && row.contractId === data.contractId && row.kind === data.kind)) {
          throw Object.assign(new Error('Duplicate opening'), { code: 'P2002', meta: { target: ['contract_id', 'kind'] } });
        }
        const row = { id: 100 + state.readings.length, isOpening: false, isMeterReplaced: false,
          oldMeterFinal: null, note: null, ...data } as Reading;
        state.readings.push(row);
        return project(row, select);
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => {
      if (failAudit) throw new Error('BE-P3-20 simulated audit failure');
      state.audits.push(structuredClone(data));
      return data;
    }) },
    $queryRaw: vi.fn(async () => []),
  };
  // This serialized edge tests route rollback/concurrent behavior. It is not proof of PostgreSQL locks.
  db.$transaction = vi.fn((work: (tx: typeof db) => Promise<unknown>) => {
    const task = queue.then(async () => {
      if (reassignOnTransaction) { state.buildings.get(7).managerId = 5; reassignOnTransaction = false; }
      const before = structuredClone(state);
      try { return await work(db); } catch (error) { state = before; throw error; }
    });
    queue = task.then(() => {}, () => {});
    return task;
  });

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', 'test-only-move-in-http-0123456789abcdef');
    vi.stubEnv('MAIL_PROVIDER', '');
    vi.stubEnv('CCCD_KEY', Buffer.alloc(32, 61).toString('base64'));
    const { AppModule } = await import('../../app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db)
      .overrideProvider(MailerService).useValue(mailer).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
  });
  beforeEach(() => {
    state = initialState();
    queue = Promise.resolve();
    reassignOnTransaction = false;
    failAudit = false;
    failWaterInsert = false;
    conflictUpdate = false;
    vi.clearAllMocks();
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });

  async function moveIn(body: unknown = BODY, actor = 2, id: string | number = 42) {
    const token = await app.get(TokenService).signAccessToken({ id: actor, role: roles.get(actor)! });
    return request(app.getHttpServer()).post(`/api/v1/contracts/${id}/move-in`).set('Authorization', `Bearer ${token}`).send(body as object);
  }
  function reading(overrides: Partial<Reading> = {}) {
    const row: Reading = { id: 10 + state.readings.length, roomId: 30, contractId: 18, kind: 'ELECTRIC',
      value: 1_284, readOn: new Date('2026-11-19'), isOpening: false, isMeterReplaced: false,
      oldMeterFinal: null, readById: 2, note: null, ...overrides };
    state.readings.push(row);
    return row;
  }
  function noMoveInWrites() {
    expect(db.meterReading.create).not.toHaveBeenCalled();
    expect(db.contract.updateMany).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  }
  function rolledBack() {
    expect(state.contract.status).toBe('HOLD');
    expect(state.contract.movedInAt).toBeNull();
    expect(state.readings).toEqual([]);
    expect(state.audits).toEqual([]);
  }

  it('CON-10/MTR-06/AUD-01: paid signed HOLD records both PER_PERSON baselines and becomes ACTIVE atomically', async () => {
    const before = Date.now();
    const result = await moveIn();
    expect(result.status).toBe(201);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data).toMatchObject({ id: 42, code: 'HD000042', status: 'ACTIVE',
      readings: { electric: { value: 1_290, readOn: DATE }, water: { value: 105, readOn: DATE } } });
    expect(Date.parse(result.body.data.movedInAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(result.body.data.movedInAt)).toBeLessThanOrEqual(Date.now());
    expect(state.contract.status).toBe('ACTIVE');
    expect(state.readings).toHaveLength(2);
    expect(state.readings).toEqual(expect.arrayContaining([
      expect.objectContaining({ roomId: 30, contractId: 42, kind: 'ELECTRIC', value: 1_290, isOpening: true, readById: 2 }),
      expect.objectContaining({ roomId: 30, contractId: 42, kind: 'WATER', value: 105, isOpening: true, readById: 2 }),
    ]));
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ actorId: 2, action: 'contract.move_in', entity: 'contract', entityId: 42 });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('SCOPE-02: Boss moves in a contract managed by another staff member', async () => {
    state.buildings.get(7).managerId = 5;
    expect((await moveIn(BODY, 1)).status).toBe(201);
  });
  it.each(['UNPAID', 'DRAFT', 'CANCELLED', 'SETTLED'])('CON-10: %s deposit prevents move-in', async status => {
    state.invoices[0].status = status;
    const result = await moveIn();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('DEPOSIT_NOT_PAID');
    noMoveInWrites();
  });
  it('CON-10 acceptance: missing deposit invoice prevents move-in', async () => {
    state.invoices = [];
    const result = await moveIn();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('DEPOSIT_NOT_PAID');
    noMoveInWrites();
  });
  it('CON-10: a PAID invoice smaller than the required deposit is insufficient', async () => {
    state.invoices[0].total = 1_000_000;
    const result = await moveIn();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('DEPOSIT_NOT_PAID');
    noMoveInWrites();
  });
  it('CON-10 acceptance: zero deposit moves in without an invoice or payment', async () => {
    state.contract.deposit = 0;
    state.invoices = [];
    expect((await moveIn()).status).toBe(201);
    expect(db.invoice.findFirst).not.toHaveBeenCalled();
  });
  it('CON-10: an unsigned HOLD cannot move in', async () => {
    state.contract.signedAt = null;
    const result = await moveIn();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT_STATE');
    noMoveInWrites();
  });
  it.each(['ACTIVE', 'ENDED', 'CANCELLED'])('CON-10: %s cannot move in', async status => {
    state.contract.status = status;
    const result = await moveIn();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT_STATE');
    noMoveInWrites();
  });
  it('CON-18: a renewal uses its switch workflow rather than manual move-in', async () => {
    state.contract.previousContractId = 18;
    const result = await moveIn();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT_STATE');
    noMoveInWrites();
  });
  it('CON-10: a HOLD that already has movedInAt is rejected', async () => {
    state.contract.movedInAt = new Date('2026-11-19T03:00:00Z');
    expect((await moveIn()).status).toBe(409);
    noMoveInWrites();
  });

  it.each([3, 4])('SCOPE-02: tenant/guest actor %s cannot write move-in readings', async actor => {
    const result = await moveIn(BODY, actor);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('FORBIDDEN');
    noMoveInWrites();
  });
  it('SCOPE-02: a manager from another building cannot move in this contract', async () => {
    const result = await moveIn(BODY, 5);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('OUT_OF_SCOPE');
    noMoveInWrites();
  });
  it('SCOPE-02: assignment is rechecked after entering the transaction', async () => {
    reassignOnTransaction = true;
    const result = await moveIn();
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('OUT_OF_SCOPE');
    noMoveInWrites();
  });
  it('API-07: an unauthenticated request cannot move in a contract', async () => {
    const result = await request(app.getHttpServer()).post('/api/v1/contracts/42/move-in').send(BODY);
    expect(result.status).toBe(401);
    noMoveInWrites();
  });
  it('CON-10: an unknown contract returns NOT_FOUND', async () => {
    const result = await moveIn(BODY, 2, 999);
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('NOT_FOUND');
    noMoveInWrites();
  });

  const invalidBodies: [string, unknown][] = [
    ['missing water in PER_PERSON mode', { electric: 1_290, readOn: DATE }],
    ['missing electric', { water: 105, readOn: DATE }],
    ['missing readOn', { electric: 1_290, water: 105 }],
    ['negative electric', { ...BODY, electric: -1 }],
    ['negative water', { ...BODY, water: -1 }],
    ['fractional electric', { ...BODY, electric: 1.5 }],
    ['fractional water', { ...BODY, water: 1.5 }],
    ['electric outside Int', { ...BODY, electric: 2_147_483_648 }],
    ['water outside Int', { ...BODY, water: 2_147_483_648 }],
    ['numeric string', { ...BODY, electric: '1290' }],
    ['boolean value', { ...BODY, water: true }],
    ['null value', { ...BODY, electric: null }],
    ['impossible calendar date', { ...BODY, readOn: '2026-02-30' }],
    ['timestamp instead of business date', { ...BODY, readOn: '2026-11-20T03:00:00Z' }],
    ['null date', { ...BODY, readOn: null }],
    ['null optional note', { ...BODY, note: null }],
    ['non-string note', { ...BODY, note: 123 }],
    ['NUL note', { ...BODY, note: 'ghi\u0000chú' }],
    ['overlong note', { ...BODY, note: 'a'.repeat(2_001) }],
    ['meter photo', { ...BODY, photoUrl: 'https://example.invalid/meter.jpg' }],
    ['unrequested state mutation', { ...BODY, status: 'ACTIVE' }],
    ['null replacement', { ...BODY, electricReplacement: null }],
    ['missing old final', { ...BODY, electricReplacement: {} }],
    ['negative old final', { ...BODY, electricReplacement: { oldMeterFinal: -1 } }],
    ['fractional old final', { ...BODY, waterReplacement: { oldMeterFinal: 1.5 } }],
    ['old final outside Int', { ...BODY, electricReplacement: { oldMeterFinal: 2_147_483_648 } }],
    ['string old final', { ...BODY, electricReplacement: { oldMeterFinal: '1300' } }],
    ['unknown nested field', { ...BODY, electricReplacement: { oldMeterFinal: 1_300, unchecked: true } }],
  ];
  it.each(invalidBodies)('CON-10/11/MTR-04 validation: rejects %s without writes', async (_name, body) => {
    const result = await moveIn(body);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
    noMoveInWrites();
  });
  it.each(['bad-id', '0', '2147483648'])('API-06: rejects invalid contract id %s', async id => {
    expect((await moveIn(BODY, 2, id)).status).toBe(400);
    noMoveInWrites();
  });
  it('MTR-03: zero readings are valid for a room without previous readings', async () => {
    expect((await moveIn({ ...BODY, electric: 0, water: 0 })).status).toBe(201);
  });
  it.each(['2026-11-17', '2026-11-23'])('CON-11: exactly three days from start (%s) needs no note', async readOn => {
    expect((await moveIn({ ...BODY, readOn })).status).toBe(201);
  });
  it.each(['2026-11-16', '2026-11-24'])('CON-11: more than three days from start (%s) requires a note', async readOn => {
    const result = await moveIn({ ...BODY, readOn });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
    expect(result.body.error.fields).toHaveProperty('note');
    noMoveInWrites();
  });
  it('CON-11: whitespace is not a justification for a reading more than three days away', async () => {
    expect((await moveIn({ ...BODY, readOn: '2026-11-24', note: '   ' })).status).toBe(400);
    noMoveInWrites();
  });
  it('CON-11: an explanatory note permits a later reading without moving the billing start', async () => {
    const result = await moveIn({ ...BODY, readOn: '2026-11-24', note: '  Bàn giao muộn  ' });
    expect(result.status).toBe(201);
    expect(state.contract.startDate.toISOString().slice(0, 10)).toBe(DATE);
    expect(state.readings.every(row => row.note === 'Bàn giao muộn')).toBe(true);
  });

  it('MTR-02 owner 20/11: same-day old closing stays separate from new opening', async () => {
    reading({ readOn: new Date(DATE), value: 1_284 });
    reading({ readOn: new Date(DATE), kind: 'WATER', value: 100 });
    const old = structuredClone(state.readings);
    expect((await moveIn()).status).toBe(201);
    expect(state.readings).toHaveLength(4);
    expect(state.readings.slice(0, 2)).toEqual(old);
    expect(state.readings.slice(2).every(row => row.contractId === 42 && row.isOpening)).toBe(true);
  });
  it('MTR-02 owner 20/11: equal previous-tenant baselines are not reassigned or reused', async () => {
    reading({ readOn: new Date(DATE), value: 1_290, isOpening: true });
    reading({ readOn: new Date(DATE), kind: 'WATER', value: 105, isOpening: true });
    const old = structuredClone(state.readings);
    expect((await moveIn()).status).toBe(201);
    expect(state.readings.slice(0, 2)).toEqual(old);
    expect(state.readings).toHaveLength(4);
  });
  it('MTR-02 owner 20/11: own same-day month closing is preserved alongside a distinct opening', async () => {
    reading({ contractId: 42, readOn: new Date(DATE), value: 1_350 });
    reading({ contractId: 42, readOn: new Date(DATE), kind: 'WATER', value: 110 });
    const closing = structuredClone(state.readings);
    expect((await moveIn()).status).toBe(201);
    expect(state.readings.slice(0, 2)).toEqual(closing);
    const opening = state.readings.find(row => row.contractId === 42 && row.kind === 'ELECTRIC' && row.isOpening)!;
    expect(closing[0].value - opening.value).toBe(60);
  });
  it('MTR-03: another room history does not restrict these baselines', async () => {
    reading({ roomId: 31, value: 50_000 });
    expect((await moveIn()).status).toBe(201);
  });
  it('MTR-03: electric and water histories are checked independently', async () => {
    reading({ value: 1_284 });
    reading({ kind: 'WATER', value: 100 });
    expect((await moveIn()).status).toBe(201);
  });
  it('MTR-03 acceptance: 1.250 after 1.284 without replacement is rejected', async () => {
    reading();
    const result = await moveIn({ ...BODY, electric: 1_250 });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('METER_VALUE_DECREASED');
    noMoveInWrites();
  });
  it('MTR-03: matching the previous reading is allowed', async () => {
    reading({ value: 1_290 });
    expect((await moveIn()).status).toBe(201);
  });
  it('MTR-04: replacement permits a zero new counter while preserving its old final value', async () => {
    reading();
    const result = await moveIn({ ...BODY, electric: 0, electricReplacement: { oldMeterFinal: 1_300 } });
    expect(result.status).toBe(201);
    expect(state.readings.find(row => row.contractId === 42 && row.kind === 'ELECTRIC')).toMatchObject({
      value: 0, isOpening: true, isMeterReplaced: true, oldMeterFinal: 1_300,
    });
  });
  it('MTR-03/04: replacement cannot claim an old final below the last old reading', async () => {
    reading();
    const result = await moveIn({ ...BODY, electric: 0, electricReplacement: { oldMeterFinal: 1_250 } });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('METER_VALUE_DECREASED');
    noMoveInWrites();
  });
  it('MTR-04/06: water replacement is recorded independently in PER_PERSON mode', async () => {
    reading({ kind: 'WATER', value: 100 });
    expect((await moveIn({ ...BODY, water: 0, waterReplacement: { oldMeterFinal: 105 } })).status).toBe(201);
    expect(state.readings.find(row => row.contractId === 42 && row.kind === 'WATER')).toMatchObject({
      value: 0, isOpening: true, isMeterReplaced: true, oldMeterFinal: 105,
    });
  });
  it('MTR-03: a backdated opening cannot exceed an already recorded later counter', async () => {
    reading({ contractId: 42, readOn: new Date('2026-11-25'), value: 1_380 });
    const result = await moveIn({ ...BODY, electric: 1_400 });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('METER_VALUE_DECREASED');
    noMoveInWrites();
  });
  it('MTR-03/04: a single previous replacement uses the new counter, not the old meter final', async () => {
    reading({ readOn: new Date('2026-11-18'), value: 1_284 });
    reading({ readOn: new Date('2026-11-19'), value: 0, isMeterReplaced: true, oldMeterFinal: 1_300 });
    expect((await moveIn({ ...BODY, electric: 5 })).status).toBe(201);
  });
  it('MTR-03/04: a later replacement bounds the opening by its old meter final', async () => {
    reading({ contractId: 42, readOn: new Date('2026-11-25'), value: 0,
      isMeterReplaced: true, oldMeterFinal: 1_300 });
    expect((await moveIn()).status).toBe(201);
  });
  it('MTR-03/04: an opening above the later replacement old final is rejected', async () => {
    reading({ contractId: 42, readOn: new Date('2026-11-25'), value: 0,
      isMeterReplaced: true, oldMeterFinal: 1_280 });
    const result = await moveIn();
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('METER_VALUE_DECREASED');
    noMoveInWrites();
  });
  it('MTR-04: ambiguous same-day reset history is refused rather than ordered by insertion id', async () => {
    reading({ value: 1_284 });
    reading({ value: 0, isMeterReplaced: true, oldMeterFinal: 1_300 });
    const previous = structuredClone(state.readings);
    const result = await moveIn({ ...BODY, electric: 5 });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT_STATE');
    expect(result.body.error.fields).toHaveProperty('readOn');
    expect(state.readings).toEqual(previous);
    noMoveInWrites();
  });
  it('CON-10/MTR-02: an existing contract opening is never overwritten', async () => {
    reading({ contractId: 42, isOpening: true, value: 1_290 });
    const before = structuredClone(state.readings);
    const result = await moveIn();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT_STATE');
    expect(state.readings).toEqual(before);
    noMoveInWrites();
  });
  it('CON-10/MTR-02: an existing water opening rolls back the newly inserted electric opening', async () => {
    reading({ contractId: 42, kind: 'WATER', isOpening: true, value: 105 });
    const before = structuredClone(state.readings);
    const result = await moveIn();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT_STATE');
    expect(state.readings).toEqual(before);
    expect(state.contract.status).toBe('HOLD');
    expect(state.contract.movedInAt).toBeNull();
    expect(state.audits).toEqual([]);
  });
  it('CON-10: retry after a successful move-in does not duplicate readings or audit', async () => {
    expect((await moveIn()).status).toBe(201);
    const result = await moveIn();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT_STATE');
    expect(state.readings).toHaveLength(2);
    expect(state.audits).toHaveLength(1);
  });
  it('CON-10: concurrent requests produce one move-in with two readings and one audit', async () => {
    const results = await Promise.all([moveIn(), moveIn()]);
    expect(results.map(result => result.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(state.readings).toHaveLength(2);
    expect(state.audits).toHaveLength(1);
  });
  it('CON-10/AUD-01: audit failure rolls back both readings and ACTIVE', async () => {
    failAudit = true;
    expect((await moveIn()).status).toBe(500);
    rolledBack();
  });
  it('CON-10: second reading failure rolls back the first reading and contract change', async () => {
    failWaterInsert = true;
    expect((await moveIn()).status).toBe(500);
    rolledBack();
  });
  it('CON-10: a conditional contract update conflict rolls back inserted baselines', async () => {
    conflictUpdate = true;
    const result = await moveIn();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT_STATE');
    rolledBack();
  });
  it('CON-16/G-10: response and audit disclose no scan, identity ciphertext or credential', async () => {
    const result = await moveIn();
    expect(result.status).toBe(201);
    const serialized = JSON.stringify({ response: result.body, audits: state.audits });
    for (const privateValue of [PRIVATE_SCAN, 'passwordHash', 'temporaryPassword', 'idNumberEnc', 'signedScanAssetId']) {
      expect(serialized).not.toContain(privateValue);
    }
    for (const [args] of db.contract.findUnique.mock.calls) {
      const fields = JSON.stringify(args.select ?? {});
      expect(fields).not.toContain('passwordHash');
      expect(fields).not.toContain('signedScanAssetId');
      expect(fields).not.toContain('idNumberEnc');
    }
  });
});
