import { Test } from '@nestjs/testing';
import { createHmac, randomInt } from 'node:crypto';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { BANK_ADAPTER } from '../src/modules/bank/webhook-adapter.js';
import { sepayAdapter } from '../src/modules/bank/sepay-adapter.js';
import { rollbackPrismaFacade } from './fixtures/rollback-prisma.js';

it('BANK-01/02/04: signed SePay HTTP deliveries persist a single unmatched credit on PostgreSQL', async () => {
  const secret = 'sepay-e2e-fixture-key';
  vi.stubEnv('BANK_WEBHOOK_SECRET', secret);
  const prisma = new PrismaService();
  const id = randomInt(1_000_000_000_000, 2_000_000_000_000);
  const where = { provider: 'SEPAY' as const, providerTxId: String(id) };
  const rollback = new Error('expected fixture rollback');
  try {
    await expect(prisma.$transaction(async tx => {
      const { AppModule } = await import('../src/app.module.js');
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService).useValue(rollbackPrismaFacade(tx))
        .overrideProvider(BANK_ADAPTER).useValue(sepayAdapter).compile();
      const app = moduleRef.createNestApplication({ rawBody: true });
      configureApp(app);
      try {
        await app.init();
        const account = await tx.setting.findUniqueOrThrow({ where: { key: 'bank_account' } });
        const body = JSON.stringify({ id, transferType: 'in', gateway: 'MBBank', transferAmount: 5000000,
          accountNumber: (account.value as { accountNo: string }).accountNo, transactionDate: '2024-07-02 11:08:33',
          content: 'Thanh toán phòng', code: null }, null, 2);
        const timestamp = String(Math.floor(Date.now() / 1000));
        const send = (key: string) => request(app.getHttpServer()).post('/api/v1/webhooks/bank').type('json')
          .set('X-SePay-Timestamp', timestamp)
          .set('X-SePay-Signature', 'sha256=' + createHmac('sha256', key).update(timestamp + '.' + body).digest('hex'))
          .send(body);
        await send('wrong-key').expect(401);
        expect(await tx.bankTransaction.count({ where })).toBe(0);
        await send(secret).expect(200, { success: true });
        await send(secret).expect(200, { success: true });
        expect(await tx.bankTransaction.findMany({ where, select: { status: true, amount: true, invoiceId: true } }))
          .toEqual([{ status: 'UNMATCHED', amount: 5000000, invoiceId: null }]);
      } finally { await app.close(); }
      throw rollback;
    }, { timeout: 120000 })).rejects.toBe(rollback);
    expect(await prisma.bankTransaction.count({ where })).toBe(0);
  } finally {
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  }
});
