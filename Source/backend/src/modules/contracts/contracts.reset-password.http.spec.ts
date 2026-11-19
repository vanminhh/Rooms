import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { createFakePrisma, type FakePrisma, IDS } from '../../../test/fixtures/fake-prisma.js';
import { configureApp } from '../../app.setup.js';
import { PENDING_TENANT_PASSWORD_HASH, verifyPassword } from '../../common/crypto/password.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { MailerService } from '../mailer/mailer.service.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const PHONE = '0900000004';
const ORIGINAL_PASSWORD = 'NguoiThue@2026';
const CHANGED_PASSWORD = 'Changed-by-tenant@2026';
const CONTRACT_ID = IDS.contracts.HD000001;
const RESET_LINK = 'R'.repeat(43);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
type Who = keyof typeof IDS.users;

function project(row: any, select: any): any {
  if (row === null || row === undefined) return row;
  if (Array.isArray(row)) return row.map(value => project(value, select));
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, value]: [string, any]) =>
    [key, value === true ? row[key] : project(row[key], value.select)]));
}

function refreshCookie(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cookies?.find(value => value.startsWith('rt='));
  if (!cookie) throw new Error('Fixture login has no refresh cookie');
  return cookie.split(';')[0];
}

describe('BE-P3-17 / AUTH-07 / AUTH-T3: staff resets a contract tenant password through HTTP', () => {
  let app: INestApplication;
  let fake: FakePrisma;
  let queue = Promise.resolve();
  const mailer = { send: vi.fn(async () => {}) };

  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', 'test-only-staff-contract-reset-0123456789abcdef');
    vi.stubEnv('MAIL_PROVIDER', '');
    fake = await createFakePrisma();
    fake.account('tenant').mustChangePassword = false;
    Object.assign(fake.db.contract[0], {
      status: 'HOLD', startDate: new Date('2027-01-01'), endDate: new Date('2027-03-31'), termMonths: 3,
      rent: 2_500_000, deposit: 2_500_000, createdAt: new Date('2026-11-01T03:00:00Z'),
      terms: null, signedAt: new Date('2026-11-01T03:00:00Z'), movedInAt: null,
    });
    const contractLookup = async ({ where, select }: any) => {
      const contract = fake.db.contract.find(row => row.id === where.id &&
        (!where.buildingId || where.buildingId.in.includes(row.buildingId)) &&
        (where.tenantId === undefined || row.tenantId === where.tenantId));
      if (!contract) return null;
      const tenant = fake.db.user.find(row => row.id === contract.tenantId);
      const building = fake.db.building.find(row => row.id === contract.buildingId)!;
      const manager = fake.db.user.find(row => row.id === building.managerId) ?? null;
      return project({ ...contract, tenant, building: { ...building, manager }, room: { id: 30, code: 'P301' },
        occupants: [], vehicles: [], services: [], invoices: [],
      }, select);
    };
    fake.contract.findUnique = vi.fn(contractLookup);
    fake.contract.findFirst = vi.fn(contractLookup);
    (fake.user as any).findUniqueOrThrow = vi.fn(async (args: any) => {
      const user = await fake.user.findUnique(args);
      if (!user) throw new Error('Missing fixture user');
      return user;
    });
    queue = Promise.resolve();
    // The DB edge queues whole transactions and restores every table on error.
    // This verifies rollback in the fake; it does not prove PostgreSQL multi-connection locking.
    fake.$transaction = async (work: (tx: any) => Promise<any>) => {
      const task = queue.then(async () => {
        const before = Object.fromEntries(Object.entries(fake.db).map(([key, rows]) => [key, structuredClone(rows)]));
        try { return await work(fake); } catch (error) {
          for (const [key, rows] of Object.entries(fake.db)) rows.splice(0, rows.length, ...before[key]);
          throw error;
        }
      });
      queue = task.then(() => {}, () => {});
      return task;
    };
    const { AppModule } = await import('../../app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(fake)
      .overrideProvider(MailerService).useValue(mailer).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    mailer.send.mockClear();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    vi.unstubAllEnvs();
  });

  async function token(who: Who = 'manager1') {
    return app.get(TokenService).signAccessToken({ id: IDS.users[who], role: fake.account(who).role as Role });
  }
  async function reset(who: Who = 'manager1', id: string | number = CONTRACT_ID, key?: string) {
    const call = request(app.getHttpServer()).post(`/api/v1/contracts/${id}/reset-password`)
      .set('Authorization', `Bearer ${await token(who)}`);
    if (key !== undefined) call.set('Idempotency-Key', key);
    return call;
  }
  function login(password: string, phone = PHONE) {
    return request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone, password });
  }
  function me(accessToken: string) {
    return request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
  }
  function refresh(cookie: string) {
    return request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie);
  }
  async function seedResetLink(userId: number = IDS.users.tenant) {
    await fake.passwordResetToken.create({ data: { userId, tokenHash: sha256(RESET_LINK), expiresAt: new Date(Date.now() + 3_600_000) } });
  }
  function resetEvents() { return fake.db.auditLog.filter(row => row.action === 'user.reset_password_by_staff'); }

  it('AUTH-07/AUTH-T3/AUD-01: returns one ten-character password, hashes it, revokes sessions and invalidates old links', async () => {
    const oldLogin = await login(ORIGINAL_PASSWORD);
    expect(oldLogin.status).toBe(200);
    expect((await login(ORIGINAL_PASSWORD)).status).toBe(200);
    await seedResetLink();
    await fake.session.create({ data: { userId: IDS.users.guest, tokenHash: sha256('unrelated-refresh-fixture'), expiresAt: new Date(Date.now() + 3_600_000) } });
    await fake.passwordResetToken.create({ data: { userId: IDS.users.guest, tokenHash: sha256('G'.repeat(43)), expiresAt: new Date(Date.now() + 3_600_000) } });
    const originalHash = fake.account('tenant').passwordHash;
    const result = await reset();
    expect(result.status).toBe(201);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(Object.keys(result.body.data)).toEqual(['temporaryPassword']);
    const password = result.body.data.temporaryPassword;
    expect(password).toHaveLength(10);
    expect(fake.account('tenant')).toMatchObject({ isActive: true, mustChangePassword: true });
    expect(fake.account('tenant').passwordHash).not.toBe(originalHash);
    expect(await verifyPassword(fake.account('tenant').passwordHash as string, password)).toBe(true);
    expect(fake.db.session.filter(row => row.userId === IDS.users.tenant)).toHaveLength(2);
    expect(fake.db.session.filter(row => row.userId === IDS.users.tenant).every(row => row.revokedAt instanceof Date)).toBe(true);
    expect(fake.db.passwordResetToken[0].usedAt).toBeInstanceOf(Date);
    expect(fake.db.session.find(row => row.userId === IDS.users.guest)!.revokedAt).toBeNull();
    expect(fake.db.passwordResetToken.find(row => row.userId === IDS.users.guest)!.usedAt).toBeNull();
    expect(resetEvents()).toEqual([expect.objectContaining({
      actorId: IDS.users.manager1, entity: 'user', entityId: IDS.users.tenant, after: { contractId: CONTRACT_ID },
    })]);
    expect(JSON.stringify(fake.db.auditLog)).not.toContain(password);
    expect(JSON.stringify(fake.db.auditLog)).not.toContain('$argon2');
    expect((await me(oldLogin.body.data.accessToken)).status).toBe(401);
    expect((await refresh(refreshCookie(oldLogin))).status).toBe(401);
    expect((await login(ORIGINAL_PASSWORD)).status).toBe(401);
    const invalidLink = await request(app.getHttpServer()).post('/api/v1/auth/reset-password')
      .send({ token: RESET_LINK, newPassword: CHANGED_PASSWORD });
    expect(invalidLink.status).toBe(400);
    expect(invalidLink.body.error.fields.token).toBeTruthy();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('AUTH-05/AUTH-T3: temporary login forces change, keeps its current refresh session and never revives old access', async () => {
    const before = await login(ORIGINAL_PASSWORD);
    expect(before.status).toBe(200);
    const resetResult = await reset();
    expect(resetResult.status).toBe(201);
    const temporaryPassword = resetResult.body.data.temporaryPassword;
    const temporaryLogin = await login(temporaryPassword);
    expect(temporaryLogin.status).toBe(200);
    expect(temporaryLogin.body.data.user.mustChangePassword).toBe(true);
    const currentCookie = refreshCookie(temporaryLogin);
    const access = temporaryLogin.body.data.accessToken;
    const blocked = await request(app.getHttpServer()).patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${access}`).send({ locale: 'en' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const change = await request(app.getHttpServer()).post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${access}`).set('Cookie', currentCookie)
      .send({ currentPassword: temporaryPassword, newPassword: CHANGED_PASSWORD });
    expect(change.status).toBe(200);
    expect(fake.account('tenant').mustChangePassword).toBe(false);
    expect((await me(before.body.data.accessToken)).status).toBe(401);
    expect((await me(access)).status).toBe(401);
    const refreshed = await refresh(currentCookie);
    expect(refreshed.status).toBe(200);
    const current = await me(refreshed.body.data.accessToken);
    expect(current.status).toBe(200);
    expect(current.body.data.mustChangePassword).toBe(false);
    const allowed = await request(app.getHttpServer()).patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.data.accessToken}`).send({ locale: 'en' });
    expect(allowed.status).toBe(200);
    expect((await refresh(refreshCookie(before))).status).toBe(401);
    expect((await login(CHANGED_PASSWORD)).status).toBe(200);
    expect((await login(temporaryPassword)).status).toBe(401);
  });

  it('CON-09/AUD-01: later reads and server logs never disclose the temporary password or hash', async () => {
    const logs = [
      vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {}),
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}),
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {}),
      vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {}),
    ];
    const result = await reset();
    expect(result.status).toBe(201);
    const password = result.body.data.temporaryPassword;
    const detail = await request(app.getHttpServer()).get(`/api/v1/contracts/${CONTRACT_ID}`)
      .set('Authorization', `Bearer ${await token()}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).not.toHaveProperty('temporaryPassword');
    const afterLogin = await login(password);
    expect(afterLogin.status).toBe(200);
    const account = await me(afterLogin.body.data.accessToken);
    expect(account.status).toBe(200);
    for (const value of [detail.body, account.body, fake.db.auditLog, logs.flatMap(spy => spy.mock.calls)]) {
      const serialized = JSON.stringify(value);
      expect(serialized).not.toContain(password);
      expect(serialized).not.toContain('$argon2');
      expect(serialized).not.toContain('passwordHash');
    }
  });

  it('AUTH-07/CON-09: each reset issues a fresh password rather than replaying plaintext for an Idempotency-Key', async () => {
    const first = await reset('manager1', CONTRACT_ID, 'same-reset-request');
    expect(first.status).toBe(201);
    const firstHash = fake.account('tenant').passwordHash;
    const second = await reset('manager1', CONTRACT_ID, 'same-reset-request');
    expect(second.status).toBe(201);
    expect(second.body.data.temporaryPassword).not.toBe(first.body.data.temporaryPassword);
    expect(fake.account('tenant').passwordHash).not.toBe(firstHash);
    expect(await verifyPassword(fake.account('tenant').passwordHash as string, first.body.data.temporaryPassword)).toBe(false);
    expect(await verifyPassword(fake.account('tenant').passwordHash as string, second.body.data.temporaryPassword)).toBe(true);
    expect(resetEvents()).toHaveLength(2);
  });

  it('SCOPE-02: another manager cannot reset a tenant password, while Boss can', async () => {
    const originalHash = fake.account('tenant').passwordHash;
    const foreign = await reset('manager2');
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('OUT_OF_SCOPE');
    expect(fake.account('tenant').passwordHash).toBe(originalHash);
    expect(resetEvents()).toEqual([]);
    expect((await reset('boss')).status).toBe(201);
    expect(resetEvents()[0].actorId).toBe(IDS.users.boss);
  });

  it('SCOPE-02: assignment changed after the initial scoped read prevents the locked reset', async () => {
    const lookup = fake.contract.findUnique.bind(fake.contract);
    const originalHash = fake.account('tenant').passwordHash;
    vi.spyOn(fake.contract, 'findUnique').mockImplementationOnce(async args => {
      const result = await lookup(args);
      fake.db.building.find(row => row.id === IDS.buildings.CG01)!.managerId = IDS.users.manager2;
      return result;
    });
    const result = await reset();
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('OUT_OF_SCOPE');
    expect(fake.account('tenant').passwordHash).toBe(originalHash);
    expect(resetEvents()).toEqual([]);
  });

  it.each(['building', 'manager'])('SCOPE-02: an inactive %s prevents reset', async inactive => {
    if (inactive === 'building') fake.db.building.find(row => row.id === IDS.buildings.CG01)!.isActive = false;
    else fake.account('manager1').isActive = false;
    const originalHash = fake.account('tenant').passwordHash;
    const result = await reset();
    expect(result.status).toBe(inactive === 'manager' ? 401 : 403);
    expect(fake.account('tenant').passwordHash).toBe(originalHash);
    expect(resetEvents()).toEqual([]);
  });

  it.each(['tenant', 'guest'])('API-07: %s cannot use the staff reset route', async who => {
    const originalHash = fake.account('tenant').passwordHash;
    const result = await reset(who as Who);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('FORBIDDEN');
    expect(fake.account('tenant').passwordHash).toBe(originalHash);
    expect(resetEvents()).toEqual([]);
  });

  it('AUTH-07: a missing contract or a guest-only account cannot be used as the reset target', async () => {
    const missing = await reset('manager1', 999);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    fake.db.contract[0].tenantId = IDS.users.guest;
    const guestHash = fake.account('guest').passwordHash;
    const guest = await reset();
    expect(guest.status).toBe(404);
    expect(guest.body.error.code).toBe('NOT_FOUND');
    expect(fake.account('guest').passwordHash).toBe(guestHash);
    expect(resetEvents()).toEqual([]);
  });

  it('A-23/CON-07: a pending account must be signed before staff can reset its password', async () => {
    Object.assign(fake.account('tenant'), { passwordHash: PENDING_TENANT_PASSWORD_HASH, isActive: false, mustChangePassword: true });
    const result = await reset();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('CONFLICT_STATE');
    expect(fake.account('tenant')).toMatchObject({ passwordHash: PENDING_TENANT_PASSWORD_HASH, isActive: false, mustChangePassword: true });
    expect(resetEvents()).toEqual([]);
  });

  it('D-26/AUTH-07: resetting a staff-locked tenant changes its password without unlocking the account', async () => {
    fake.db.contract[0].tenantId = IDS.users.lockedTenant;
    const result = await reset();
    expect(result.status).toBe(201);
    expect(fake.account('lockedTenant')).toMatchObject({ isActive: false, mustChangePassword: true });
    expect(await verifyPassword(fake.account('lockedTenant').passwordHash as string, result.body.data.temporaryPassword)).toBe(true);
    const lockedLogin = await login(result.body.data.temporaryPassword, '0900000005');
    expect(lockedLogin.status).toBe(403);
    expect(lockedLogin.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('AUD-01/AUTH-T3: an audit failure rolls back the password, flags, session revocations and reset-link invalidation', async () => {
    const loggedIn = await login(ORIGINAL_PASSWORD);
    expect(loggedIn.status).toBe(200);
    await seedResetLink();
    const userBefore = structuredClone(fake.account('tenant'));
    const sessionsBefore = structuredClone(fake.db.session);
    const linksBefore = structuredClone(fake.db.passwordResetToken);
    vi.spyOn(fake.auditLog, 'create').mockRejectedValueOnce(new Error('fixture staff reset audit failure'));
    const result = await reset();
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(result.body).not.toHaveProperty('data');
    expect(fake.account('tenant')).toEqual(userBefore);
    expect(fake.db.session).toEqual(sessionsBefore);
    expect(fake.db.passwordResetToken).toEqual(linksBefore);
    expect(resetEvents()).toEqual([]);
    expect((await me(loggedIn.body.data.accessToken)).status).toBe(200);
    expect((await refresh(refreshCookie(loggedIn))).status).toBe(200);
  });

  it('API-04/API-07: unauthenticated and invalid contract IDs cannot change credentials', async () => {
    const userBefore = structuredClone(fake.account('tenant'));
    const anonymous = await request(app.getHttpServer()).post(`/api/v1/contracts/${CONTRACT_ID}/reset-password`);
    expect(anonymous.status).toBe(401);
    for (const id of ['0', '-1', '1.5', '2147483648', 'invalid']) expect((await reset('manager1', id)).status).toBe(400);
    expect(fake.account('tenant')).toEqual(userBefore);
    expect(resetEvents()).toEqual([]);
  });
});
