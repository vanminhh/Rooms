import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { createFakePrisma } from '../../../test/fixtures/fake-prisma.js';

describe('BE-P5-26 settings and consumption HTTP', () => {
  let app: INestApplication;
  let boss: string, manager: string, tenant: string;
  const bank = { bankBin: '970436', accountNo: '1234', accountName: 'ROOMS', bankName: 'VCB' };
  const findFirst = vi.fn(), findMany = vi.fn(), audit = vi.fn(), upsert = vi.fn();
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'test-only-operations');
    vi.stubEnv('BANK_WEBHOOK_SECRET', 'test-only-webhook');
    const db = await createFakePrisma();
    db.account('tenant').mustChangePassword = false;
    const setting = { findMany: async () => [{ key: 'bank_account', value: bank },
      { key: 'email_templates', value: { obsolete: { vi: { text: 'legacy' } },
        emailCode: { vi: { subject: 'Code', text: '{code}' }, en: { subject: 'Broken', text: 'x' } } } }],
      findUnique: async () => ({ value: bank }), upsert };
    const tx = { setting, auditLog: { create: audit }, $queryRaw: vi.fn() };
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService)
      .useValue({ ...db, setting, contract: { findFirst }, invoice: { findMany }, meterReading: { findMany: async () => [] },
        $transaction: (run: (t: typeof tx) => unknown) => run(tx) }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    const tokens = app.get(TokenService);
    boss = await tokens.signAccessToken({ id: 1, role: 'BOSS' });
    manager = await tokens.signAccessToken({ id: 2, role: 'MANAGER' });
    tenant = await tokens.signAccessToken({ id: 4, role: 'TENANT' });
  });
  afterAll(async () => { await app.close(); vi.unstubAllEnvs(); });
  const api = (method: 'get' | 'patch', path: string, token: string) => request(app.getHttpServer())[method]('/api/v1/' + path)
    .set('Authorization', 'Bearer ' + token);

  it('allows only Boss to manage settings and returns only webhook status', async () => {
    await api('get', 'settings', manager).expect(403);
    await api('patch', 'settings', manager).send({ key: 'bank_account', value: bank }).expect(403);
    const res = await api('get', 'settings', boss).expect(200);
    expect(res.body.data.webhook).toEqual({ enabled: true, provider: 'SEPAY' });
    expect(res.body.data.bank_account).toEqual(bank);
    expect(res.body.data.email_templates).toEqual({ emailCode: { vi: { subject: 'Code', text: '{code}' } } });
    expect(JSON.stringify(res.body)).not.toContain('test-only-webhook');
  });
  it('rejects invalid settings before writing and audits valid changes', async () => {
    for (const [key, value] of [
      ['webhook', {}], ['unknown', {}], ['bank_account', { bankBin: '970436' }],
      ['email_templates', { emailCode: { vi: { subject: 'Code', text: 'Missing placeholder' } } }],
      ['contract_template', { content: 'x', isDraft: false }], ['contract_template', '{{tenant.password}}'],
      ['default_contact', { facebookUrl: 'javascript:alert(1)' }],
    ]) await api('patch', 'settings', boss).send({ key, value }).expect(400);
    expect(upsert).not.toHaveBeenCalled();
    await api('patch', 'settings', boss).send({ key: 'bank_account', value: { ...bank, accountNo: '5678' } }).expect(200);
    expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'settings.change',
      before: { key: 'bank_account', value: bank }, after: { key: 'bank_account', value: { ...bank, accountNo: '5678' } } }) });
  });
  it('scopes consumption to the caller and returns measured units for the available periods', async () => {
    await api('get', 'me/consumption', manager).expect(403);
    await api('get', 'me/consumption?periods=7', tenant).expect(400);
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 6 });
    await api('get', 'me/consumption?contractId=99', tenant).expect(404);
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: 99, tenantId: 4 });
    const bill = { periodStart: null, periodEnd: null, meterReadings: [] };
    findMany.mockResolvedValue([{ ...bill, periodNo: 2, lines: [{ kind: 'WATER', meta: { consumption: 0 } }] },
      { ...bill, periodNo: 1, lines: [{ kind: 'ELECTRIC', meta: { consumption: 80 } }, { kind: 'WATER', meta: { people: 3 } }] }]);
    const res = await api('get', 'me/consumption?periods=6', tenant).expect(200);
    expect(res.body.data).toMatchObject([{ periodNo: 1, electricKwh: 80, waterM3: null }, { periodNo: 2, waterM3: 0 }]);
  });
});
