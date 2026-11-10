import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { createFakePrisma, type FakePrisma, IDS, type Row } from '../../../test/fixtures/fake-prisma.js';
import { TokenService } from './token.service.js';

// Outside edges replaced: PrismaService -> in-memory fake (the DB), the clock -> vi.useFakeTimers({ toFake: ['Date'] }).
// Real: AppModule, the 3 global guards, AuthController/AuthService/AuditService/RateLimiter, TokenService, argon2, configureApp.
// A new app (new AuthService, new RateLimiter) and a new fake are built for every test.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SECRET = 'auth-account-spec-secret-0123456789a-01';
const MIN = 60 * 1000;
const T0 = Date.parse('2026-10-29T10:00:00+07:00');

type Who = keyof typeof IDS.users;
const PHONE: Record<Who, string> = {
  boss: '0900000001', manager1: '0900000002', manager2: '0900000003', tenant: '0900000004', lockedTenant: '0900000005',
};
const PASSWORD: Record<Who, string> = {
  boss: 'Boss@2026', manager1: 'QuanLy1@2026', manager2: 'QuanLy2@2026', tenant: 'NguoiThue@2026', lockedTenant: 'TamKhoa@2026',
};
const NEW_PASSWORD = 'MatKhauMoi@1';
const FORBIDDEN_FIELD = 'Trường này không được phép gửi lên';

const validation = (fields: Record<string, string>) => ({
  error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ', fields },
});
const PCR_BODY = { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Bạn cần đổi mật khẩu trước khi tiếp tục' } };
const FORBIDDEN_BODY = { error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này' } };
const ME_KEYS = [
  'contactPhone', 'email', 'facebookUrl', 'fullName', 'id', 'mustChangePassword', 'phone', 'role', 'zaloUrl',
];

let app: INestApplication;
let fake: FakePrisma;
let tokens: TokenService;
let savedSecret: string | undefined;

beforeEach(async () => {
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

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await app.close();
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

// ---- helpers -------------------------------------------------------------------------------------------

const freeze = (when: number) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(when);
};
const tokenFor = (who: Who) =>
  tokens.signAccessToken({ id: IDS.users[who], role: fake.account(who).role as Role });
const http = () => request(app.getHttpServer());
const bearer = (req: request.Test, token?: string) => (token === undefined ? req : req.set('Authorization', `Bearer ${token}`));
const patchMe = (token: string | undefined, body: unknown) =>
  bearer(http().patch('/api/v1/auth/me'), token).send(body as object);
const changePassword = (token: string | undefined, body: unknown, cookie?: string) => {
  const req = bearer(http().post('/api/v1/auth/change-password'), token);
  return (cookie === undefined ? req : req.set('Cookie', `rt=${cookie}`)).send(body as object);
};
const login = (phone: string, password: string) => http().post('/api/v1/auth/login').send({ phone, password });
const refresh = (cookie: string) => http().post('/api/v1/auth/refresh').set('Cookie', `rt=${cookie}`);
const rtValue = (res: request.Response): string => {
  const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const c = cookies.find((x) => x.startsWith('rt='));
  if (!c) throw new Error('response has no rt cookie');
  return c.split(';')[0].slice('rt='.length);
};
async function loginOk(who: Who, password: string = PASSWORD[who]) {
  const res = await login(PHONE[who], password);
  expect(res.status).toBe(200);
  return { cookie: rtValue(res), accessToken: res.body.data.accessToken as string };
}
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex'); // independent of the code under test
const sessionFor = (cookie: string): Row => fake.db.session.find((r) => r.tokenHash === sha256(cookie))!;
const snapshot = (who: Who): Row => structuredClone(fake.account(who));
const hashOf = (who: Who) => fake.account(who).passwordHash as string;

// ---- AUTH-09 / BE-LOGIN-16: PATCH /auth/me ----------------------------------------------------------------

describe('AUTH-09: PATCH /auth/me', () => {
  it('AUTH-09: no token -> 401 UNAUTHENTICATED', async () => {
    const res = await patchMe(undefined, { email: 'an@example.com' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('AUTH-09: tenant (flag off) sets email -> 200, data is Me with the new email, DB has it', async () => {
    fake.account('tenant').mustChangePassword = false;
    const res = await patchMe(await tokenFor('tenant'), { email: 'an@example.com' });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['data']);
    expect(Object.keys(res.body.data).sort()).toEqual(ME_KEYS);
    expect(res.body.data).toMatchObject({
      id: IDS.users.tenant, role: 'TENANT', phone: '0900000004', email: 'an@example.com', mustChangePassword: false,
    });
    expect('buildings' in res.body.data).toBe(false);
    expect(fake.account('tenant').email).toBe('an@example.com');
    const text = JSON.stringify(res.body);
    for (const bad of ['passwordHash', '$argon2', 'isActive', 'lastLoginAt']) expect(text).not.toContain(bad);
  });

  it('AUTH-05: flagged tenant -> PATCH /auth/me 403 PASSWORD_CHANGE_REQUIRED, DB unchanged', async () => {
    const before = snapshot('tenant');
    const res = await patchMe(await tokenFor('tenant'), { email: 'an@example.com' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual(PCR_BODY);
    expect(fake.account('tenant')).toEqual(before);
  });

  it('AUTH-05: flagged Boss is blocked on PATCH /auth/me too (every role)', async () => {
    fake.account('boss').mustChangePassword = true;
    const res = await patchMe(await tokenFor('boss'), {});
    expect(res.status).toBe(403);
    expect(res.body).toEqual(PCR_BODY);
  });

  const STAFF_ONLY = [
    ['contactPhone', '0912345678'],
    ['zaloUrl', 'https://zalo.me/0912345678'],
    ['facebookUrl', 'https://facebook.com/an'],
  ] as const;
  for (const [key, value] of STAFF_ONLY) {
    for (const sent of [value, null]) {
      it(`AUTH-09: tenant sending ${key}: ${JSON.stringify(sent)} -> 403 FORBIDDEN, DB unchanged (also when email is sent along)`, async () => {
        fake.account('tenant').mustChangePassword = false;
        const before = snapshot('tenant');
        const token = await tokenFor('tenant');
        const alone = await patchMe(token, { [key]: sent });
        expect(alone.status).toBe(403);
        expect(alone.body).toEqual(FORBIDDEN_BODY);
        const withEmail = await patchMe(token, { email: 'an@example.com', [key]: sent });
        expect(withEmail.status).toBe(403);
        expect(withEmail.body).toEqual(FORBIDDEN_BODY);
        expect(fake.account('tenant')).toEqual(before); // email was not written either
      });
    }
  }

  for (const who of ['manager1', 'boss'] as const) {
    it(`AUTH-09: ${who} changes email, contactPhone, zaloUrl and facebookUrl in one call -> 200`, async () => {
      const res = await patchMe(await tokenFor(who), {
        email: 'staff@example.com',
        contactPhone: '0987654321',
        zaloUrl: 'https://zalo.me/0987654321',
        facebookUrl: 'https://facebook.com/staff',
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: IDS.users[who],
        email: 'staff@example.com',
        contactPhone: '0987654321',
        zaloUrl: 'https://zalo.me/0987654321',
        facebookUrl: 'https://facebook.com/staff',
      });
      expect('buildings' in res.body.data).toBe(true);
      expect(fake.account(who)).toMatchObject({
        email: 'staff@example.com',
        contactPhone: '0987654321',
        zaloUrl: 'https://zalo.me/0987654321',
        facebookUrl: 'https://facebook.com/staff',
      });
    });
  }

  const PROTECTED = [
    ['role', 'BOSS'],
    ['phone', '0911111111'],
    ['isActive', false],
    ['mustChangePassword', false],
    ['fullName', 'Tên mới'],
    ['passwordHash', 'x'],
  ] as const;
  for (const [key, value] of PROTECTED) {
    it(`AUTH-09: body with "${key}" -> 400 fields.${key} "${FORBIDDEN_FIELD}", DB unchanged`, async () => {
      const before = snapshot('manager1');
      const res = await patchMe(await tokenFor('manager1'), { [key]: value });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(validation({ [key]: FORBIDDEN_FIELD }));
      expect(fake.account('manager1')).toEqual(before);
    });
  }

  it('AUTH-09: a protected field next to a valid one -> 400 and the valid one is not written', async () => {
    const before = snapshot('manager1');
    const res = await patchMe(await tokenFor('manager1'), { email: 'ha@example.com', role: 'BOSS' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation({ role: FORBIDDEN_FIELD }));
    expect(fake.account('manager1')).toEqual(before);
  });

  describe('data rules (Q5c)', () => {
    const emailOf = (n: number) => {
      // local 64 + "@" + domain; the domain labels stay <= 63 chars.
      const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(n - 64 - 1 - 63 - 1 - 63 - 1 - 4)}.com`;
      return `${'a'.repeat(64)}@${domain}`;
    };

    it('AUTH-09: email "khong-phai-email" -> 400 fields.email "Email không hợp lệ"', async () => {
      fake.account('tenant').mustChangePassword = false;
      const res = await patchMe(await tokenFor('tenant'), { email: 'khong-phai-email' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(validation({ email: 'Email không hợp lệ' }));
      expect(fake.account('tenant').email).toBeNull();
    });

    for (const bad of ['', 123, true]) {
      it(`AUTH-09: email ${JSON.stringify(bad)} -> 400 fields.email (clearing is done with null, not "")`, async () => {
        fake.account('tenant').mustChangePassword = false;
        const res = await patchMe(await tokenFor('tenant'), { email: bad });
        expect(res.status).toBe(400);
        expect(res.body).toEqual(validation({ email: 'Email không hợp lệ' }));
      });
    }

    it('AUTH-09: a 256-char email -> 400 fields.email; a 254-char valid email -> 200', async () => {
      fake.account('tenant').mustChangePassword = false;
      const token = await tokenFor('tenant');
      const long = emailOf(256);
      expect(long).toHaveLength(256);
      const tooLong = await patchMe(token, { email: long });
      expect(tooLong.status).toBe(400);
      expect(tooLong.body).toEqual(validation({ email: 'Email không hợp lệ' }));
      expect(fake.account('tenant').email).toBeNull();

      const ok = emailOf(254);
      expect(ok).toHaveLength(254);
      const res = await patchMe(token, { email: ok });
      expect(res.status).toBe(200);
      expect(fake.account('tenant').email).toBe(ok);
    });

    it('AUTH-09: "An@Example.COM" is stored and returned in lower case', async () => {
      fake.account('tenant').mustChangePassword = false;
      const res = await patchMe(await tokenFor('tenant'), { email: 'An@Example.COM' });
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('an@example.com');
      expect(fake.account('tenant').email).toBe('an@example.com');
    });

    it('AUTH-09: contactPhone "091234567" -> 400, "0912345678" -> 200 (G-04)', async () => {
      const token = await tokenFor('manager1');
      const bad = await patchMe(token, { contactPhone: '091234567' });
      expect(bad.status).toBe(400);
      expect(bad.body).toEqual(validation({ contactPhone: 'Số điện thoại không hợp lệ' }));
      expect(fake.account('manager1').contactPhone).toBe('0900000002'); // seed value, untouched
      const ok = await patchMe(token, { contactPhone: '0912345678' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.contactPhone).toBe('0912345678');
    });

    it('AUTH-09: contactPhone "" or a number -> 400 fields.contactPhone', async () => {
      const token = await tokenFor('manager1');
      for (const bad of ['', 912345678]) {
        const res = await patchMe(token, { contactPhone: bad });
        expect(res.status).toBe(400);
        expect(res.body).toEqual(validation({ contactPhone: 'Số điện thoại không hợp lệ' }));
      }
    });

    for (const key of ['zaloUrl', 'facebookUrl'] as const) {
      it(`AUTH-09: ${key} accepts https (any domain) and rejects http, plain text and ""`, async () => {
        const token = await tokenFor('manager1');
        const before = fake.account('manager1')[key];
        for (const bad of ['http://zalo.me/0912345678', 'abc', '', 'ftp://example.com/x', 'https://']) {
          const res = await patchMe(token, { [key]: bad });
          expect(res.status, `${key}=${JSON.stringify(bad)}`).toBe(400);
          expect(res.body).toEqual(validation({ [key]: 'Đường dẫn không hợp lệ' }));
        }
        expect(fake.account('manager1')[key]).toBe(before);
        for (const good of ['https://zalo.me/0912345678', 'https://example.com/x']) {
          const res = await patchMe(token, { [key]: good });
          expect(res.status, `${key}=${good}`).toBe(200);
          expect(res.body.data[key]).toBe(good);
          expect(fake.account('manager1')[key]).toBe(good);
        }
      });
    }

    it('AUTH-09: several bad fields are all reported together', async () => {
      const res = await patchMe(await tokenFor('manager1'), {
        email: 'x', contactPhone: '1', zaloUrl: 'a', facebookUrl: 'b',
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(
        validation({
          email: 'Email không hợp lệ',
          contactPhone: 'Số điện thoại không hợp lệ',
          zaloUrl: 'Đường dẫn không hợp lệ',
          facebookUrl: 'Đường dẫn không hợp lệ',
        }),
      );
    });
  });

  describe('duplicate email (Q5a)', () => {
    const DUP = validation({ email: 'Email đã được sử dụng' });

    for (const sent of ['boss@example.com', 'BOSS@example.com']) {
      it(`AUTH-09: manager1 sends ${sent}, already taken by the Boss -> 400 fields.email "Email đã được sử dụng"`, async () => {
        fake.account('boss').email = 'boss@example.com';
        const before = snapshot('manager1');
        const res = await patchMe(await tokenFor('manager1'), { email: sent });
        expect(res.status).toBe(400);
        expect(res.body).toEqual(DUP);
        expect(fake.account('manager1')).toEqual(before);
      });
    }

    it('AUTH-09: sending your own current email again -> 200', async () => {
      fake.account('manager1').email = 'ha@example.com';
      const token = await tokenFor('manager1');
      for (const sent of ['ha@example.com', 'HA@example.com']) {
        const res = await patchMe(token, { email: sent });
        expect(res.status).toBe(200);
        expect(res.body.data.email).toBe('ha@example.com');
      }
    });

    it('AUTH-09: a non-unique DB error is not turned into a validation error (it stays a 500)', async () => {
      vi.spyOn(fake.user, 'update').mockRejectedValueOnce(new Error('connection lost'));
      const res = await patchMe(await tokenFor('manager1'), { email: 'ha@example.com' });
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toContain('connection lost');
    });
  });

  describe('clearing with null (Q5b)', () => {
    it('AUTH-09: manager1 sends { email: null, contactPhone: null } -> both null, the rest unchanged', async () => {
      const m = fake.account('manager1');
      m.email = 'ha@example.com';
      m.zaloUrl = 'https://zalo.me/ha';
      m.facebookUrl = 'https://facebook.com/ha';
      const res = await patchMe(await tokenFor('manager1'), { email: null, contactPhone: null });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        email: null,
        contactPhone: null,
        zaloUrl: 'https://zalo.me/ha',
        facebookUrl: 'https://facebook.com/ha',
        fullName: 'Nguyễn Thu Hà',
        phone: '0900000002',
      });
      expect(fake.account('manager1')).toMatchObject({
        email: null, contactPhone: null, zaloUrl: 'https://zalo.me/ha', facebookUrl: 'https://facebook.com/ha',
      });
    });

    it('AUTH-09: Boss clears zaloUrl and facebookUrl with null -> 200', async () => {
      const res = await patchMe(await tokenFor('boss'), { zaloUrl: null, facebookUrl: null });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ zaloUrl: null, facebookUrl: null, contactPhone: '0900000001' });
      expect(fake.account('boss')).toMatchObject({ zaloUrl: null, facebookUrl: null, contactPhone: '0900000001' });
    });

    it('AUTH-09: tenant sends { email: null } -> 200, email is null', async () => {
      fake.account('tenant').mustChangePassword = false;
      fake.account('tenant').email = 'an@example.com';
      const res = await patchMe(await tokenFor('tenant'), { email: null });
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBeNull();
      expect(fake.account('tenant').email).toBeNull();
    });

    it('AUTH-09: body {} and body [] -> 200 and nothing changes', async () => {
      const before = snapshot('manager1');
      const token = await tokenFor('manager1');
      const empty = await patchMe(token, {});
      expect(empty.status).toBe(200);
      expect(empty.body.data.id).toBe(IDS.users.manager1);
      const arr = await patchMe(token, []);
      expect(arr.status).toBe(200);
      expect(arr.body).toEqual(empty.body);
      expect(fake.account('manager1')).toEqual(before);
    });
  });
});

// ---- AUTH-05 / AUTH-T3 / BE-LOGIN-17: POST /auth/change-password -----------------------------------------

describe('BE-LOGIN-17: POST /auth/change-password', () => {
  it('BE-LOGIN-17: no token -> 401 UNAUTHENTICATED', async () => {
    const res = await changePassword(undefined, { currentPassword: PASSWORD.boss, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('BE-LOGIN-17: flagged tenant changes the password -> 200 { data: null }, hash replaced (argon2id), flag cleared, no longer blocked', async () => {
    const A = await loginOk('tenant');
    const B = await loginOk('tenant');
    expect(A.cookie).not.toBe(B.cookie);
    const oldHash = hashOf('tenant');
    // precondition: the flag still blocks the rest of the API
    expect((await patchMe(A.accessToken, {})).body).toEqual(PCR_BODY);

    const res = await changePassword(A.accessToken, { currentPassword: PASSWORD.tenant, newPassword: NEW_PASSWORD }, A.cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });

    const newHash = hashOf('tenant');
    expect(newHash).not.toBe(oldHash);
    expect(newHash.startsWith('$argon2id$')).toBe(true);
    expect(newHash).not.toContain(NEW_PASSWORD);
    expect(await argon2.verify(newHash, NEW_PASSWORD)).toBe(true);
    expect(await argon2.verify(newHash, PASSWORD.tenant)).toBe(false);
    expect(fake.account('tenant').mustChangePassword).toBe(false);

    const after = await patchMe(A.accessToken, {});
    expect(after.status).toBe(200);
    expect(after.body.data.mustChangePassword).toBe(false);
  });

  it('BE-LOGIN-17: after the change, login works with the new password and fails with the old one', async () => {
    const A = await loginOk('tenant');
    await changePassword(A.accessToken, { currentPassword: PASSWORD.tenant, newPassword: NEW_PASSWORD }, A.cookie);
    const old = await login(PHONE.tenant, PASSWORD.tenant);
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe('INVALID_CREDENTIALS');
    const fresh = await login(PHONE.tenant, NEW_PASSWORD);
    expect(fresh.status).toBe(200);
    expect(fresh.body.data.user.mustChangePassword).toBe(false);
  });

  it('BE-LOGIN-17: a user that is not flagged (Boss) can change the password too', async () => {
    const boss = await loginOk('boss');
    const res = await changePassword(boss.accessToken, { currentPassword: PASSWORD.boss, newPassword: NEW_PASSWORD }, boss.cookie);
    expect(res.status).toBe(200);
    expect(await argon2.verify(hashOf('boss'), NEW_PASSWORD)).toBe(true);
  });

  it('BE-LOGIN-17: locked account (token for a locked user) cannot change the password -> 401', async () => {
    const before = hashOf('lockedTenant');
    const res = await changePassword(await tokenFor('lockedTenant'), { currentPassword: PASSWORD.lockedTenant, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
    expect(hashOf('lockedTenant')).toBe(before);
  });

  describe('AUTH-T3: sessions', () => {
    it('AUTH-T3: the session of the sent cookie (A) survives, the other session (B) is revoked', async () => {
      const A = await loginOk('tenant');
      const B = await loginOk('tenant');
      const C = await loginOk('tenant');
      await changePassword(A.accessToken, { currentPassword: PASSWORD.tenant, newPassword: NEW_PASSWORD }, A.cookie);
      expect(sessionFor(A.cookie).revokedAt).toBeNull();
      expect(sessionFor(B.cookie).revokedAt).toBeInstanceOf(Date);
      expect(sessionFor(C.cookie).revokedAt).toBeInstanceOf(Date);
      const rb = await refresh(B.cookie);
      expect(rb.status).toBe(401);
      expect(rb.body.error.code).toBe('UNAUTHENTICATED');
      expect((await refresh(C.cookie)).status).toBe(401);
      expect((await refresh(A.cookie)).status).toBe(200);
    });

    it('AUTH-T3: without a cookie every session of the user is revoked', async () => {
      const A = await loginOk('tenant');
      const B = await loginOk('tenant');
      const res = await changePassword(A.accessToken, { currentPassword: PASSWORD.tenant, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(200);
      expect(sessionFor(A.cookie).revokedAt).toBeInstanceOf(Date);
      expect(sessionFor(B.cookie).revokedAt).toBeInstanceOf(Date);
      expect((await refresh(A.cookie)).status).toBe(401);
      expect((await refresh(B.cookie)).status).toBe(401);
    });

    it('AUTH-T3: a garbage cookie keeps no session alive', async () => {
      const A = await loginOk('tenant');
      const B = await loginOk('tenant');
      await changePassword(A.accessToken, { currentPassword: PASSWORD.tenant, newPassword: NEW_PASSWORD }, 'rac-khong-phai-token');
      expect(sessionFor(A.cookie).revokedAt).toBeInstanceOf(Date);
      expect(sessionFor(B.cookie).revokedAt).toBeInstanceOf(Date);
    });

    it("AUTH-T3: someone else's cookie does not protect the caller's sessions, and the other user's sessions are not touched", async () => {
      const tenant = await loginOk('tenant');
      const boss = await loginOk('boss');
      const manager = await loginOk('manager1');
      await changePassword(tenant.accessToken, { currentPassword: PASSWORD.tenant, newPassword: NEW_PASSWORD }, boss.cookie);
      expect(sessionFor(tenant.cookie).revokedAt).toBeInstanceOf(Date);
      expect(sessionFor(boss.cookie).revokedAt).toBeNull();
      expect(sessionFor(manager.cookie).revokedAt).toBeNull();
      expect((await refresh(boss.cookie)).status).toBe(200);
      expect((await refresh(manager.cookie)).status).toBe(200);
    });

    it('AUTH-T3: sessions of other users are never revoked by a change of password', async () => {
      const tenant = await loginOk('tenant');
      const boss = await loginOk('boss');
      const bossSecond = await loginOk('boss');
      await changePassword(tenant.accessToken, { currentPassword: PASSWORD.tenant, newPassword: NEW_PASSWORD }); // no cookie: widest case
      expect(sessionFor(boss.cookie).revokedAt).toBeNull();
      expect(sessionFor(bossSecond.cookie).revokedAt).toBeNull();
    });

    it('AUTH-T3: an already revoked session keeps its original revokedAt', async () => {
      freeze(T0);
      const A = await loginOk('tenant');
      const B = await loginOk('tenant');
      expect((await http().post('/api/v1/auth/logout').set('Cookie', `rt=${B.cookie}`)).status).toBe(200);
      const revokedAt = (sessionFor(B.cookie).revokedAt as Date).getTime();
      expect(revokedAt).toBe(T0);
      vi.setSystemTime(T0 + 10 * MIN); // the access token (15 min) is still valid
      const res = await changePassword(A.accessToken, { currentPassword: PASSWORD.tenant, newPassword: NEW_PASSWORD }, A.cookie);
      expect(res.status).toBe(200);
      expect((sessionFor(B.cookie).revokedAt as Date).getTime()).toBe(T0);
      expect(sessionFor(A.cookie).revokedAt).toBeNull();
    });
  });

  describe('AUTH-03: new password length', () => {
    const TOO_SHORT = validation({ newPassword: 'Mật khẩu tối thiểu 8 ký tự' });

    it('AUTH-03: 7 characters -> 400 fields.newPassword, nothing changes', async () => {
      const boss = await loginOk('boss');
      const before = hashOf('boss');
      const res = await changePassword(boss.accessToken, { currentPassword: PASSWORD.boss, newPassword: 'Abcdef1' }, boss.cookie);
      expect(res.status).toBe(400);
      expect(res.body).toEqual(TOO_SHORT);
      expect(hashOf('boss')).toBe(before);
      expect(fake.db.auditLog).toHaveLength(0);
    });

    it('AUTH-03: 8 characters -> 200', async () => {
      const boss = await loginOk('boss');
      const res = await changePassword(boss.accessToken, { currentPassword: PASSWORD.boss, newPassword: 'Abcdefg1' }, boss.cookie);
      expect(res.status).toBe(200);
      expect(await argon2.verify(hashOf('boss'), 'Abcdefg1')).toBe(true);
    });

    it('AUTH-03: 8 Vietnamese characters ("Mật khẩu") -> 200', async () => {
      const boss = await loginOk('boss');
      const res = await changePassword(boss.accessToken, { currentPassword: PASSWORD.boss, newPassword: 'Mật khẩu' }, boss.cookie);
      expect(res.status).toBe(200);
      expect(await argon2.verify(hashOf('boss'), 'Mật khẩu')).toBe(true);
    });

    for (const bad of ['', 12345678, null]) {
      it(`AUTH-03: newPassword ${JSON.stringify(bad)} -> 400 fields.newPassword`, async () => {
        const boss = await loginOk('boss');
        const res = await changePassword(boss.accessToken, { currentPassword: PASSWORD.boss, newPassword: bad }, boss.cookie);
        expect(res.status).toBe(400);
        expect(res.body).toEqual(TOO_SHORT);
      });
    }

    it('AUTH-03: missing newPassword -> 400 fields.newPassword', async () => {
      const boss = await loginOk('boss');
      const res = await changePassword(boss.accessToken, { currentPassword: PASSWORD.boss }, boss.cookie);
      expect(res.status).toBe(400);
      expect(res.body).toEqual(TOO_SHORT);
    });
  });

  describe('input validation', () => {
    it('BE-LOGIN-17: missing or empty currentPassword -> 400 fields.currentPassword "Vui lòng nhập mật khẩu hiện tại"', async () => {
      const boss = await loginOk('boss');
      const want = validation({ currentPassword: 'Vui lòng nhập mật khẩu hiện tại' });
      for (const body of [{ newPassword: NEW_PASSWORD }, { currentPassword: '', newPassword: NEW_PASSWORD }]) {
        const res = await changePassword(boss.accessToken, body, boss.cookie);
        expect(res.status).toBe(400);
        expect(res.body).toEqual(want);
      }
    });

    it('BE-LOGIN-17 / P13: body [] gives the same Vietnamese fields as body {}', async () => {
      const boss = await loginOk('boss');
      const empty = await changePassword(boss.accessToken, {}, boss.cookie);
      const arr = await changePassword(boss.accessToken, [], boss.cookie);
      expect(empty.status).toBe(400);
      expect(empty.body).toEqual(
        validation({
          currentPassword: 'Vui lòng nhập mật khẩu hiện tại',
          newPassword: 'Mật khẩu tối thiểu 8 ký tự',
        }),
      );
      expect(arr.status).toBe(400);
      expect(arr.body).toEqual(empty.body);
    });

    it('BE-LOGIN-17: an extra field (role) -> 400 fields.role and the password is not changed', async () => {
      const boss = await loginOk('boss');
      const before = hashOf('boss');
      const res = await changePassword(boss.accessToken, { currentPassword: PASSWORD.boss, newPassword: NEW_PASSWORD, role: 'BOSS' }, boss.cookie);
      expect(res.status).toBe(400);
      expect(res.body).toEqual(validation({ role: FORBIDDEN_FIELD }));
      expect(hashOf('boss')).toBe(before);
    });
  });

  describe('Q3: current password and equality', () => {
    it('Q3a: wrong currentPassword -> 400 with fields.currentPassword (not 401); password, flag and sessions unchanged; no audit row', async () => {
      const A = await loginOk('tenant');
      const B = await loginOk('tenant');
      const before = snapshot('tenant');
      const res = await changePassword(A.accessToken, { currentPassword: 'Sai-mat-khau-1', newPassword: NEW_PASSWORD }, A.cookie);
      expect(res.status).toBe(400);
      expect(res.status).not.toBe(401);
      expect(res.body).toEqual(validation({ currentPassword: 'Mật khẩu hiện tại không đúng' }));
      expect(hashOf('tenant')).toBe(before.passwordHash);
      expect(fake.account('tenant').mustChangePassword).toBe(true);
      expect(sessionFor(A.cookie).revokedAt).toBeNull();
      expect(sessionFor(B.cookie).revokedAt).toBeNull();
      expect(fake.db.auditLog).toHaveLength(0);
      // the access token is still fine: the FE must not log the user out
      expect((await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${A.accessToken}`)).status).toBe(200);
    });

    it('Q3b: newPassword equal to the current one -> 400 fields.newPassword; nothing changes; no audit row', async () => {
      const A = await loginOk('tenant');
      const before = hashOf('tenant');
      const res = await changePassword(A.accessToken, { currentPassword: PASSWORD.tenant, newPassword: PASSWORD.tenant }, A.cookie);
      expect(res.status).toBe(400);
      expect(res.body).toEqual(validation({ newPassword: 'Mật khẩu mới phải khác mật khẩu hiện tại' }));
      expect(hashOf('tenant')).toBe(before);
      expect(fake.account('tenant').mustChangePassword).toBe(true);
      expect(fake.db.auditLog).toHaveLength(0);
    });

    it('Q3: when currentPassword is wrong, that error wins even if newPassword equals it', async () => {
      const boss = await loginOk('boss');
      const res = await changePassword(boss.accessToken, { currentPassword: 'Sai-mat-khau-1', newPassword: 'Sai-mat-khau-1' }, boss.cookie);
      expect(res.status).toBe(400);
      expect(res.body).toEqual(validation({ currentPassword: 'Mật khẩu hiện tại không đúng' }));
    });

    it('Q3c: six wrong currentPassword attempts do not count toward AUTH-04: login with the right password still gives 200', async () => {
      const boss = await loginOk('boss');
      for (let i = 1; i <= 6; i++) {
        const res = await changePassword(boss.accessToken, { currentPassword: `Sai-mat-khau-${i}`, newPassword: NEW_PASSWORD }, boss.cookie);
        expect(res.status, `attempt #${i}`).toBe(400);
      }
      const res = await login(PHONE.boss, PASSWORD.boss);
      expect(res.status).toBe(200);
    });
  });

  describe('AUD-01 / BE-LOGIN-23: audit of the change', () => {
    it('AUD-01: success writes exactly 1 audit row user.change_password, actor = entity = the tenant, ip set, no before/after, no secret', async () => {
      const A = await loginOk('tenant');
      const res = await changePassword(A.accessToken, { currentPassword: PASSWORD.tenant, newPassword: NEW_PASSWORD }, A.cookie);
      expect(res.status).toBe(200);
      expect(fake.db.auditLog).toHaveLength(1);
      const row = fake.db.auditLog[0];
      expect(row.actorId).toBe(IDS.users.tenant);
      expect(row.entityId).toBe(IDS.users.tenant);
      expect(row.action).toBe('user.change_password');
      expect(row.entity).toBe('user');
      expect(typeof row.ip).toBe('string');
      expect(row.ip).toMatch(/127\.0\.0\.1|::1/); // supertest talks to the app over loopback
      // an omitted JSON column is NULL in the real table
      expect(row.before ?? null).toBeNull();
      expect(row.after ?? null).toBeNull();
      const text = JSON.stringify(row);
      for (const secret of ['$argon2', PASSWORD.tenant, NEW_PASSWORD]) expect(text).not.toContain(secret);
    });

    it('AUD-01: a failed change (wrong current, same password, too short) writes no audit row', async () => {
      const boss = await loginOk('boss');
      await changePassword(boss.accessToken, { currentPassword: 'Sai-mat-khau-1', newPassword: NEW_PASSWORD }, boss.cookie);
      await changePassword(boss.accessToken, { currentPassword: PASSWORD.boss, newPassword: PASSWORD.boss }, boss.cookie);
      await changePassword(boss.accessToken, { currentPassword: PASSWORD.boss, newPassword: 'ngan' }, boss.cookie);
      expect(fake.db.auditLog).toHaveLength(0);
    });

    it('AUD-01: two successful changes write two rows', async () => {
      const boss = await loginOk('boss');
      await changePassword(boss.accessToken, { currentPassword: PASSWORD.boss, newPassword: NEW_PASSWORD }, boss.cookie);
      await changePassword(boss.accessToken, { currentPassword: NEW_PASSWORD, newPassword: 'MatKhauMoi@2' }, boss.cookie);
      expect(fake.db.auditLog).toHaveLength(2);
      expect(fake.db.auditLog.every((r) => r.action === 'user.change_password' && r.actorId === IDS.users.boss)).toBe(true);
    });

    it('AUD-01: user update, session revocation and audit insert all run inside one $transaction', async () => {
      const A = await loginOk('tenant');
      // Test seam: record whether each write happens while the (fake) $transaction callback is running.
      const log: Array<{ op: string; inTx: boolean }> = [];
      let depth = 0;
      const original = fake.$transaction.bind(fake);
      const txSpy = vi.spyOn(fake, '$transaction').mockImplementation(async (fn) => {
        depth++;
        try {
          return await original(fn);
        } finally {
          depth--;
        }
      });
      const userUpdate = fake.user.update.bind(fake.user);
      vi.spyOn(fake.user, 'update').mockImplementation((args) => {
        log.push({ op: 'user.update', inTx: depth > 0 });
        return userUpdate(args);
      });
      const sessionUpdateMany = fake.session.updateMany.bind(fake.session);
      vi.spyOn(fake.session, 'updateMany').mockImplementation((args) => {
        log.push({ op: 'session.updateMany', inTx: depth > 0 });
        return sessionUpdateMany(args);
      });
      const auditCreate = fake.auditLog.create.bind(fake.auditLog);
      vi.spyOn(fake.auditLog, 'create').mockImplementation((args) => {
        log.push({ op: 'auditLog.create', inTx: depth > 0 });
        return auditCreate(args);
      });

      const res = await changePassword(A.accessToken, { currentPassword: PASSWORD.tenant, newPassword: NEW_PASSWORD }, A.cookie);
      expect(res.status).toBe(200);
      expect(txSpy).toHaveBeenCalledTimes(1);
      expect(log.map((l) => l.op).sort()).toEqual(['auditLog.create', 'session.updateMany', 'user.update']);
      expect(log.every((l) => l.inTx)).toBe(true);
    });
  });
});
