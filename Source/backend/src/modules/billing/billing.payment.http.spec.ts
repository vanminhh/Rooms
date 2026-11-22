import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';

const PAYMENT_ROUTE = 'POST /invoices/:id/payment';
const roles = new Map<number, Role>([[1, 'BOSS'], [2, 'MANAGER'], [3, 'TENANT'], [4, 'GUEST'], [5, 'MANAGER']]);

function initialState() {
  return {
    buildings: new Map<number, any>([
      [7, { managerId: 2, isActive: true, manager: { isActive: true } }],
      [8, { managerId: 5, isActive: true, manager: { isActive: true } }],
    ]),
    invoices: new Map<number, any>([
      [70, { id: 70, type: 'DEPOSIT', status: 'UNPAID', total: 2_500_000, buildingId: 7 }],
      [71, { id: 71, type: 'DEPOSIT', status: 'UNPAID', total: 3_000_000, buildingId: 7 }],
      [72, { id: 72, type: 'DEPOSIT', status: 'UNPAID', total: 4_000_000, buildingId: 8 }],
    ]),
    payments: [] as any[],
    audits: [] as any[],
    notifications: [] as any[],
    receipts: new Map<string, any>(),
  };
}

// Model only the Prisma edge. Every projection follows the SELECT supplied by the real service.
function project(row: any, select: any): any {
  if (row === null || row === undefined) return row;
  if (Array.isArray(row)) return row.map(value => project(value, select));
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, value]: [string, any]) =>
    [key, value === true ? row[key] : project(row[key], value.select)]));
}

function receiptKey(scope: { actorId: number; route: string; key: string }) {
  return `${scope.actorId}|${scope.route}|${scope.key}`;
}

describe('BE-P3-16, BE-P4-20 / BIL-11 / API-05: manual payments through HTTP', () => {
  let app: INestApplication;
  let state = initialState();
  let queue = Promise.resolve();
  const db: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => roles.has(where.id)
      ? { id: where.id, role: roles.get(where.id), isActive: true, mustChangePassword: false } : null) },
    building: { findMany: vi.fn(async ({ where }: any) => where.id?.in
      // NOTI-11 responsible staff lookup (SCOPE-04)
      ? where.id.in.map((id: number) => ({ id, ...state.buildings.get(id) }))
      : [...state.buildings].filter(([, building]) => building.managerId === where.managerId && building.isActive).map(([id]) => ({ id }))) },
    notification: { create: vi.fn(async ({ data }: any) => { state.notifications.push(data); return data; }) },
    setting: { findUnique: vi.fn(async () => null) },
    invoice: { findUnique: vi.fn(async ({ where, select }: any) => {
      const row = state.invoices.get(where.id);
      const scope = where.contract?.is ?? where.contract;
      if (!row || (scope?.buildingId && !scope.buildingId.in.includes(row.buildingId))) return null;
      return project({ ...row, contract: { buildingId: row.buildingId, building: state.buildings.get(row.buildingId) } }, select);
    }), findUniqueOrThrow: vi.fn(async ({ where, select }: any) => {
      const row = state.invoices.get(where.id);
      if (!row) throw new Error('Missing fixture invoice');
      return project({ ...row, contract: { buildingId: row.buildingId, tenantId: 9, room: { code: `P${row.id}` },
        tenant: { role: 'TENANT', locale: 'vi', email: null, emailVerifiedAt: null } } }, select);
    }) },
    payment: { create: vi.fn(async ({ data, select }: any) => {
      // Simulate the existing payment trigger at the DB boundary, never the service under test.
      const invoice = state.invoices.get(data.invoiceId);
      if (invoice.status !== 'UNPAID') throw new Error('INVOICE_NOT_UNPAID: fixture trigger');
      if (data.amount !== invoice.total) throw new Error('PAYMENT_AMOUNT_MISMATCH: fixture trigger');
      invoice.status = 'PAID';
      const payment = { id: 300 + state.payments.length, bankTransactionId: null, note: null, ...data };
      state.payments.push(payment);
      return project(payment, select);
    }) },
    auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return data; }) },
    pricingIdempotencyKey: {
      findUnique: vi.fn(async ({ where }: any) => state.receipts.get(receiptKey(where.actorId_route_key)) ?? null),
      create: vi.fn(async ({ data }: any) => {
        state.receipts.set(receiptKey(data), structuredClone(data));
        return data;
      }),
      delete: vi.fn(async ({ where }: any) => state.receipts.delete(receiptKey(where.actorId_route_key))),
    },
    $queryRaw: vi.fn(async () => []),
  };
  // A rollback-capable queue makes HTTP side effects observable; it is not proof of PostgreSQL lock contention.
  db.$transaction = vi.fn((work: (tx: typeof db) => Promise<unknown>) => {
    const task = queue.then(async () => {
      const before = structuredClone(state);
      try { return await work(db); } catch (error) { state = before; throw error; }
    });
    queue = task.then(() => {}, () => {});
    return task;
  });

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', 'test-only-deposit-payment-token-key-0123456789');
    vi.stubEnv('MAIL_PROVIDER', '');
    const { AppModule } = await import('../../app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  beforeEach(() => {
    state = initialState();
    queue = Promise.resolve();
    vi.clearAllMocks();
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });

  async function token(id = 2) {
    return `Bearer ${await app.get(TokenService).signAccessToken({ id, role: roles.get(id)! })}`;
  }
  async function pay(body: unknown = { method: 'CASH' }, options: { id?: string | number; actor?: number; key?: string } = {}) {
    const call = request(app.getHttpServer()).post(`/api/v1/invoices/${options.id ?? 70}/payment`)
      .set('Authorization', await token(options.actor ?? 2));
    if (options.key !== undefined) call.set('Idempotency-Key', options.key);
    return call.send(body);
  }

  it.each(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'])('BIL-11/D-11: records %s at the invoice total with a manual receipt and audit', async method => {
    const result = await pay({ method, paidAt: '2026-11-19T10:15:30+07:00', note: 'Đã nhận đủ cọc' });
    expect(result.status).toBe(201);
    expect(result.body.data).toEqual({ id: 300, invoiceId: 70, amount: 2_500_000, method, source: 'MANUAL',
      paidAt: '2026-11-19T03:15:30.000Z', note: 'Đã nhận đủ cọc', recordedById: 2 });
    expect(state.invoices.get(70).status).toBe('PAID');
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0].bankTransactionId).toBeNull();
    expect(state.audits).toEqual([expect.objectContaining({ actorId: 2, action: 'payment.record', entity: 'payment', entityId: 300 })]);
  });

  it('BIL-11: an omitted paidAt uses the recording time and an omitted note is null', async () => {
    const before = Date.now();
    const result = await pay();
    expect(result.status).toBe(201);
    const paidAt = new Date(result.body.data.paidAt).getTime();
    expect(paidAt).toBeGreaterThanOrEqual(before);
    expect(paidAt).toBeLessThanOrEqual(Date.now());
    expect(result.body.data.note).toBeNull();
  });

  it('API-05: same key with omitted paidAt replays the original receipt after the invoice is PAID', async () => {
    const first = await pay({ method: 'CASH' }, { key: 'repeat-omitted-time' });
    const again = await pay({ method: 'CASH' }, { key: 'repeat-omitted-time' });
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(state.payments).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
    expect(db.pricingIdempotencyKey.create).toHaveBeenCalledOnce();
    expect([...state.receipts.values()][0]).toMatchObject({ actorId: 2, route: PAYMENT_ROUTE, statusCode: 201 });
  });

  it('API-05: equivalent paidAt offsets normalize before hashing', async () => {
    const first = await pay({ method: 'BANK_TRANSFER', paidAt: '2026-11-19T10:15:30+07:00' }, { key: 'offset' });
    const again = await pay({ paidAt: '2026-11-19T03:15:30Z', method: 'BANK_TRANSFER' }, { key: 'offset' });
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(state.payments).toHaveLength(1);
  });

  it('API-05: two simultaneous requests with one key return one receipt and write one payment and audit', async () => {
    const responses = await Promise.all([pay({ method: 'CARD' }, { key: 'parallel' }), pay({ method: 'CARD' }, { key: 'parallel' })]);
    expect(responses.map(response => response.status)).toEqual([201, 201]);
    expect(responses[0].body).toEqual(responses[1].body);
    expect(state.payments).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
    expect(state.receipts.size).toBe(1);
  });

  it('BIL-11: concurrent requests without a key produce one payment and INVOICE_NOT_UNPAID', async () => {
    const responses = await Promise.all([pay(), pay()]);
    expect(responses.map(response => response.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(responses.find(response => response.status === 409)!.body.error.code).toBe('INVOICE_NOT_UNPAID');
    expect(state.payments).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
    expect(state.receipts.size).toBe(0);
  });

  it.each([
    { method: 'CARD' },
    { method: 'CASH', note: 'Different receipt note' },
    { method: 'CASH', paidAt: '2026-11-19T03:15:30Z' },
  ])('API-05: reusing a key with a changed payload %j returns CONFLICT_STATE', async body => {
    expect((await pay({ method: 'CASH' }, { key: 'changed' })).status).toBe(201);
    const result = await pay(body, { key: 'changed' });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT_STATE');
    expect(state.payments).toHaveLength(1);
  });

  it('API-05: invoice ID is included in the request hash', async () => {
    expect((await pay({ method: 'CASH' }, { key: 'invoice-bound' })).status).toBe(201);
    const changed = await pay({ method: 'CASH' }, { id: 71, key: 'invoice-bound' });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe('CONFLICT_STATE');
    expect(state.invoices.get(71).status).toBe('UNPAID');
    expect(state.payments).toHaveLength(1);
  });

  it('API-05: expired keys can be reused for a new invoice without returning the old receipt', async () => {
    expect((await pay({ method: 'CASH' }, { key: 'expired' })).status).toBe(201);
    state.receipts.get(`2|${PAYMENT_ROUTE}|expired`).expiresAt = new Date(Date.now() - 1000);
    const next = await pay({ method: 'CASH' }, { id: 71, key: 'expired' });
    expect(next.status).toBe(201);
    expect(next.body.data).toMatchObject({ id: 301, invoiceId: 71, amount: 3_000_000 });
    expect(state.payments).toHaveLength(2);
    expect(state.receipts.size).toBe(1);
    expect(db.pricingIdempotencyKey.delete).toHaveBeenCalledOnce();
  });

  it('API-05: the same key belongs to its actor rather than another staff account', async () => {
    expect((await pay({ method: 'CASH' }, { actor: 1, key: 'actor-bound' })).status).toBe(201);
    const next = await pay({ method: 'CASH' }, { id: 71, actor: 2, key: 'actor-bound' });
    expect(next.status).toBe(201);
    expect(next.body.data).toMatchObject({ invoiceId: 71, amount: 3_000_000, recordedById: 2 });
    expect(state.receipts.size).toBe(2);
    const sameInvoice = await pay({ method: 'CASH' }, { actor: 2, key: 'actor-bound-other-invoice' });
    expect(sameInvoice.status).toBe(409);
    expect(sameInvoice.body.error.code).toBe('INVOICE_NOT_UNPAID');
    expect(state.payments).toHaveLength(2);
  });

  it.each(['DRAFT', 'PAID', 'CANCELLED', 'SETTLED'])('BIL-11: a %s deposit cannot be paid', async status => {
    state.invoices.get(70).status = status;
    const result = await pay();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('INVOICE_NOT_UNPAID');
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(state.audits).toEqual([]);
  });

  it.each(['MONTHLY', 'FINAL'])('BIL-11 (Phase 4): %s invoices are recorded like deposits', async type => {
    state.invoices.get(70).type = type;
    const result = await pay();
    expect(result.status).toBe(201);
    expect(state.invoices.get(70).status).toBe('PAID');
    expect(state.payments).toHaveLength(1);
  });

  it('Q-P4-1, Q-P4-27, NOTI-11: a payment writes "Đã nhận tiền" for the tenant and for the building staff, even the recorder', async () => {
    expect((await pay()).status).toBe(201);
    expect(state.notifications).toEqual([
      { userId: 9, kind: 'PAYMENT_RECEIVED', title: 'Đã nhận 2.500.000 đ cho hóa đơn TT70', link: '/thue/hoa-don/70' },
      { userId: 2, kind: 'PAYMENT_RECEIVED', title: 'Đã nhận 2.500.000 đ cho hóa đơn TT70 phòng P70', link: '/ql/hoa-don/70' },
    ]);
  });

  it('BIL-11: PAID and CANCELLED invoices → INVOICE_NOT_UNPAID with no payment', async () => {
    for (const status of ['PAID', 'CANCELLED']) {
      state.invoices.get(70).status = status;
      const result = await pay();
      expect(result.status).toBe(409);
      expect(result.body.error.code).toBe('INVOICE_NOT_UNPAID');
    }
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it('SCOPE-02: a foreign manager gets OUT_OF_SCOPE, while Boss can record that building payment', async () => {
    const foreign = await pay({ method: 'CASH' }, { id: 72 });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.payment.create).not.toHaveBeenCalled();
    const boss = await pay({ method: 'OTHER' }, { id: 72, actor: 1 });
    expect(boss.status).toBe(201);
    expect(boss.body.data).toMatchObject({ invoiceId: 72, recordedById: 1 });
  });

  it('SCOPE-02/API-05: reassignment prevents a manager from replaying an earlier payment receipt', async () => {
    expect((await pay({ method: 'CASH' }, { key: 'reassigned' })).status).toBe(201);
    state.buildings.get(7).managerId = 5;
    db.pricingIdempotencyKey.findUnique.mockClear();
    const again = await pay({ method: 'CASH' }, { key: 'reassigned' });
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.pricingIdempotencyKey.findUnique).not.toHaveBeenCalled();
    expect(state.payments).toHaveLength(1);
  });

  it('SCOPE-02: current assignment is checked even when the guard captured the old building IDs', async () => {
    db.building.findMany.mockImplementationOnce(async () => {
      state.buildings.get(7).managerId = 5;
      return [{ id: 7 }];
    });
    const result = await pay();
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it.each(['building', 'manager'])('SCOPE-02: an inactive %s blocks the manager before replay', async inactive => {
    expect((await pay({ method: 'CASH' }, { key: 'inactive' })).status).toBe(201);
    const building = state.buildings.get(7);
    if (inactive === 'building') building.isActive = false;
    else building.manager.isActive = false;
    db.pricingIdempotencyKey.findUnique.mockClear();
    const result = await pay({ method: 'CASH' }, { key: 'inactive' });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.pricingIdempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it('BIL-11: a missing invoice returns NOT_FOUND without writing a payment', async () => {
    const result = await pay({ method: 'CASH' }, { id: 999 });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('NOT_FOUND');
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it('API-07: an unauthenticated request is rejected before accessing invoices', async () => {
    const result = await request(app.getHttpServer()).post('/api/v1/invoices/70/payment').send({ method: 'CASH' });
    expect(result.status).toBe(401);
    expect(db.invoice.findUnique).not.toHaveBeenCalled();
  });

  it.each([3, 4])('API-07: tenant/guest account %s cannot record payment', async actor => {
    const result = await pay({ method: 'CASH' }, { actor });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('FORBIDDEN');
    expect(db.invoice.findUnique).not.toHaveBeenCalled();
  });

  it('AUD-01/API-05: audit failure rolls back payment, invoice state and receipt; retry remains possible', async () => {
    db.auditLog.create.mockRejectedValueOnce(new Error('fixture payment audit failure'));
    const failed = await pay({ method: 'CASH' }, { key: 'audit-rollback' });
    expect(failed.status).toBe(500);
    expect(failed.body.error.code).toBe('INTERNAL_ERROR');
    expect(state.invoices.get(70).status).toBe('UNPAID');
    expect(state.payments).toEqual([]);
    expect(state.audits).toEqual([]);
    expect(state.receipts.size).toBe(0);
    const retried = await pay({ method: 'CASH' }, { key: 'audit-rollback' });
    expect(retried.status).toBe(201);
    expect(state.payments).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
    expect(state.receipts.size).toBe(1);
  });

  it.each(['INVOICE_NOT_UNPAID', 'PAYMENT_AMOUNT_MISMATCH'])('BIL-11/API-03: maps the %s DB trigger without exposing raw messages', async code => {
    db.payment.create.mockRejectedValueOnce(new Error(`${code}: private SQL fixture details`));
    const result = await pay();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe(code);
    expect(JSON.stringify(result.body)).not.toContain('private SQL');
    expect(state.invoices.get(70).status).toBe('UNPAID');
    expect(state.payments).toEqual([]);
    expect(state.audits).toEqual([]);
  });

  it('API-04/D-10: rejects client-controlled money/source/actor and malformed receipt fields before DB work', async () => {
    const invalidBodies = [
      {}, { method: null }, { method: 'CHEQUE' }, { method: 'cash' },
      { method: 'CASH', amount: 1 }, { method: 'CASH', source: 'WEBHOOK' }, { method: 'CASH', recordedById: 1 },
      { method: 'CASH', bankTransactionId: 20 },
      { method: 'CASH', paidAt: null }, { method: 'CASH', paidAt: 1731986130 },
      { method: 'CASH', paidAt: '2026-11-19' }, { method: 'CASH', paidAt: '2026-11-19T10:15:30' },
      { method: 'CASH', paidAt: '2026-02-30T10:15:30Z' }, { method: 'CASH', paidAt: 'invalid' },
      { method: 'CASH', note: null }, { method: 'CASH', note: 7 }, { method: 'CASH', note: 'bad\0note' },
    ];
    for (const body of invalidBodies) {
      const result = await pay(body);
      expect(result.status, JSON.stringify(body)).toBe(400);
      expect(result.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.payment.create).not.toHaveBeenCalled();
  });

  it('API-04: rejects invoice IDs outside positive Int4 before accessing the invoice', async () => {
    for (const id of ['0', '-1', '1.5', '2147483648', 'not-an-id']) {
      expect((await pay({ method: 'CASH' }, { id })).status).toBe(400);
    }
    expect(db.invoice.findUnique).not.toHaveBeenCalled();
  });

  it('API-05: empty or oversized idempotency keys are rejected before a transaction', async () => {
    for (const key of ['', 'k'.repeat(256)]) {
      const result = await pay({ method: 'CASH' }, { key });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('VALIDATION_FAILED');
      expect(result.body.error.fields.idempotencyKey).toBeTruthy();
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
