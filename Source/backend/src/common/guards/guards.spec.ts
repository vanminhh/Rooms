import {
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Inject,
  INestApplication,
  Param,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { AuthModule } from '../../modules/auth/auth.module.js';
import { TokenService } from '../../modules/auth/token.service.js';
import { createFakePrisma, type FakePrisma, IDS } from '../../../test/fixtures/fake-prisma.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { tenantOwns } from '../scope/scope.js';
import { AllowPasswordChangeRequired, type AuthUser, CurrentUser, Public, Roles } from './auth.decorators.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MustChangePasswordGuard } from './must-change-password.guard.js';
import { RolesGuard } from './roles.guard.js';

// Outside edges only: PrismaService is replaced by the in-memory fake (the DB).
// The guards, TokenService, AuthModule, AppModule, configureApp (pipe, filter, interceptor) are all real.
// The probe controllers below exist only in this test: they give the global guards routes to protect.

@Controller('t')
class ProbeController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public() @Get('public') pub() { return { ok: true }; }
  @Get('bare') bare() { return { ok: true }; }
  @Roles('BOSS') @Get('boss') boss() { return { ok: true }; }
  @Roles('BOSS', 'MANAGER') @Get('staff') staff() { return { ok: true }; }
  @Roles('TENANT') @Get('tenant') tenant() { return { ok: true }; }
  @Roles('TENANT') @AllowPasswordChangeRequired() @Get('tenant-pcr') tenantPcr() { return { ok: true }; }
  @Roles('BOSS', 'MANAGER', 'TENANT') @AllowPasswordChangeRequired() @Get('whoami')
  whoami(@CurrentUser() user: AuthUser) { return user; }

  @Roles('TENANT') @Get('contracts/:id')
  async contract(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await tenantOwns(this.prisma, user, Number(id));
    return { ok: true };
  }
}

// Class-level metadata: a handler's own decorator overrides the class's (getAllAndOverride).
@Controller('c')
@Roles('BOSS')
class ClassProbeController {
  @Get('inherit') inherit() { return { ok: true }; }
  @Public() @Get('open') open() { return { ok: true }; }
  @Roles('MANAGER') @Get('override') override() { return { ok: true }; }
}

const SECRET = 'guards-spec-secret-0123456789abcdef-0123';
const OTHER_SECRET = 'some-other-secret-0123456789abcdef-0123';

let app: INestApplication;
let fake: FakePrisma;
let tokens: TokenService;
let savedSecret: string | undefined;

const tokenFor = (key: keyof typeof IDS.users) =>
  tokens.signAccessToken({ id: IDS.users[key], role: fake.account(key).role as Role });
const get = (path: string, token?: string) => {
  const req = request(app.getHttpServer()).get(`/api/v1${path}`);
  return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
};
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

const FORBIDDEN_BODY = { error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này' } };
const PCR_BODY = { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Bạn cần đổi mật khẩu trước khi tiếp tục' } };

beforeAll(async () => {
  savedSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  fake = await createFakePrisma();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [ProbeController, ClassProbeController],
  })
    .overrideProvider(PrismaService)
    .useValue(fake)
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  tokens = app.get(TokenService, { strict: false });
});

afterAll(async () => {
  await app.close();
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

beforeEach(() => fake.reset());
afterEach(() => vi.useRealTimers());

describe('SCOPE-01: deny by default', () => {
  it('SCOPE-01: a route without decorators is denied (no token -> 401 UNAUTHENTICATED)', async () => {
    const res = await get('/t/bare');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('SCOPE-01: a route without decorators is denied (Boss token -> 403 FORBIDDEN, exact body)', async () => {
    const res = await get('/t/bare', await tokenFor('boss'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN_BODY);
  });

  it('SCOPE-01 / API-07: @Public route -> 200 without a token and with a garbage token', async () => {
    expect((await get('/t/public')).status).toBe(200);
    const garbage = await get('/t/public', 'rac');
    expect(garbage.status).toBe(200);
    expect(garbage.body).toEqual({ data: { ok: true } });
  });

  it('SCOPE-01: @Public route ignores a token of a locked account too', async () => {
    expect((await get('/t/public', await tokenFor('lockedTenant'))).status).toBe(200);
  });

  it.each([
    ['boss', '/t/boss', 200],
    ['manager1', '/t/boss', 403],
    ['tenant', '/t/boss', 403],
    ['boss', '/t/staff', 200],
    ['manager1', '/t/staff', 200],
    ['manager2', '/t/staff', 200],
    ['tenant', '/t/staff', 403],
    ['tenant', '/t/tenant', 200],
    ['boss', '/t/tenant', 403],
    ['manager1', '/t/tenant', 403],
  ] as const)('SCOPE-01: %s on %s -> %i', async (who, path, status) => {
    fake.account('tenant').mustChangePassword = false; // isolate the role check from AUTH-05
    const res = await get(path, await tokenFor(who));
    expect(res.status).toBe(status);
    if (status === 403) expect(res.body).toEqual(FORBIDDEN_BODY);
    else expect(res.body).toEqual({ data: { ok: true } });
  });

  it('SCOPE-01: class-level @Roles applies to a handler without its own; handler @Public / @Roles override the class', async () => {
    expect((await get('/c/inherit', await tokenFor('boss'))).status).toBe(200);
    expect((await get('/c/inherit', await tokenFor('manager1'))).status).toBe(403);
    expect((await get('/c/open')).status).toBe(200);
    expect((await get('/c/override', await tokenFor('manager1'))).status).toBe(200);
    expect((await get('/c/override', await tokenFor('boss'))).status).toBe(403);
  });

  it('SCOPE-01: RolesGuard with no authenticated user on a @Roles route throws FORBIDDEN (defensive)', () => {
    @Roles('BOSS')
    class Stub {}
    const ctx = {
      getHandler: () => () => undefined, // a handler with no metadata of its own: the class's @Roles applies
      getClass: () => Stub,
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext; // outside edge: the Nest execution context
    const guard = new RolesGuard(new Reflector());
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('FORBIDDEN');
  });

  it('SCOPE-01 / AUTH-05: AuthModule registers the 3 global guards in order Jwt -> MustChangePassword -> Roles', () => {
    const providers = Reflect.getMetadata('providers', AuthModule) as { provide?: unknown; useClass?: unknown }[];
    const guards = providers.filter((p) => typeof p === 'object' && p.provide === APP_GUARD).map((p) => p.useClass);
    expect(guards).toEqual([JwtAuthGuard, MustChangePasswordGuard, RolesGuard]);
  });
});

describe('AUTH-T1: access token checks', () => {
  it.each([
    ['no Authorization header', undefined],
    ['Basic scheme', 'Basic dXNlcjpwYXNz'],
    ['Bearer with an empty token', 'Bearer '],
    ['Bearer with no token and no space', 'Bearer'],
    ['garbage token', 'Bearer rac'],
  ])('AUTH-T1: %s -> 401 UNAUTHENTICATED', async (_name, header) => {
    const req = request(app.getHttpServer()).get('/api/v1/t/whoami');
    const res = await (header === undefined ? req : req.set('Authorization', header));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('AUTH-T1: token signed with another secret -> 401', async () => {
    const forged = await new JwtService().signAsync(
      { sub: String(IDS.users.boss), role: 'BOSS' },
      { secret: OTHER_SECRET, algorithm: 'HS256', expiresIn: 900 },
    );
    const res = await get('/t/whoami', forged);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('AUTH-T1: token with alg none -> 401', async () => {
    const none = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: String(IDS.users.boss), role: 'BOSS' })}.`;
    const res = await get('/t/whoami', none);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('AUTH-T1: lifetime is 15 minutes: still valid at 14:00 after issue, 401 at 15:01', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); // outside edge: the clock
    const start = Date.now();
    const token = await tokenFor('boss');
    vi.setSystemTime(start + 14 * 60 * 1000);
    expect((await get('/t/whoami', token)).status).toBe(200);
    vi.setSystemTime(start + 15 * 60 * 1000 + 1000);
    const res = await get('/t/whoami', token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each(['abc', '0', '-1', '1.5', '99999999999', ''])('AUTH-T1: sub %j is not a valid user id -> 401', async (sub) => {
    const token = await new JwtService().signAsync({ sub, role: 'BOSS' }, { secret: SECRET, algorithm: 'HS256', expiresIn: 900 });
    const res = await get('/t/whoami', token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('AUTH-T1: sub of a user that is not in the DB -> 401', async () => {
    const res = await get('/t/whoami', await tokens.signAccessToken({ id: 999999, role: 'BOSS' }));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('AUTH-T1 / P5: a locked account with a still-valid token -> 401', async () => {
    const res = await get('/t/whoami', await tokenFor('lockedTenant'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('AUTH-T1 / P5: an account locked after the token was issued is rejected on the next request', async () => {
    const token = await tokenFor('manager1');
    expect((await get('/t/staff', token)).status).toBe(200);
    fake.account('manager1').isActive = false;
    expect((await get('/t/staff', token)).status).toBe(401);
  });

  it('AUTH-T1: the role comes from the DB, not the token (token says BOSS, user is a tenant)', async () => {
    fake.account('tenant').mustChangePassword = false;
    const token = await tokens.signAccessToken({ id: IDS.users.tenant, role: 'BOSS' });
    const boss = await get('/t/boss', token);
    expect(boss.status).toBe(403);
    expect(boss.body).toEqual(FORBIDDEN_BODY);
    expect((await get('/t/tenant', token)).status).toBe(200);
  });

  it('AUTH-T1: the role comes from the DB, not the token (token says TENANT, user is the Boss)', async () => {
    const token = await tokens.signAccessToken({ id: IDS.users.boss, role: 'TENANT' });
    expect((await get('/t/boss', token)).status).toBe(200);
    expect((await get('/t/tenant', token)).status).toBe(403);
  });
});

describe('AUTH-05: must change password', () => {
  it('AUTH-05: flagged tenant on a normal route -> 403 PASSWORD_CHANGE_REQUIRED (exact body)', async () => {
    const res = await get('/t/tenant', await tokenFor('tenant'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual(PCR_BODY);
  });

  it('AUTH-05: PASSWORD_CHANGE_REQUIRED comes before FORBIDDEN (staff-only and undecorated routes)', async () => {
    const token = await tokenFor('tenant');
    expect((await get('/t/staff', token)).body).toEqual(PCR_BODY);
    expect((await get('/t/bare', token)).body).toEqual(PCR_BODY);
  });

  it('AUTH-05: routes with @AllowPasswordChangeRequired and @Public stay reachable for a flagged tenant', async () => {
    const token = await tokenFor('tenant');
    expect((await get('/t/tenant-pcr', token)).status).toBe(200);
    expect((await get('/t/whoami', token)).status).toBe(200);
    expect((await get('/t/public', token)).status).toBe(200);
  });

  it('AUTH-05: @AllowPasswordChangeRequired does not skip the role check (flagged manager on a TENANT route)', async () => {
    fake.account('manager1').mustChangePassword = true;
    const res = await get('/t/tenant-pcr', await tokenFor('manager1'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual(FORBIDDEN_BODY);
  });

  it('AUTH-05: the flag is read from the DB on every request (cleared flag -> same token works)', async () => {
    const token = await tokenFor('tenant');
    expect((await get('/t/tenant', token)).status).toBe(403);
    fake.account('tenant').mustChangePassword = false;
    expect((await get('/t/tenant', token)).status).toBe(200);
  });

  it('AUTH-05: any other flagged role is blocked the same way (manager)', async () => {
    fake.account('manager1').mustChangePassword = true;
    const res = await get('/t/staff', await tokenFor('manager1'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual(PCR_BODY);
  });

  it('AUTH-05: no token on a flagged-only route is still 401, not 403', async () => {
    expect((await get('/t/tenant')).status).toBe(401);
  });
});

describe('SCOPE-02: buildingIds attached by the guard', () => {
  const ids = async (key: keyof typeof IDS.users) => (await get('/t/whoami', await tokenFor(key))).body.data as AuthUser;

  it('SCOPE-02: manager1 -> CG01 and DD01 (as a set)', async () => {
    const user = await ids('manager1');
    expect([...(user.buildingIds ?? [])].sort((a, b) => a - b)).toEqual([IDS.buildings.CG01, IDS.buildings.DD01]);
  });

  it('SCOPE-02: manager2 -> [] (their only building TL01 is not active)', async () => {
    expect((await ids('manager2')).buildingIds).toEqual([]);
  });

  it('SCOPE-02: Boss -> null (every building), tenant -> []', async () => {
    expect((await ids('boss')).buildingIds).toBeNull();
    expect((await ids('tenant')).buildingIds).toEqual([]);
  });

  it('SCOPE-02: deactivating a building removes it from the manager on the next request', async () => {
    const token = await tokenFor('manager1');
    fake.db.building.find((b) => b.id === IDS.buildings.DD01)!.isActive = false;
    const res = await get('/t/whoami', token);
    expect(res.body.data.buildingIds).toEqual([IDS.buildings.CG01]);
  });

  it('SCOPE-02: req.user carries exactly id, role, mustChangePassword, buildingIds (no hash, no phone)', async () => {
    const res = await get('/t/whoami', await tokenFor('manager1'));
    expect(res.body).toEqual({
      data: {
        id: IDS.users.manager1,
        role: 'MANAGER',
        mustChangePassword: false,
        buildingIds: expect.arrayContaining([IDS.buildings.CG01, IDS.buildings.DD01]),
      },
    });
    expect(Object.keys(res.body.data).sort()).toEqual(['buildingIds', 'id', 'mustChangePassword', 'role']);
    expect(JSON.stringify(res.body)).not.toContain('argon2');
  });
});

describe('SCOPE-03: tenantOwns over HTTP', () => {
  const NOT_FOUND_BODY = { error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' } };

  it('SCOPE-03: a tenant reads their own contract -> 200', async () => {
    fake.account('tenant').mustChangePassword = false;
    const res = await get(`/t/contracts/${IDS.contracts.HD000001}`, await tokenFor('tenant'));
    expect(res.status).toBe(200);
  });

  it("SCOPE-03: someone else's contract -> 404 NOT_FOUND (not 403), identical to a missing contract", async () => {
    fake.account('tenant').mustChangePassword = false;
    fake.contract.rows.push({ id: 202, code: 'HD000002', buildingId: IDS.buildings.HM01, tenantId: IDS.users.lockedTenant });
    const token = await tokenFor('tenant');
    const other = await get('/t/contracts/202', token);
    const missing = await get('/t/contracts/999999', token);
    expect(other.status).toBe(404);
    expect(other.body).toEqual(NOT_FOUND_BODY);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(other.body);
  });
});

describe('SCOPE-01: app lifecycle', () => {
  it('SCOPE-01: AppModule init runs no DB call and starts no interval; close() finishes', async () => {
    const f = await createFakePrisma();
    const spies: ReturnType<typeof vi.spyOn>[] = [];
    for (const model of [f.user, f.building, f.contract, f.setting, f.session, f.passwordResetToken, f.auditLog]) {
      for (const method of ['findUnique', 'findFirst', 'findMany', 'create', 'update', 'updateMany'] as const) {
        spies.push(vi.spyOn(model, method));
      }
    }
    const interval = vi.spyOn(globalThis, 'setInterval');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(f)
      .compile();
    const a = moduleRef.createNestApplication();
    configureApp(a);
    await a.init();
    expect(spies.filter((s) => s.mock.calls.length > 0)).toHaveLength(0);
    expect(interval).not.toHaveBeenCalled();
    await a.close();
    interval.mockRestore();
  });
});
