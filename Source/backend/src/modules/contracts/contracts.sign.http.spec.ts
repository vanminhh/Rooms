import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { PENDING_TENANT_PASSWORD_HASH, verifyPassword } from '../../common/crypto/password.js';
import { todayHanoi } from '../../common/date/today.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';

const scan = { assetId: 'private-scan-42', publicId: 'contracts/7/42/contract-scan-fixture', version: 1730612345, format: 'pdf' };
const bank = { bankBin: '970436', accountNo: '0000000000', accountName: 'TRO THONG MINH' };
const metadata = () => ({ asset_id: scan.assetId, public_id: scan.publicId, asset_folder: 'contracts/7/42',
  version: scan.version, format: 'pdf', resource_type: 'image', type: 'authenticated' });

function initialState() {
  return {
    tenant: { id: 15, role: 'TENANT', phone: '0912345678', fullName: 'Người ký', email: null,
      passwordHash: PENDING_TENANT_PASSWORD_HASH, mustChangePassword: true, isActive: false },
    contract: { id: 42, code: 'HD000042', buildingId: 7, tenantId: 15, status: 'HOLD', signedAt: null as Date | null,
      startDate: new Date('2027-01-31'), endDate: new Date('2027-04-29'), termMonths: 3, rent: 2_500_000,
      deposit: 2_500_000, previousContractId: null as number | null, createdAt: new Date('2026-11-01T03:00:00Z') },
    managerId: 2, bank: { ...bank } as unknown, invoices: [] as any[], audits: [] as any[],
    otherContract: null as any,
  };
}

// The Prisma edge projects each actual SELECT, including the nested tenant projection.
function project(row: any, select: any): any {
  if (row == null) return null; // e.g. no settlement yet (Q-P4-54)
  if (Array.isArray(row)) return row.map(value => project(value, select));
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, value]: [string, any]) =>
    [key, value === true ? row[key] : project(row[key], value.select)]));
}

describe('BE-P3-13..15: staff signing through HTTP', () => {
  let app: INestApplication;
  let state = initialState();
  const roles = new Map<number, Role>([[1, 'BOSS'], [2, 'MANAGER'], [3, 'TENANT'], [4, 'GUEST'], [5, 'MANAGER'], [15, 'TENANT']]);
  const fetchMetadata = vi.fn();
  const db: any = {
    user: {
      findUnique: vi.fn(async ({ where }: any) => where.id === state.tenant.id ? state.tenant :
        roles.has(where.id) ? { id: where.id, role: roles.get(where.id), isActive: true, mustChangePassword: false } : null),
      findUniqueOrThrow: vi.fn(async () => structuredClone(state.tenant)),
      update: vi.fn(async ({ data }: any) => Object.assign(state.tenant, data)),
    },
    building: { findMany: vi.fn(async ({ where }: any) => where.managerId === 2 ? [{ id: 7 }] : []) },
    contract: {
      count: vi.fn(async ({ where }: any) => where.tenantId === 15 ? 1 : 0),
      findMany: vi.fn(async ({ where, select }: any) => where.tenantId === 15 ? [await db.contract.findUnique({ where: { id: 42 }, select })] : []),
      findFirst: vi.fn(async ({ where, select }: any) => where.tenantId === 15 && where.id === 42
        ? db.contract.findUnique({ where: { id: 42 }, select }) : null),
      findUnique: vi.fn(async ({ where, select }: any) => {
        const row = where.id === 42 ? state.contract : state.otherContract?.id === where.id ? state.otherContract : null;
        if (!row || (where.buildingId && !where.buildingId.in.includes(7))) return null;
        return project({ ...row, tenant: state.tenant, room: { id: 30, code: 'P301' },
          building: { id: 7, code: 'CG01', name: 'Tòa A', isActive: true, managerId: state.managerId, manager: { isActive: true } },
          occupants: [], vehicles: [], services: [], invoices: state.invoices, settlement: null, terms: null, movedInAt: null,
        }, select);
      }),
      update: vi.fn(async ({ where, data, select }: any) => {
        Object.assign(where.id === 42 ? state.contract : state.otherContract, data);
        return db.contract.findUnique({ where, select });
      }),
    },
    invoice: { create: vi.fn(async ({ data, select }: any) => {
      const row = { id: 70 + state.invoices.length, ...data };
      state.invoices.push(row);
      return project(row, select);
    }) },
    setting: { findUnique: vi.fn(async () => ({ value: state.bank })) },
    auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); }) },
    $queryRaw: vi.fn(async () => []),
  };
  let queue = Promise.resolve();
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
    vi.stubEnv('JWT_SECRET', 'test-only-sign-contract-token-key-0123456789');
    vi.stubEnv('CLOUDINARY_URL', 'cloudinary://test-key:test-secret@rooms-test');
    const { AppModule } = await import('../../app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  beforeEach(() => {
    state = initialState();
    vi.clearAllMocks();
    fetchMetadata.mockImplementation(async () => new Response(JSON.stringify(metadata()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMetadata);
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  async function token(id = 2) { return `Bearer ${await app.get(TokenService).signAccessToken({ id, role: roles.get(id)! })}`; }
  async function sign(id = 2, body: unknown = scan) {
    return request(app.getHttpServer()).post('/api/v1/contracts/42/sign').set('Authorization', await token(id)).send(body);
  }

  it('CON-06..09/BIL-10/A-02: activates a new signer, creates one deposit and returns a ten-character password once', async () => {
    const result = await sign();
    expect(result.status).toBe(201);
    expect(result.headers['cache-control']).toBe('no-store');
    const password = result.body.data.temporaryPassword;
    expect(password).toHaveLength(10);
    expect(await verifyPassword(state.tenant.passwordHash, password)).toBe(true);
    expect(state.tenant).toMatchObject({ isActive: true, mustChangePassword: true });
    expect(state.contract).toMatchObject({ status: 'HOLD', signedScanAssetId: scan.assetId, signedAt: expect.any(Date) });
    expect(state.invoices).toEqual([expect.objectContaining({
      type: 'DEPOSIT', status: 'UNPAID', total: 2_500_000, issueDate: todayHanoi(), dueDate: state.contract.startDate,
      lines: { create: { kind: 'DEPOSIT', label: 'Tiền cọc', quantity: 1, unitPrice: 2_500_000, amount: 2_500_000 } },
    })]);
    const deposit = result.body.data.depositInvoice;
    expect(deposit.vietqr).toEqual({ ...bank, amount: 2_500_000, content: 'TT70' });
    const url = new URL(deposit.qrImageUrl);
    expect(url.pathname).toBe('/image/970436-0000000000-compact2.png');
    expect(Object.fromEntries(url.searchParams)).toEqual({ amount: '2500000', addInfo: 'TT70', accountName: bank.accountName });
    expect(state.audits).toEqual([expect.objectContaining({ action: 'contract.sign', entityId: 42 })]);
    expect(JSON.stringify(state.audits)).not.toContain(password);
    expect(JSON.stringify(state.invoices)).not.toContain(password);
    const repeat = await sign();
    expect(repeat.status).toBe(409);
    expect(repeat.body.error.code).toBe('CONFLICT_STATE');
    expect(fetchMetadata).toHaveBeenCalledOnce();
    const detail = await request(app.getHttpServer()).get('/api/v1/contracts/42').set('Authorization', await token());
    expect(detail.status).toBe(200);
    expect(detail.body.data.depositInvoice).toEqual(deposit);
    expect(detail.body.data).not.toHaveProperty('temporaryPassword');
    expect(detail.body.data).not.toHaveProperty('signedScanAssetId');
    const requiresChange = await request(app.getHttpServer()).get('/api/v1/me/contracts').set('Authorization', await token(15));
    expect(requiresChange.status).toBe(403);
    expect(requiresChange.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('CON-07/D-26: a reused tenant keeps the original password and receives no new password', async () => {
    state.tenant.isActive = true;
    state.tenant.mustChangePassword = false;
    state.tenant.passwordHash = 'existing-password-hash';
    const result = await sign();
    expect(result.status).toBe(201);
    expect(result.body.data).not.toHaveProperty('temporaryPassword');
    expect(state.tenant.passwordHash).toBe('existing-password-hash');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('CON-06/09: simultaneous signing of one contract returns one password and one conflict', async () => {
    const responses = await Promise.all([sign(), sign()]);
    expect(responses.map(response => response.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(responses.filter(response => response.body.data?.temporaryPassword)).toHaveLength(1);
    expect(state.invoices).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
  });

  it('CON-07/A-22: signing two HOLDs with the same pending tenant generates exactly one password', async () => {
    state.otherContract = { ...state.contract, id: 43, code: 'HD000043' };
    const secondScan = { ...scan, assetId: 'private-scan-43', publicId: 'contracts/7/43/contract-scan-fixture' };
    fetchMetadata.mockImplementation(async (url: string) => new Response(JSON.stringify(
      url.endsWith(secondScan.assetId) ? { ...metadata(), asset_id: secondScan.assetId, public_id: secondScan.publicId, asset_folder: 'contracts/7/43' } : metadata(),
    )));
    const other = request(app.getHttpServer()).post('/api/v1/contracts/43/sign').set('Authorization', await token()).send(secondScan);
    const responses = await Promise.all([sign(), other]);
    expect(responses.map(response => response.status)).toEqual([201, 201]);
    const passwords = responses.flatMap(response => response.body.data.temporaryPassword ? [response.body.data.temporaryPassword] : []);
    expect(passwords).toHaveLength(1);
    expect(await verifyPassword(state.tenant.passwordHash, passwords[0])).toBe(true);
    expect(state.invoices).toHaveLength(2);
    expect(db.user.update).toHaveBeenCalledOnce();
  });

  it('SCOPE-03/BIL-10: tenants receive their own deposit QR and a foreign contract stays 404', async () => {
    state.tenant.isActive = true;
    state.tenant.mustChangePassword = false;
    state.tenant.passwordHash = 'existing-password-hash';
    expect((await sign()).status).toBe(201);
    const getMine = (id: number) => token(id).then(auth => request(app.getHttpServer()).get('/api/v1/me/contracts/42').set('Authorization', auth));
    const own = await getMine(15);
    expect(own.status).toBe(200);
    expect(own.headers['cache-control']).toBe('no-store');
    expect(own.body.data.depositInvoice.vietqr.content).toBe('TT70');
    expect(db.contract.findFirst.mock.calls[0][0].where).toEqual({ id: 42, tenantId: 15 });
    expect((await getMine(3)).status).toBe(404);
    expect((await getMine(4)).status).toBe(403);
    const list = await request(app.getHttpServer()).get('/api/v1/me/contracts?page=1&limit=20').set('Authorization', await token(15));
    expect(list.status).toBe(200);
    expect(list.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
    expect(db.contract.count.mock.calls[0][0].where).toEqual({ tenantId: 15 });
  });

  it.each([0, 'renewal'])('CON-08: %s creates no additional deposit invoice', async kind => {
    if (kind === 0) state.contract.deposit = 0;
    else state.contract.previousContractId = 11;
    const result = await sign();
    expect(result.status).toBe(201);
    expect(result.body.data.depositInvoice).toBeNull();
    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  it('A-02: signing after the move-in date makes the deposit due today', async () => {
    state.contract.startDate = new Date('2026-01-01');
    expect((await sign()).status).toBe(201);
    expect(state.invoices[0].dueDate).toEqual(todayHanoi());
  });

  it('CON-06/D-37: a public scan is refused before any transaction changes', async () => {
    fetchMetadata.mockImplementationOnce(async () => new Response(JSON.stringify({ ...metadata(), type: 'upload' })));
    const result = await sign();
    expect(result.status).toBe(400);
    expect(result.body.error.fields.assetId).toBeTruthy();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(state.contract.signedAt).toBeNull();
  });

  it.each([3, 4, 5])('SCOPE-02/05: account %s cannot sign or query the provider outside staff scope', async id => {
    expect((await sign(id)).status).toBe(403);
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it('SCOPE-02: reassignment during provider verification prevents signing', async () => {
    fetchMetadata.mockImplementationOnce(async () => {
      state.managerId = 5;
      return new Response(JSON.stringify(metadata()));
    });
    const result = await sign();
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('CON-06: a signature committed during provider verification is rejected on the locked read', async () => {
    fetchMetadata.mockImplementationOnce(async () => {
      state.contract.signedAt = new Date();
      return new Response(JSON.stringify(metadata()));
    });
    const result = await sign();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT_STATE');
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  it('CON-07/D-26: a staff-locked tenant is not activated while signing', async () => {
    state.tenant.passwordHash = 'staff-locked-existing-hash';
    const result = await sign();
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(state.contract.signedAt).toBeNull();
  });

  it('CON-06..09: audit failure rolls back activation, signed state and deposit', async () => {
    db.auditLog.create.mockRejectedValueOnce(new Error('fixture audit failure'));
    expect((await sign()).status).toBe(500);
    expect(state.tenant).toMatchObject({ isActive: false, passwordHash: PENDING_TENANT_PASSWORD_HASH });
    expect(state.contract.signedAt).toBeNull();
    expect(state.invoices).toEqual([]);
  });

  it('CON-08/BIL-10: invalid bank configuration rolls back the whole signing operation', async () => {
    state.bank = null;
    expect((await sign()).status).toBe(500);
    expect(state.contract.signedAt).toBeNull();
    expect(state.tenant.isActive).toBe(false);
    expect(state.invoices).toEqual([]);
  });

  it('API-04/CON-06: invalid scan fields fail validation before the provider request', async () => {
    for (const data of [{ ...scan, version: null }, { ...scan, format: 'exe' }, { ...scan, url: 'untrusted' }]) {
      expect((await sign(2, data)).status).toBe(400);
    }
    expect(fetchMetadata).not.toHaveBeenCalled();
  });
});
