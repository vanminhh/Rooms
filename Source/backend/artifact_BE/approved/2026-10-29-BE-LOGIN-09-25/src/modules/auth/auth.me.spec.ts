import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { createFakePrisma, type FakePrisma, IDS } from '../../../test/fixtures/fake-prisma.js';
import { TokenService } from './token.service.js';

// Outside edge replaced: PrismaService -> in-memory fake (the DB).
// Real: AppModule, the 3 global guards, AuthController/AuthService, TokenService, configureApp.

const SECRET = 'auth-me-spec-secret-0123456789abcdef-01';

let app: INestApplication;
let fake: FakePrisma;
let tokens: TokenService;
let savedSecret: string | undefined;

type Who = keyof typeof IDS.users;
const tokenFor = (key: Who, role?: Role) =>
  tokens.signAccessToken({ id: IDS.users[key], role: role ?? (fake.account(key).role as Role) });
const me = (token?: string) => {
  const req = request(app.getHttpServer()).get('/api/v1/auth/me');
  return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
};

const ME_KEYS = [
  'contactPhone', 'email', 'facebookUrl', 'fullName', 'id', 'mustChangePassword', 'phone', 'role', 'zaloUrl',
];
const CG01 = { id: IDS.buildings.CG01, code: 'CG01', name: 'Tòa Cầu Giấy' };
const DD01 = { id: IDS.buildings.DD01, code: 'DD01', name: 'Tòa Đống Đa' };
const HM01 = { id: IDS.buildings.HM01, code: 'HM01', name: 'Tòa Hoàng Mai' };

beforeAll(async () => {
  savedSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  fake = await createFakePrisma();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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

describe('BE-LOGIN-15: GET /auth/me', () => {
  it('BE-LOGIN-15: no token -> 401 UNAUTHENTICATED', async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('BE-LOGIN-15: Boss gets his profile and all active buildings ordered by code (no inactive TL01)', async () => {
    const res = await me(await tokenFor('boss'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        id: IDS.users.boss,
        role: 'BOSS',
        phone: '0900000001',
        fullName: 'Phạm Minh Đức',
        email: null,
        mustChangePassword: false,
        contactPhone: '0900000001',
        zaloUrl: 'https://zalo.me/0900000001',
        facebookUrl: 'https://facebook.com/tro.thong.minh',
        buildings: [CG01, DD01, HM01],
      },
    });
    expect(res.body.data.buildings.map((b: { code: string }) => b.code)).not.toContain('TL01');
  });

  it('BE-LOGIN-15 / SCOPE-02: each building has exactly the keys id, code, name', async () => {
    const res = await me(await tokenFor('boss'));
    for (const b of res.body.data.buildings) expect(Object.keys(b).sort()).toEqual(['code', 'id', 'name']);
  });

  it('BE-LOGIN-15: Boss data has exactly the Me keys plus buildings', async () => {
    const res = await me(await tokenFor('boss'));
    expect(Object.keys(res.body.data).sort()).toEqual([...ME_KEYS, 'buildings'].sort());
  });

  it('BE-LOGIN-15 / SCOPE-02: manager1 sees only CG01 and DD01', async () => {
    const res = await me(await tokenFor('manager1'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        id: IDS.users.manager1,
        role: 'MANAGER',
        phone: '0900000002',
        fullName: 'Nguyễn Thu Hà',
        email: null,
        mustChangePassword: false,
        contactPhone: '0900000002',
        zaloUrl: null,
        facebookUrl: null,
        buildings: [CG01, DD01],
      },
    });
  });

  it('BE-LOGIN-15 / SCOPE-02: manager2 (only an inactive building) gets buildings: []', async () => {
    const res = await me(await tokenFor('manager2'));
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('MANAGER');
    expect(res.body.data.buildings).toEqual([]);
  });

  it('BE-LOGIN-15 / SCOPE-03: a tenant has no buildings key at all', async () => {
    fake.account('tenant').mustChangePassword = false;
    const res = await me(await tokenFor('tenant'));
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('buildings');
    expect(Object.keys(res.body.data).sort()).toEqual([...ME_KEYS].sort());
    expect(res.body.data).toMatchObject({
      id: IDS.users.tenant, role: 'TENANT', phone: '0900000004', fullName: 'Nguyễn Văn An', contactPhone: null,
    });
  });

  it('BE-LOGIN-15 / SCOPE-02: manager1 loses a building when it becomes inactive; Boss list drops it too', async () => {
    fake.building.rows.find((b) => b.id === IDS.buildings.CG01)!.isActive = false;
    expect((await me(await tokenFor('manager1'))).body.data.buildings).toEqual([DD01]);
    expect((await me(await tokenFor('boss'))).body.data.buildings).toEqual([DD01, HM01]);
  });

  it('BE-LOGIN-15 / SCOPE-02: a building reassigned to manager2 shows up for manager2, not manager1', async () => {
    fake.building.rows.find((b) => b.id === IDS.buildings.DD01)!.managerId = IDS.users.manager2;
    expect((await me(await tokenFor('manager1'))).body.data.buildings).toEqual([CG01]);
    expect((await me(await tokenFor('manager2'))).body.data.buildings).toEqual([DD01]);
  });

  it('BE-LOGIN-15: buildings are ordered by code ascending, not by insertion order', async () => {
    fake.building.rows.push({ id: 900, code: 'AA01', name: 'Tòa A', managerId: null, isActive: true });
    const res = await me(await tokenFor('boss'));
    expect(res.body.data.buildings.map((b: { code: string }) => b.code)).toEqual(['AA01', 'CG01', 'DD01', 'HM01']);
  });

  it('BE-LOGIN-15: email and contact fields come through as stored', async () => {
    const m = fake.account('manager1');
    m.email = 'ha@example.com';
    m.zaloUrl = 'https://zalo.me/0900000002';
    const res = await me(await tokenFor('manager1'));
    expect(res.body.data.email).toBe('ha@example.com');
    expect(res.body.data.zaloUrl).toBe('https://zalo.me/0900000002');
  });

  it('AUTH-T1: the role comes from the DB, not from the token (tenant token claiming BOSS)', async () => {
    fake.account('tenant').mustChangePassword = false;
    const res = await me(await tokenFor('tenant', 'BOSS'));
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('TENANT');
    expect(res.body.data).not.toHaveProperty('buildings');
  });

  it('BE-LOGIN-15 (security): responses of all 4 active roles never contain secrets or internal flags', async () => {
    fake.account('boss').lastLoginAt = new Date('2026-10-29T01:00:00Z'); // make a leak of lastLoginAt detectable
    fake.account('tenant').mustChangePassword = false;
    for (const who of ['boss', 'manager1', 'manager2', 'tenant'] as const) {
      const res = await me(await tokenFor(who));
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      for (const bad of ['passwordHash', 'password', '$argon2', 'isActive', 'lastLoginAt', '2026-10-29T01:00:00']) {
        expect(text, `${who} leaks ${bad}`).not.toContain(bad);
      }
    }
  });

  it('AUTH-05: a tenant who must change the password can still call GET /auth/me and sees the flag', async () => {
    expect(fake.account('tenant').mustChangePassword).toBe(true);
    const res = await me(await tokenFor('tenant'));
    expect(res.status).toBe(200);
    expect(res.body.data.mustChangePassword).toBe(true);
  });

  it('P5 / AUTH-T1: a manager deactivated after getting a token -> 401', async () => {
    const token = await tokenFor('manager1');
    expect((await me(token)).status).toBe(200);
    fake.account('manager1').isActive = false;
    const res = await me(token);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('AUTH-02 / P5: the locked tenant cannot use a still-valid token on /auth/me', async () => {
    const res = await me(await tokenFor('lockedTenant'));
    expect(res.status).toBe(401);
  });

  it('P5: a user deleted from the DB after getting a token -> 401', async () => {
    const token = await tokenFor('boss');
    fake.user.rows.splice(0, fake.user.rows.length);
    expect((await me(token)).status).toBe(401);
  });

  it('BE-LOGIN-15: garbage Bearer token -> 401', async () => {
    const res = await me('rac');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});
