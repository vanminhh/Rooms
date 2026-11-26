import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AppModule } from '../../app.module.js';
import { BankService } from './bank.service.js';
import { BANK_ADAPTER } from './webhook-adapter.js';
import { sepayAdapter } from './sepay-adapter.js';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';

const secret = 'fixture-key';
const event = { id: 92704, gateway: 'MBBank', transactionDate: '2024-07-02 11:08:33', accountNumber: '1017588888',
  subAccount: '', code: null, content: 'TT1523 P203', transferType: 'in', transferAmount: 5000000 };
function signed(body = event, key = secret) {
  const rawBody = Buffer.from(JSON.stringify(body, null, 2));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', key).update(timestamp + '.').update(rawBody).digest('hex');
  return { body, rawBody, headers: { 'x-sepay-signature': 'sha256=' + signature, 'x-sepay-timestamp': timestamp } };
}

// Only the database is replaced. Signature verification, parsing, matching and notification logic run together.
const db = {
  setting: { findUnique: vi.fn() }, bankTransaction: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  $transaction: vi.fn(), $queryRaw: vi.fn(), invoice: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  payment: { create: vi.fn() }, auditLog: { create: vi.fn() }, notification: { create: vi.fn() }, building: { findMany: vi.fn() },
};
let moduleRef: TestingModule;
let bank: BankService;
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv('BANK_WEBHOOK_SECRET', secret);
  db.setting.findUnique.mockResolvedValue({ value: { accountNo: event.accountNumber } });
  db.$transaction.mockImplementation((work: (tx: typeof db) => Promise<unknown>) => work(db));
  db.bankTransaction.create.mockResolvedValue({ id: 12 });
  db.invoice.findUnique.mockResolvedValue({ total: 5000000, status: 'UNPAID' });
  db.invoice.findUniqueOrThrow.mockResolvedValue({ total: 5000000, contract: {
    buildingId: 1, tenantId: 2, room: { code: 'P203' }, tenant: { role: 'TENANT', email: null } } });
  db.building.findMany.mockResolvedValue([{ id: 1, managerId: 3, manager: { isActive: true } }]);
  db.payment.create.mockResolvedValue({ id: 15 });
  moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService).useValue(db).overrideProvider(BANK_ADAPTER).useValue(sepayAdapter).compile();
  bank = moduleRef.get(BankService);
});
afterEach(async () => { await moduleRef?.close(); vi.unstubAllEnvs(); });

it('BANK-01: a wrong SePay secret returns 401 before accessing storage', async () => {
  await expect(bank.processWebhook(signed(event, 'wrong'))).rejects.toMatchObject({ status: 401 });
  expect(db.setting.findUnique).not.toHaveBeenCalled();
  expect(db.$transaction).not.toHaveBeenCalled();
});

it('BANK-02/03: an exact TT credit records one payment across a duplicate delivery', async () => {
  await expect(bank.processWebhook(signed())).resolves.toMatchObject({ matched: 1 });
  db.bankTransaction.create.mockRejectedValueOnce(new Error('duplicate provider ID'));
  db.bankTransaction.findUnique.mockResolvedValueOnce({ id: 12 });
  await expect(bank.processWebhook(signed())).resolves.toMatchObject({ duplicates: 1 });
  expect(db.payment.create).toHaveBeenCalledTimes(1);
  expect(db.payment.create.mock.calls[0][0].data).toMatchObject({ invoiceId: 1523, amount: 5000000, source: 'WEBHOOK' });
});

it.each(['wrong amount', 'unknown invoice', 'other account'])('BANK-04: %s stays unmatched', async reason => {
  if (reason === 'unknown invoice') db.invoice.findUnique.mockResolvedValueOnce(null);
  const body = { ...event };
  if (reason === 'wrong amount') body.transferAmount--;
  if (reason === 'other account') body.accountNumber = '1000000000';
  await expect(bank.processWebhook(signed(body))).resolves.toMatchObject({ received: 1, matched: 0 });
  expect(db.bankTransaction.create.mock.calls[0][0].data.status).toBe('UNMATCHED');
  expect(db.bankTransaction.update.mock.calls[0][0].data.note).toBeTruthy();
  expect(db.payment.create).not.toHaveBeenCalled();
});

it('BANK-01/02: debit skipped, failed persistence remains retryable', async () => {
  await expect(bank.processWebhook(signed({ ...event, transferType: 'out' }))).resolves.toMatchObject({ skipped: 1 });
  expect(db.bankTransaction.create).not.toHaveBeenCalled();
  db.$transaction.mockRejectedValueOnce(new Error('database unavailable'));
  db.bankTransaction.findUnique.mockResolvedValueOnce(null);
  await expect(bank.processWebhook(signed())).rejects.toThrow('database unavailable');
});

it('BANK-01: signed HTTP body receives a top-level SePay acknowledgement after storage', async () => {
  const app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app);
  await app.init();
  try {
    const req = signed();
    await request(app.getHttpServer()).post('/api/v1/webhooks/bank').set(req.headers).type('json')
      .send(req.rawBody.toString()).expect(200, { success: true });
    expect(db.payment.create).toHaveBeenCalledTimes(1);
  } finally { await app.close(); }
});
