import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { PENDING_TENANT_PASSWORD_HASH } from '../../common/crypto/password.js';
import { formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { publicRoomWhere } from '../../common/rooms/public-room.js';
import { TokenService } from '../auth/token.service.js';
import { MailerService } from '../mailer/mailer.service.js';

const roles = new Map<number, Role>([[1, 'BOSS'], [2, 'MANAGER'], [3, 'TENANT'], [4, 'GUEST'], [5, 'MANAGER']]);
const BODY = { reason: 'Khách thay đổi kế hoạch', depositKept: 1_000_000 };
const PRIVATE_SCAN = 'private-cancel-scan-fixture';

function initialState() {
  return {
    users: new Map([...roles].map(([id, role]) => [id, { id, role, isActive: true, mustChangePassword: false,
      passwordHash: `test-only-cancel-hash-${id}`, fullName: `Fixture ${id}`, phone: `090000000${id}`, locale: 'en' }])),
    buildings: new Map<number, any>([
      [7, { id: 7, managerId: 2, isActive: true, code: 'CG01', name: 'Tòa A' }],
      [8, { id: 8, managerId: 5, isActive: true, code: 'DD01', name: 'Tòa B' }],
    ]),
    contract: { id: 42, code: 'HD000042', roomId: 30, buildingId: 7, tenantId: 3,
      status: 'HOLD', signedAt: new Date('2026-11-19T03:00:00Z') as Date | null,
      movedInAt: null as Date | null, endedAt: null as Date | null, cancelReason: null as string | null,
      previousContractId: null as number | null, startDate: new Date('2026-11-20'),
      endDate: new Date('2027-02-19'), rent: 2_500_000, deposit: 2_500_000, signedScanAssetId: PRIVATE_SCAN },
    extraContracts: [] as any[],
    invoices: [{ id: 70, contractId: 42, type: 'DEPOSIT', status: 'PAID', total: 2_500_000,
      periodNo: 0, cancelReason: null, payment: { id: 80, invoiceId: 70, amount: 2_500_000, source: 'MANUAL', method: 'CASH' } }] as any[],
    settlements: [] as any[],
    idempotency: [] as any[],
    audits: [] as any[],
    viewings: [{ id: 90, userId: 3, contractId: 42, status: 'WON' }, { id: 91, userId: 4, status: 'CANCELLED' }],
    sessions: [{ id: 92, userId: 3, revokedAt: null }],
    room: { id: 30, buildingId: 7, code: 'P301', isActive: true, underMaintenance: false, price: 2_500_000 },
  };
}

const comparable = (value: any): any => value instanceof Date ? value.getTime() : value;
const operators = new Set(['equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte']);
function scalarMatches(actual: any, expected: any): boolean {
  if (expected instanceof Date || expected === null || typeof expected !== 'object') return comparable(actual) === comparable(expected);
  return Object.entries(expected).every(([operator, value]: [string, any]) => {
    if (operator === 'equals') return scalarMatches(actual, value);
    if (operator === 'not') return !scalarMatches(actual, value);
    if (operator === 'in') return value.some((item: any) => scalarMatches(actual, item));
    if (operator === 'notIn') return !value.some((item: any) => scalarMatches(actual, item));
    if (actual === null || actual === undefined) return false;
    if (operator === 'lt') return comparable(actual) < comparable(value);
    if (operator === 'lte') return comparable(actual) <= comparable(value);
    if (operator === 'gt') return comparable(actual) > comparable(value);
    if (operator === 'gte') return comparable(actual) >= comparable(value);
    throw new Error(`Unsupported scalar filter in cancellation fixture: ${operator}`);
  });
}
function matches(row: any, where: any = {}): boolean {
  const group = (value: any): any[] => Array.isArray(value) ? value : [value];
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return group(value).every(item => matches(row, item));
    if (key === 'OR') return group(value).some(item => matches(row, item));
    if (key === 'NOT') return group(value).every(item => !matches(row, item));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('none' in value) return !(row[key] ?? []).some((item: any) => matches(item, value.none));
      if ('some' in value) return (row[key] ?? []).some((item: any) => matches(item, value.some));
      if ('every' in value) return (row[key] ?? []).every((item: any) => matches(item, value.every));
      if ('is' in value) return row[key] !== null && matches(row[key], value.is);
      if (!Object.keys(value).some(operator => operators.has(operator))) return matches(row[key], value);
    }
    return scalarMatches(row[key], value);
  });
}
function ordered(rows: any[], orderBy: any): any[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) for (const [field, direction] of Object.entries(clause)) {
      const left = comparable(a[field]); const right = comparable(b[field]);
      if (left !== right) return (left < right ? -1 : 1) * (direction === 'desc' ? -1 : 1);
    }
    return 0;
  });
}
// Respect the actual Prisma SELECT, including the actual payment amount rather than invoice total.
function project(row: any, select: any): any {
  if (row === null || row === undefined) return row;
  if (Array.isArray(row)) return row.map(value => project(value, select));
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, value]: [string, any]) =>
    [key, value === true ? row[key] : project(row[key], value.select)]));
}

describe('BE-P3-21 / CON-12 / BIL-17 / API-05: HOLD cancellation over HTTP', () => {
  let app: INestApplication;
  let state = initialState();
  let queue = Promise.resolve();
  let reassignOnTransaction = false;
  let payBeforeInvoiceLock = false;
  let failAudit = false;
  let failSettlement = false;
  let conflictInvoice = false;
  let conflictContract = false;
  let uniqueSettlement = false;
  const mailer = { send: vi.fn(async () => {}) };
  const contractRow = (contract = state.contract) => {
    const building = state.buildings.get(contract.buildingId);
    return { ...contract, building: { ...building, manager: state.users.get(building.managerId) ?? null },
      tenant: state.users.get(contract.tenantId), room: { ...state.room, building } };
  };
  const contractLookup = async ({ where, select }: any) => {
    const contract = [state.contract, ...state.extraContracts].find(row => matches(row, where));
    return project(contract ? contractRow(contract) : null, select);
  };
  const compositeKey = (where: any) => where.actorId_route_key ?? { actorId: where.actorId, route: where.route, key: where.key };
  const lookupIdempotency = (where: any) => state.idempotency.find(row => matches(row, compositeKey(where)));
  const forbiddenMutation = vi.fn(async () => { throw new Error('Unexpected mutation of preserved history or account'); });
  const db: any = {
    user: {
      findUnique: vi.fn(async ({ where, select }: any) => project(state.users.get(where.id) ?? null, select)),
      update: forbiddenMutation, updateMany: forbiddenMutation,
    },
    building: { findMany: vi.fn(async ({ where, select }: any) => [...state.buildings.values()]
      .filter(building => matches(building, where)).map(building => project(building, select))) },
    contract: {
      findUnique: vi.fn(contractLookup), findFirst: vi.fn(contractLookup),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const contract = [state.contract, ...state.extraContracts].find(row => matches(row, where));
        if (!contract || conflictContract) return { count: 0 };
        Object.assign(contract, data);
        return { count: 1 };
      }),
    },
    invoice: {
      findMany: vi.fn(async ({ where, select, orderBy }: any) => ordered(state.invoices.filter(invoice => matches(invoice, where)), orderBy).map(row => project(row, select))),
      findFirst: vi.fn(async ({ where, select, orderBy }: any) => project(ordered(state.invoices.filter(invoice => matches(invoice, where)), orderBy)[0] ?? null, select)),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (conflictInvoice) return { count: 0 };
        const invoices = state.invoices.filter(invoice => matches(invoice, where));
        invoices.forEach(invoice => Object.assign(invoice, data));
        return { count: invoices.length };
      }),
      delete: forbiddenMutation,
    },
    settlement: {
      findUnique: vi.fn(async ({ where, select }: any) => project(state.settlements.find(row => matches(row, where)) ?? null, select)),
      findFirst: vi.fn(async ({ where, select }: any) => project(state.settlements.find(row => matches(row, where)) ?? null, select)),
      create: vi.fn(async ({ data, select }: any) => {
        if (uniqueSettlement || state.settlements.some(row => row.contractId === data.contractId)) {
          throw Object.assign(new Error('Duplicate settlement'), { code: 'P2002', meta: { target: ['contract_id'] } });
        }
        const row = { id: 100 + state.settlements.length, refundPaidAt: null, finalInvoiceId: null,
          remainingRent: 0, previousDebt: 0, damages: 0, createdAt: new Date(), ...data };
        state.settlements.push(row);
        if (failSettlement) throw new Error('BE-P3-21 simulated failure after settlement insert');
        return project(row, select);
      }),
    },
    pricingIdempotencyKey: {
      findUnique: vi.fn(async ({ where }: any) => structuredClone(lookupIdempotency(where) ?? null)),
      create: vi.fn(async ({ data }: any) => {
        if (lookupIdempotency(data)) throw new Error('Duplicate idempotency fixture key');
        state.idempotency.push(structuredClone(data));
        return data;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const entry = lookupIdempotency(where);
        state.idempotency = state.idempotency.filter(row => row !== entry);
        return entry;
      }),
    },
    payment: { delete: forbiddenMutation, update: forbiddenMutation },
    room: { update: forbiddenMutation, updateMany: forbiddenMutation },
    viewing: { updateMany: forbiddenMutation, update: forbiddenMutation },
    vehicle: { updateMany: forbiddenMutation },
    session: { updateMany: forbiddenMutation, deleteMany: forbiddenMutation },
    auditLog: { create: vi.fn(async ({ data }: any) => {
      state.audits.push(structuredClone(data));
      if (failAudit) throw new Error('BE-P3-21 simulated failure after audit insert');
      return data;
    }) },
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      if (payBeforeInvoiceLock && strings.join(' ').includes('FROM invoices')) {
        state.invoices[0].status = 'PAID';
        state.invoices[0].payment = { id: 80, invoiceId: 70, amount: 2_500_000, source: 'MANUAL', method: 'CASH' };
        payBeforeInvoiceLock = false;
      }
      return [];
    }),
  };
  // A serialized outside edge tests HTTP/rollback, not the PostgreSQL lock implementation.
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
    vi.stubEnv('MAIL_PROVIDER', '');
    vi.stubEnv('JWT_SECRET', 'test-only-cancel-http-0123456789abcdef');
    vi.stubEnv('CCCD_KEY', Buffer.alloc(32, 62).toString('base64'));
    const { AppModule } = await import('../../app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db).overrideProvider(MailerService).useValue(mailer).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
  });
  beforeEach(() => {
    state = initialState(); queue = Promise.resolve(); reassignOnTransaction = false; payBeforeInvoiceLock = false;
    failAudit = false; failSettlement = false; conflictInvoice = false; conflictContract = false; uniqueSettlement = false;
    vi.clearAllMocks();
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });

  async function cancel(body: unknown = BODY, actor = 2, key?: string, id: string | number = 42) {
    const token = await app.get(TokenService).signAccessToken({ id: actor, role: roles.get(actor)! });
    const call = request(app.getHttpServer()).post(`/api/v1/contracts/${id}/cancel`).set('Authorization', `Bearer ${token}`);
    if (key !== undefined) call.set('Idempotency-Key', key);
    return call.send(body as object);
  }
  function noCancelWrites() {
    expect(db.contract.updateMany).not.toHaveBeenCalled();
    expect(db.invoice.updateMany).not.toHaveBeenCalled();
    expect(db.settlement.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
    expect(db.pricingIdempotencyKey.create).not.toHaveBeenCalled();
  }
  function invoiceUnpaid() { state.invoices[0].status = 'UNPAID'; state.invoices[0].payment = null; }
  function rolledBack() {
    expect(state.contract.status).toBe('HOLD'); expect(state.contract.cancelReason).toBeNull();
    expect(state.settlements).toEqual([]); expect(state.audits).toEqual([]); expect(state.idempotency).toEqual([]);
  }

  it('CON-12/BIL-17 acceptance: paid 2.500.000 minus 1.000.000 kept records a 1.500.000 refund', async () => {
    const invoice = structuredClone(state.invoices[0]);
    const result = await cancel();
    expect(result.status).toBe(201);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data).toMatchObject({ id: 42, code: 'HD000042', status: 'CANCELLED', cancelReason: BODY.reason,
      depositInvoice: { id: 70, status: 'PAID' }, settlement: {
        deposit: 2_500_000, depositForfeit: 1_000_000, net: 1_500_000, refundPaidAt: null,
        moveOutDate: formatDateOnly(todayHanoi()),
      } });
    expect(state.contract).toMatchObject({ status: 'CANCELLED', cancelReason: BODY.reason, movedInAt: null, endedAt: null });
    expect(state.invoices[0]).toEqual(invoice);
    expect(state.settlements).toHaveLength(1);
    expect(state.settlements[0]).toMatchObject({ contractId: 42, deposit: 2_500_000, depositForfeit: 1_000_000,
      lastPeriodAmount: 0, remainingRent: 0, previousDebt: 0, damages: 0, net: 1_500_000, finalInvoiceId: null, refundPaidAt: null });
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ actorId: 2, action: 'contract.cancel', entity: 'contract', entityId: 42 });
    expect(mailer.send).not.toHaveBeenCalled();
  });
  it.each([[0, 2_500_000], [2_500_000, 0]])('CON-12: keeping %i yields refund %i without recording refund paid', async (depositKept, refund) => {
    expect((await cancel({ ...BODY, depositKept })).body.data.settlement).toMatchObject({ net: refund, refundPaidAt: null });
  });
  it('CON-12: omitted depositKept defaults to a full refund', async () => {
    const result = await cancel({ reason: BODY.reason });
    expect(result.status).toBe(201); expect(result.body.data.settlement.net).toBe(2_500_000);
  });
  it('CON-12/BIL-17: refund uses actual payment rather than the nominal contract deposit', async () => {
    state.invoices[0].total = 1_000_000; state.invoices[0].payment.amount = 1_000_000;
    const result = await cancel({ reason: BODY.reason });
    expect(result.status).toBe(201); expect(result.body.data.settlement).toMatchObject({ deposit: 1_000_000, net: 1_000_000 });
  });
  it('CON-12: an existing PAID zero-amount invoice still produces its zero settlement', async () => {
    state.contract.deposit = 0; state.invoices[0].total = 0; state.invoices[0].payment.amount = 0;
    const result = await cancel({ reason: BODY.reason });
    expect(result.status).toBe(201); expect(result.body.data.settlement).toMatchObject({ deposit: 0, depositForfeit: 0, net: 0, refundPaidAt: null });
  });
  it('CON-12: UNPAID invoice becomes CANCELLED with reason, without settlement or payment mutation', async () => {
    invoiceUnpaid();
    const result = await cancel({ reason: BODY.reason });
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ settlement: null, depositInvoice: { id: 70, status: 'CANCELLED' } });
    expect(state.invoices[0]).toMatchObject({ status: 'CANCELLED', cancelReason: BODY.reason, payment: null });
    expect(state.settlements).toEqual([]);
  });
  it('CON-12: unsigned HOLD without an invoice cancels and retains its inactive pending account', async () => {
    state.contract.signedAt = null; state.invoices = [];
    Object.assign(state.users.get(3)!, { isActive: false, passwordHash: PENDING_TENANT_PASSWORD_HASH, mustChangePassword: true });
    const user = structuredClone(state.users.get(3));
    const result = await cancel({ reason: BODY.reason });
    expect(result.status).toBe(201); expect(result.body.data.settlement).toBeNull();
    expect(result.body.data.depositInvoice).toBeNull(); expect(state.users.get(3)).toEqual(user);
  });
  it('CON-12: zero deposit requires no invoice and no settlement', async () => {
    state.contract.deposit = 0; state.invoices = [];
    expect((await cancel({ reason: BODY.reason, depositKept: 0 })).status).toBe(201);
    expect(state.settlements).toEqual([]);
  });
  it('CON-12: a cancelled no-payment historical invoice stays unchanged', async () => {
    invoiceUnpaid(); state.invoices[0].status = 'CANCELLED'; state.invoices[0].cancelReason = 'Lý do cũ';
    const old = structuredClone(state.invoices);
    expect((await cancel({ reason: BODY.reason })).status).toBe(201);
    expect(state.invoices).toEqual(old); expect(state.settlements).toEqual([]);
  });
  it('CON-12: payments for another contract cannot become this cancellation refund', async () => {
    state.contract.signedAt = null; state.invoices[0].contractId = 43;
    expect((await cancel({ reason: BODY.reason })).status).toBe(201);
    expect(state.settlements).toEqual([]); expect(state.invoices[0].status).toBe('PAID');
  });
  it('CON-12: depositKept above the paid amount is VALIDATION_FAILED without writes', async () => {
    const result = await cancel({ ...BODY, depositKept: 2_500_001 });
    expect(result.status).toBe(400); expect(result.body.error.code).toBe('VALIDATION_FAILED'); noCancelWrites();
  });
  it.each(['unpaid', 'no invoice'])('CON-12: keeping money when there is %s is rejected', async mode => {
    if (mode === 'unpaid') invoiceUnpaid(); else state.invoices = [];
    const result = await cancel();
    expect(result.status).toBe(400); expect(result.body.error.code).toBe('VALIDATION_FAILED'); noCancelWrites();
  });
  it.each(['DRAFT', 'SETTLED'])('CON-12: unsupported DEPOSIT state %s is a conflict', async status => {
    state.invoices[0].status = status; state.invoices[0].payment = null;
    const result = await cancel(); expect(result.status).toBe(409); noCancelWrites();
  });
  it.each(['missing payment', 'mismatched payment'])('CON-12/BIL-17: PAID with %s cannot invent credit', async problem => {
    state.invoices[0].payment = problem === 'missing payment' ? null : { amount: 1_000_000 };
    const result = await cancel({ reason: BODY.reason }); expect(result.status).toBe(409); noCancelWrites();
  });
  it('CON-12: multiple active direct deposit invoices are rejected', async () => {
    state.invoices.push({ ...structuredClone(state.invoices[0]), id: 71 });
    expect((await cancel()).status).toBe(409); noCancelWrites();
  });
  it.each(['UNPAID', 'CANCELLED'])('CON-12/BIL-17: %s with an existing payment is a protected data conflict', async status => {
    state.invoices[0].status = status;
    expect((await cancel({ reason: BODY.reason })).status).toBe(409); noCancelWrites();
  });
  it('CON-12: existing settlement on HOLD is never overwritten', async () => {
    state.settlements.push({ id: 100, contractId: 42, deposit: 2_500_000, net: 2_500_000 });
    const existing = structuredClone(state.settlements);
    expect((await cancel()).status).toBe(409); expect(state.settlements).toEqual(existing); noCancelWrites();
  });
  it.each(['ACTIVE', 'ENDED', 'CANCELLED'])('CON-12: %s cannot be cancelled', async status => {
    state.contract.status = status;
    const result = await cancel(); expect(result.status).toBe(409); expect(result.body.error.code).toBe('CONFLICT_STATE'); noCancelWrites();
  });

  it.each([3, 4])('SCOPE-02: tenant/guest actor %i cannot cancel', async actor => {
    const result = await cancel(BODY, actor); expect(result.status).toBe(403); expect(result.body.error.code).toBe('FORBIDDEN'); noCancelWrites();
  });
  it('SCOPE-02: a manager outside the building cannot cancel', async () => {
    const result = await cancel(BODY, 5); expect(result.status).toBe(403); expect(result.body.error.code).toBe('OUT_OF_SCOPE'); noCancelWrites();
  });
  it('SCOPE-02: assignment is rechecked inside the transaction', async () => {
    reassignOnTransaction = true;
    expect((await cancel()).status).toBe(403); noCancelWrites();
  });
  it('SCOPE-02: Boss cancels a contract assigned to another manager', async () => {
    state.buildings.get(7).managerId = 5;
    expect((await cancel(BODY, 1)).status).toBe(201);
  });
  it('API-07: unauthenticated cancellation is rejected', async () => {
    expect((await request(app.getHttpServer()).post('/api/v1/contracts/42/cancel').send(BODY)).status).toBe(401); noCancelWrites();
  });
  it('CON-12: missing contract is NOT_FOUND', async () => {
    const result = await cancel(BODY, 2, undefined, 999); expect(result.status).toBe(404); noCancelWrites();
  });

  it.each([
    ['missing reason', { depositKept: 0 }], ['empty reason', { reason: '' }], ['whitespace reason', { reason: '   ' }],
    ['null reason', { reason: null }], ['numeric reason', { reason: 123 }], ['NUL reason', { reason: 'ghi\u0000chú' }],
    ['overlong reason', { reason: 'a'.repeat(2_001) }], ['negative amount', { ...BODY, depositKept: -1 }],
    ['fractional amount', { ...BODY, depositKept: 0.5 }], ['string amount', { ...BODY, depositKept: '1000000' }],
    ['boolean amount', { ...BODY, depositKept: true }], ['null amount', { ...BODY, depositKept: null }],
    ['overflow amount', { ...BODY, depositKept: 2_147_483_648 }], ['refund mutation', { ...BODY, refundPaidAt: '2026-11-20' }],
    ['status mutation', { ...BODY, status: 'CANCELLED' }], ['client deposit override', { ...BODY, deposit: 1 }],
  ])('CON-12 validation: %s is rejected before writes', async (_name, body) => {
    const result = await cancel(body); expect(result.status).toBe(400); expect(result.body.error.code).toBe('VALIDATION_FAILED'); noCancelWrites();
  });
  it.each(['bad-id', '0', '2147483648'])('API-06: invalid contract id %s is rejected', async id => {
    expect((await cancel(BODY, 2, undefined, id)).status).toBe(400); noCancelWrites();
  });
  it('CON-12: reason is trimmed in contract, settlement and response', async () => {
    const result = await cancel({ ...BODY, reason: `  ${BODY.reason}  ` });
    expect(result.status).toBe(201); expect(result.body.data.cancelReason).toBe(BODY.reason);
    expect(state.contract.cancelReason).toBe(BODY.reason); expect(state.settlements[0].note).toBe(BODY.reason);
  });

  it('CON-12/D-26/A-16: reused guest tenant keeps active status, password, locale, sessions and viewings', async () => {
    const kept = structuredClone({ user: state.users.get(3), sessions: state.sessions, viewings: state.viewings });
    expect((await cancel()).status).toBe(201);
    expect({ user: state.users.get(3), sessions: state.sessions, viewings: state.viewings }).toEqual(kept);
    expect(forbiddenMutation).not.toHaveBeenCalled();
  });
  it('CON-12/D-26: cancellation never unlocks a staff-locked signer', async () => {
    state.users.get(3)!.isActive = false;
    const kept = structuredClone(state.users.get(3));
    expect((await cancel()).status).toBe(201); expect(state.users.get(3)).toEqual(kept);
  });
  it('CON-12/A-22: another signed HOLD sharing the tenant cannot be deactivated by this cancellation', async () => {
    state.extraContracts.push({ ...structuredClone(state.contract), id: 43, code: 'HD000043', roomId: 31 });
    const kept = structuredClone(state.users.get(3));
    expect((await cancel()).status).toBe(201); expect(state.extraContracts[0].status).toBe('HOLD'); expect(state.users.get(3)).toEqual(kept);
  });
  it('CON-12/ROOM-05: normal public eligibility is restored by CANCELLED status without mutating room flags', async () => {
    const room = structuredClone(state.room);
    const eligible = () => matches({ ...state.room, contracts: [state.contract], building: {
      ...state.buildings.get(7), ratePlans: ['ELECTRIC', 'WATER'].map(kind => ({ kind, status: 'APPROVED', effectiveFrom: new Date('2026-01-01') })),
    } }, publicRoomWhere(todayHanoi()));
    expect(eligible()).toBe(false); expect((await cancel()).status).toBe(201); expect(eligible()).toBe(true); expect(state.room).toEqual(room);
  });

  it('API-05/CON-12: same key replays after CANCELLED with one settlement, audit and response', async () => {
    const first = await cancel(BODY, 2, 'cancel-key'); const second = await cancel(BODY, 2, 'cancel-key');
    expect(first.status).toBe(201); expect(second.status).toBe(201); expect(second.body).toEqual(first.body);
    expect(state.settlements).toHaveLength(1); expect(state.audits).toHaveLength(1); expect(state.idempotency).toHaveLength(1);
  });
  it('API-05: omitted and explicit zero normalize to the same cancellation payload', async () => {
    const first = await cancel({ reason: BODY.reason }, 2, 'zero-key');
    const second = await cancel({ reason: BODY.reason, depositKept: 0 }, 2, 'zero-key');
    expect(first.status).toBe(201); expect(second.status).toBe(201); expect(second.body).toEqual(first.body);
  });
  it('API-05: reason whitespace normalizes to the same replay payload', async () => {
    const first = await cancel({ ...BODY, reason: ` ${BODY.reason} ` }, 2, 'trim-key');
    const second = await cancel(BODY, 2, 'trim-key');
    expect(first.status).toBe(201); expect(second.status).toBe(201); expect(second.body).toEqual(first.body);
  });
  it('API-05: an expired key does not replay a cancellation beyond its 24-hour window', async () => {
    expect((await cancel(BODY, 2, 'expired-key')).status).toBe(201);
    state.idempotency[0].expiresAt = new Date(0);
    expect((await cancel(BODY, 2, 'expired-key')).status).toBe(409);
    expect(state.settlements).toHaveLength(1); expect(state.audits).toHaveLength(1);
  });
  it.each([{ ...BODY, depositKept: 0 }, { ...BODY, reason: 'Lý do khác' }])('API-05: same key with changed payload conflicts %j', async body => {
    expect((await cancel(BODY, 2, 'cancel-key')).status).toBe(201);
    expect((await cancel(body, 2, 'cancel-key')).status).toBe(409); expect(state.settlements).toHaveLength(1);
  });
  it('API-05: the contract id is included in the idempotency hash', async () => {
    state.extraContracts.push({ ...structuredClone(state.contract), id: 43, code: 'HD000043', roomId: 31 });
    expect((await cancel(BODY, 2, 'cancel-key')).status).toBe(201);
    expect((await cancel(BODY, 2, 'cancel-key', 43)).status).toBe(409); expect(state.extraContracts[0].status).toBe('HOLD');
  });
  it('API-05/SCOPE-02: reassigned manager cannot replay an old cancellation response', async () => {
    expect((await cancel(BODY, 2, 'cancel-key')).status).toBe(201);
    state.buildings.get(7).managerId = 5;
    const result = await cancel(BODY, 2, 'cancel-key'); expect(result.status).toBe(403); expect(state.settlements).toHaveLength(1);
  });
  it('API-05: a different actor cannot borrow another actor cancellation key', async () => {
    expect((await cancel(BODY, 2, 'cancel-key')).status).toBe(201);
    expect((await cancel(BODY, 1, 'cancel-key')).status).toBe(409); expect(state.idempotency).toHaveLength(1);
  });
  it.each(['', 'a'.repeat(256)])('API-05: invalid idempotency key length %s is rejected', async key => {
    expect((await cancel(BODY, 2, key)).status).toBe(400); noCancelWrites();
  });
  it('CON-12: no-key retry after success conflicts without duplicate effects', async () => {
    expect((await cancel()).status).toBe(201); expect((await cancel()).status).toBe(409);
    expect(state.settlements).toHaveLength(1); expect(state.audits).toHaveLength(1);
  });
  it('CON-12: concurrent different requests result in one cancellation', async () => {
    const responses = await Promise.all([cancel(), cancel()]);
    expect(responses.map(row => row.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(state.settlements).toHaveLength(1); expect(state.audits).toHaveLength(1);
  });
  it('API-05: concurrent requests with the same key return the same committed cancellation', async () => {
    const responses = await Promise.all([cancel(BODY, 2, 'parallel-key'), cancel(BODY, 2, 'parallel-key')]);
    expect(responses.map(row => row.status)).toEqual([201, 201]); expect(responses[1].body).toEqual(responses[0].body);
    expect(state.settlements).toHaveLength(1); expect(state.audits).toHaveLength(1); expect(state.idempotency).toHaveLength(1);
  });
  it('CON-12/BIL-11: payment committed before invoice lock is observed as PAID for settlement', async () => {
    invoiceUnpaid(); payBeforeInvoiceLock = true;
    const result = await cancel(); expect(result.status).toBe(201); expect(result.body.data.settlement.net).toBe(1_500_000);
    expect(state.invoices[0].status).toBe('PAID'); expect(db.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('CON-12/AUD-01: failure after real-shaped audit insert rolls back settlement, status and idempotency', async () => {
    const invoice = structuredClone(state.invoices[0]); failAudit = true;
    expect((await cancel(BODY, 2, 'retryable-key')).status).toBe(500); rolledBack(); expect(state.invoices[0]).toEqual(invoice);
    failAudit = false; expect((await cancel(BODY, 2, 'retryable-key')).status).toBe(201);
  });
  it('CON-12: audit failure after UNPAID cancellation restores invoice and contract', async () => {
    invoiceUnpaid(); const invoice = structuredClone(state.invoices[0]); failAudit = true;
    expect((await cancel({ reason: BODY.reason })).status).toBe(500); rolledBack(); expect(state.invoices[0]).toEqual(invoice);
  });
  it('CON-12: settlement insertion failure rolls back its partial insert', async () => {
    failSettlement = true;
    expect((await cancel()).status).toBe(500); rolledBack(); expect(state.invoices[0].status).toBe('PAID');
  });
  it('CON-12: invoice conditional conflict cancels nothing', async () => {
    invoiceUnpaid(); conflictInvoice = true;
    expect((await cancel({ reason: BODY.reason })).status).toBe(409); rolledBack(); expect(state.invoices[0].status).toBe('UNPAID');
  });
  it('CON-12: contract conditional conflict rolls back the settlement', async () => {
    conflictContract = true;
    expect((await cancel()).status).toBe(409); rolledBack();
  });
  it('CON-12: contract conditional conflict rolls back cancellation of the UNPAID invoice', async () => {
    invoiceUnpaid(); conflictContract = true;
    expect((await cancel({ reason: BODY.reason })).status).toBe(409); rolledBack(); expect(state.invoices[0].status).toBe('UNPAID');
  });
  it('CON-12: duplicate settlement DB error maps to controlled conflict and rolls back', async () => {
    uniqueSettlement = true;
    const result = await cancel(); expect(result.status).toBe(409); expect(result.body.error.code).toBe('CONFLICT_STATE'); rolledBack();
  });
  it('CON-16/AUD-01: cancellation response/audit/idempotency do not disclose private scan, identity or credentials', async () => {
    const result = await cancel(BODY, 2, 'private-key'); expect(result.status).toBe(201);
    const serialized = JSON.stringify({ body: result.body, audits: state.audits, replay: state.idempotency });
    for (const privateValue of [PRIVATE_SCAN, 'passwordHash', 'temporaryPassword', 'idNumberEnc', 'signedScanAssetId']) expect(serialized).not.toContain(privateValue);
    for (const [args] of db.contract.findUnique.mock.calls) {
      expect(args.select).not.toHaveProperty('signedScanAssetId'); expect(args.select).not.toHaveProperty('tenant');
    }
  });
});
