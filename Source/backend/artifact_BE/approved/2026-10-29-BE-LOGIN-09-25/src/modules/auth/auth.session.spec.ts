import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { createFakePrisma, type FakePrisma, IDS, type Row } from '../../../test/fixtures/fake-prisma.js';

// Outside edges replaced: PrismaService -> in-memory fake (the DB), the clock -> vi.useFakeTimers({ toFake: ['Date'] }).
// Real: AppModule, the 3 global guards, AuthController/AuthService/RateLimiter, TokenService, argon2, configureApp.
// A new app (new AuthService, new RateLimiter) is built for every test, so AUTH-04 counters never leak between tests.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SECRET = 'auth-session-spec-secret-0123456789ab-01';
const UA = 'Vitest-Agent/1.0';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.parse('2026-10-29T10:00:00+07:00'); // 2026-10-29T03:00:00Z

type Who = keyof typeof IDS.users;
const PHONE: Record<Who, string> = {
  boss: '0900000001', manager1: '0900000002', manager2: '0900000003', tenant: '0900000004', lockedTenant: '0900000005',
};
const PASSWORD: Record<Who, string> = {
  boss: 'Boss@2026', manager1: 'QuanLy1@2026', manager2: 'QuanLy2@2026', tenant: 'NguoiThue@2026', lockedTenant: 'TamKhoa@2026',
};
const ROLE = { boss: 'BOSS', manager1: 'MANAGER', manager2: 'MANAGER', tenant: 'TENANT' } as const;
const UNKNOWN_PHONE = '0999999999';
const WRONG_PASSWORD = 'Sai-mat-khau-1';

const INVALID_BODY = { error: { code: 'INVALID_CREDENTIALS', message: 'Số điện thoại hoặc mật khẩu không đúng' } };
const LOCKED_BODY = { error: { code: 'ACCOUNT_LOCKED', message: 'Tài khoản đã bị khóa. Liên hệ quản lý.' } };
const TOO_MANY_BODY = { error: { code: 'TOO_MANY_REQUESTS', message: 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau' } };
const validation = (fields: Record<string, string>) => ({
  error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ', fields },
});

let app: INestApplication;
let fake: FakePrisma;
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
const login = (body: unknown, ua: string = UA) =>
  request(app.getHttpServer()).post('/api/v1/auth/login').set('User-Agent', ua).send(body as object);
const credentials = (who: Who, extra: object = {}) => ({ phone: PHONE[who], password: PASSWORD[who], ...extra });
const wrong = (phone: string) => login({ phone, password: WRONG_PASSWORD });
const withCookie = (req: request.Test, cookie?: string) => (cookie === undefined ? req : req.set('Cookie', `rt=${cookie}`));
const refresh = (cookie?: string, ua: string = UA) =>
  withCookie(request(app.getHttpServer()).post('/api/v1/auth/refresh').set('User-Agent', ua), cookie);
const logout = (cookie?: string, accessToken?: string) => {
  const req = withCookie(request(app.getHttpServer()).post('/api/v1/auth/logout'), cookie);
  return accessToken === undefined ? req : req.set('Authorization', `Bearer ${accessToken}`);
};
const me = (accessToken: string) =>
  request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);

const setCookies = (res: request.Response): string[] => (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
const rtCookie = (res: request.Response): string | undefined => setCookies(res).find((c) => c.startsWith('rt='));
const rtValue = (res: request.Response): string => {
  const c = rtCookie(res);
  if (!c) throw new Error('response has no rt cookie');
  return c.split(';')[0].slice('rt='.length);
};
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex'); // independent of the code under test
const sessionFor = (cookie: string): Row | undefined => fake.db.session.find((r) => r.tokenHash === sha256(cookie));
const iso = (d: unknown) => (d as Date).toISOString();
const payloadOf = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

async function loginOk(who: Who, extra: object = {}) {
  const res = await login(credentials(who, extra));
  expect(res.status).toBe(200);
  return { res, cookie: rtValue(res), accessToken: res.body.data.accessToken as string };
}
async function failTimes(phone: string, n: number) {
  for (let i = 1; i <= n; i++) expect((await wrong(phone)).status, `failure #${i}`).toBe(401);
}

// ---- AUTH-01 / BE-LOGIN-11 -------------------------------------------------------------------------------

describe('AUTH-01: POST /auth/login', () => {
  for (const who of ['boss', 'manager1', 'manager2', 'tenant'] as const) {
    it(`AUTH-01: ${who} logs in -> 200 (not 201), accessToken for the right sub/role, user equals GET /auth/me`, async () => {
      const res = await login(credentials(who));
      expect(res.status).toBe(200);
      expect(Object.keys(res.body)).toEqual(['data']);
      expect(Object.keys(res.body.data).sort()).toEqual(['accessToken', 'user']);
      const payload = payloadOf(res.body.data.accessToken);
      expect(payload.sub).toBe(String(IDS.users[who]));
      expect(payload.role).toBe(ROLE[who]);
      expect(payload.exp - payload.iat).toBe(900);
      const meRes = await me(res.body.data.accessToken); // the token really works
      expect(meRes.status).toBe(200);
      expect(res.body.data.user).toEqual(meRes.body.data);
      expect(res.body.data.user.role).toBe(ROLE[who]);
      expect(res.body.data.user.mustChangePassword).toBe(who === 'tenant');
      expect('buildings' in res.body.data.user).toBe(who !== 'tenant');
      // secrets stay out of the body: the refresh token travels only in the cookie
      const text = JSON.stringify(res.body);
      for (const bad of [rtValue(res), 'passwordHash', '$argon2', 'isActive', 'lastLoginAt']) expect(text).not.toContain(bad);
    });
  }

  it('AUTH-01: Set-Cookie rt has Path=/api/v1/auth, HttpOnly, SameSite=Lax and no Secure outside production', async () => {
    const cookie = rtCookie(await login(credentials('boss')))!;
    expect(cookie).toBeDefined();
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toMatch(/;\s*HttpOnly/);
    expect(cookie).toMatch(/;\s*SameSite=Lax/);
    expect(cookie).not.toMatch(/;\s*Secure/);
    expect(cookie.split(';')[0].slice(3)).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
  });

  it('AUTH-T2: with NODE_ENV=production the rt cookie is Secure', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(rtCookie(await login(credentials('boss')))).toMatch(/;\s*Secure/);
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
    }
  });

  it('AUTH-01: wrong password and unknown phone give the identical 401, no cookie, no session', async () => {
    const wrongPw = await login({ phone: PHONE.boss, password: 'Boss@2027' });
    const unknown = await login({ phone: UNKNOWN_PHONE, password: 'Boss@2026' });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body).toEqual(INVALID_BODY);
    expect(unknown.body).toEqual(INVALID_BODY);
    expect(setCookies(wrongPw)).toEqual([]);
    expect(setCookies(unknown)).toEqual([]);
    expect(fake.db.session).toHaveLength(0);
    expect(fake.account('boss').lastLoginAt).toBeNull();
  });

  it('AUTH-01 / P7: an unknown phone still pays exactly one argon2.verify (reply time does not reveal the account)', async () => {
    const verify = vi.spyOn(argon2, 'verify'); // spy only, calls through
    await login({ phone: UNKNOWN_PHONE, password: 'whatever-1' });
    expect(verify).toHaveBeenCalledTimes(1);
    verify.mockClear();
    await login({ phone: PHONE.boss, password: 'whatever-1' });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('AUTH-01: a corrupt stored hash is just a wrong password (401), never a 500', async () => {
    fake.account('boss').passwordHash = 'khong-phai-hash';
    const res = await login(credentials('boss'));
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID_BODY);
  });

  it('AUTH-01: the password is compared exactly (no trimming, case sensitive)', async () => {
    expect((await login({ phone: PHONE.boss, password: ' Boss@2026' })).status).toBe(401);
    expect((await login({ phone: PHONE.boss, password: 'boss@2026' })).status).toBe(401);
    expect((await login({ phone: PHONE.boss, password: 'x'.repeat(5000) })).status).toBe(401);
  });
});

describe('BE-LOGIN-11: login side effects', () => {
  it('BE-LOGIN-11: lastLoginAt is set to now and one sessions row stores only the SHA-256 of the cookie', async () => {
    freeze(T0);
    expect(fake.account('manager1').lastLoginAt).toBeNull();
    const { res, cookie } = await loginOk('manager1');
    expect(fake.account('manager1').lastLoginAt).toEqual(new Date(T0));
    expect(fake.db.session).toHaveLength(1);
    const row = fake.db.session[0];
    expect(row.tokenHash).toBe(sha256(cookie));
    expect(row.tokenHash).not.toBe(cookie);
    expect(row.userId).toBe(IDS.users.manager1);
    expect(row.userAgent).toBe(UA);
    expect(row.revokedAt).toBeNull();
    expect(JSON.stringify(fake.db.session)).not.toContain(cookie); // the raw token is never stored
    expect(res.status).toBe(200);
  });

  it('BE-LOGIN-11: two logins make two independent sessions with different tokens', async () => {
    const a = await loginOk('boss');
    const b = await loginOk('boss');
    expect(a.cookie).not.toBe(b.cookie);
    expect(fake.db.session).toHaveLength(2);
  });
});

// ---- AUTH-02 ---------------------------------------------------------------------------------------------

describe('AUTH-02: inactive account', () => {
  it('AUTH-02: right password on the locked tenant -> 403 ACCOUNT_LOCKED, no cookie, no session, lastLoginAt untouched', async () => {
    const res = await login(credentials('lockedTenant'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual(LOCKED_BODY);
    expect(setCookies(res)).toEqual([]);
    expect(fake.db.session).toHaveLength(0);
    expect(fake.account('lockedTenant').lastLoginAt).toBeNull();
  });

  it('AUTH-02 / Q2d: wrong password on the locked tenant -> 401 INVALID_CREDENTIALS (same body as AUTH-01)', async () => {
    const res = await wrong(PHONE.lockedTenant);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID_BODY);
  });

  it('AUTH-02: an account deactivated after a good login can no longer log in', async () => {
    await loginOk('manager1');
    fake.account('manager1').isActive = false;
    const res = await login(credentials('manager1'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual(LOCKED_BODY);
  });
});

// ---- G-04 input ------------------------------------------------------------------------------------------

describe('G-04: login input validation', () => {
  const phoneError = validation({ phone: 'Số điện thoại không hợp lệ' });

  for (const [label, phone] of [
    ['9 digits', '090000001'],
    ['11 digits', '09000000011'],
    ['starts with 1', '1900000001'],
    ['a number, not a string', 900000001],
    ['leading space', ' 0900000001'],
    ['trailing newline', '0900000001\n'],
    ['letters', '09000000AB'],
    ['empty', ''],
  ] as const) {
    it(`G-04: phone ${label} -> 400 fields.phone`, async () => {
      const res = await login({ phone, password: 'Boss@2026' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(phoneError);
      expect(setCookies(res)).toEqual([]);
    });
  }

  it('G-04: missing, empty or non-string password -> 400 fields.password', async () => {
    const expected = validation({ password: 'Vui lòng nhập mật khẩu' });
    for (const body of [{ phone: PHONE.boss }, { phone: PHONE.boss, password: '' }, { phone: PHONE.boss, password: 123456789 }]) {
      const res = await login(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body, JSON.stringify(body)).toEqual(expected);
    }
  });

  it('G-04: remember that is not a boolean -> 400 fields.remember', async () => {
    for (const remember of ['yes', 'true', 1]) {
      const res = await login(credentials('boss', { remember }));
      expect(res.status, String(remember)).toBe(400);
      expect(res.body.error.fields).toEqual({ remember: 'Giá trị ghi nhớ đăng nhập không hợp lệ' });
    }
  });

  it('G-04: an extra field (role) is rejected, never ignored -> 400 fields.role', async () => {
    const res = await login(credentials('boss', { role: 'BOSS' }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual(validation({ role: 'Trường này không được phép gửi lên' }));
    expect(setCookies(res)).toEqual([]);
  });

  it('P13: body [] is checked like {} -> the same Vietnamese fields, no English text, no fields.constructor', async () => {
    const expected = validation({ phone: 'Số điện thoại không hợp lệ', password: 'Vui lòng nhập mật khẩu' });
    const arr = await login([]);
    const empty = await login({});
    expect(arr.status).toBe(400);
    expect(arr.body).toEqual(expected);
    expect(arr.body).toEqual(empty.body);
    expect(JSON.stringify(arr.body)).not.toMatch(/constructor|unknown value|should not exist/);
  });

  it('AUTH-04: 400 validation errors are never counted as failed logins', async () => {
    for (let i = 0; i < 7; i++) {
      expect((await login({ phone: PHONE.boss })).status).toBe(400); // missing password
      expect((await login({ phone: '123', password: 'x' })).status).toBe(400);
    }
    expect((await login(credentials('boss'))).status).toBe(200); // not 429
  });
});

// ---- AUTH-T2 lifetime ------------------------------------------------------------------------------------

describe('AUTH-T2: refresh token lifetime chosen at login (A-07)', () => {
  it('AUTH-T2: remember true -> expiresAt = now + 30 days and the cookie carries that Expires', async () => {
    freeze(T0);
    const { res, cookie } = await loginOk('boss', { remember: true });
    expect(iso(sessionFor(cookie)!.expiresAt)).toBe('2026-11-28T03:00:00.000Z');
    expect(sessionFor(cookie)!.remember).toBe(true);
    expect(rtCookie(res)).toContain(`Expires=${new Date(T0 + 30 * DAY).toUTCString()}`);
  });

  it('AUTH-T2 / A-07: remember false -> expiresAt = now + 12 hours and a browser-session cookie (no Expires, no Max-Age)', async () => {
    freeze(T0);
    const { res, cookie } = await loginOk('boss', { remember: false });
    expect(iso(sessionFor(cookie)!.expiresAt)).toBe('2026-10-29T15:00:00.000Z');
    expect(sessionFor(cookie)!.remember).toBe(false);
    expect(rtCookie(res)).not.toMatch(/Expires|Max-Age/i);
  });

  it('AUTH-T2 / A-07: remember omitted behaves as false', async () => {
    freeze(T0);
    const { res, cookie } = await loginOk('boss');
    expect(iso(sessionFor(cookie)!.expiresAt)).toBe('2026-10-29T15:00:00.000Z');
    expect(rtCookie(res)).not.toMatch(/Expires|Max-Age/i);
  });

  it('AUTH-T2: month end in Asia/Ho_Chi_Minh (2026-10-31 23:30 +07) -> 12 h = 2026-11-01 11:30 +07, 30 d = 2026-11-30 23:30 +07', async () => {
    freeze(Date.parse('2026-10-31T23:30:00+07:00'));
    const short = await loginOk('boss');
    const long = await loginOk('manager1', { remember: true });
    expect(iso(sessionFor(short.cookie)!.expiresAt)).toBe(new Date('2026-11-01T11:30:00+07:00').toISOString());
    expect(iso(sessionFor(long.cookie)!.expiresAt)).toBe(new Date('2026-11-30T23:30:00+07:00').toISOString());
    expect(iso(sessionFor(long.cookie)!.expiresAt)).toBe('2026-11-30T16:30:00.000Z');
  });
});

// ---- AUTH-04 ---------------------------------------------------------------------------------------------

describe('AUTH-04: 5 failures per phone per 15 minutes -> 429', () => {
  it('AUTH-04: 5 wrong passwords give five 401, the 6th wrong gives 429 TOO_MANY_REQUESTS', async () => {
    await failTimes(PHONE.boss, 5);
    const sixth = await wrong(PHONE.boss);
    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual(TOO_MANY_BODY);
  });

  it('AUTH-04 / Q2a: once blocked, the RIGHT password is 429 too: no cookie, no session, and argon2 is not even run', async () => {
    await failTimes(PHONE.boss, 5);
    const verify = vi.spyOn(argon2, 'verify');
    const res = await login(credentials('boss'));
    expect(res.status).toBe(429);
    expect(res.body).toEqual(TOO_MANY_BODY);
    expect(setCookies(res)).toEqual([]);
    expect(fake.db.session).toHaveLength(0);
    expect(verify).not.toHaveBeenCalled();
  });

  it('AUTH-04: the block is per phone, other phones (existing or not) are unaffected', async () => {
    await failTimes(PHONE.boss, 5);
    expect((await wrong(PHONE.boss)).status).toBe(429);
    expect((await login(credentials('manager1'))).status).toBe(200);
    expect((await wrong(PHONE.manager2)).status).toBe(401);
    expect((await wrong(UNKNOWN_PHONE)).status).toBe(401);
  });

  it('AUTH-04: a phone with only 4 failures is not blocked, the right password still works', async () => {
    await failTimes(PHONE.boss, 4);
    expect((await login(credentials('boss'))).status).toBe(200);
  });

  it('AUTH-04 (window edge): 5 failures at t -> still 429 at t + 15 min - 1 ms, right password 200 at t + 15 min', async () => {
    freeze(T0);
    await failTimes(PHONE.boss, 5);
    vi.setSystemTime(T0 + 15 * MIN - 1);
    expect((await login(credentials('boss'))).status).toBe(429);
    vi.setSystemTime(T0 + 15 * MIN);
    expect((await login(credentials('boss'))).status).toBe(200);
  });

  it('AUTH-04 (sliding window): failures at t..t+4min -> 429 until t + 15 min, then the oldest has left and the right password works', async () => {
    freeze(T0);
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(T0 + i * MIN);
      expect((await wrong(PHONE.boss)).status).toBe(401);
    }
    vi.setSystemTime(T0 + 15 * MIN - 1);
    expect((await login(credentials('boss'))).status).toBe(429);
    vi.setSystemTime(T0 + 15 * MIN);
    expect((await login(credentials('boss'))).status).toBe(200);
  });

  it('AUTH-04 (sliding window): at t + 15 min one wrong password is 401 but then 5 are inside the window again -> next is 429', async () => {
    freeze(T0);
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(T0 + i * MIN);
      await wrong(PHONE.boss);
    }
    vi.setSystemTime(T0 + 15 * MIN);
    expect((await wrong(PHONE.boss)).status).toBe(401); // 4 old + this one = 5 in window
    expect((await login(credentials('boss'))).status).toBe(429);
  });

  it('AUTH-04 / Q2a: a request answered with 429 is not counted (5 failures at t, 5 more refused at t + 1 min, right password OK at t + 15 min)', async () => {
    freeze(T0);
    await failTimes(PHONE.boss, 5);
    vi.setSystemTime(T0 + 1 * MIN);
    for (let i = 0; i < 5; i++) expect((await wrong(PHONE.boss)).status).toBe(429);
    vi.setSystemTime(T0 + 15 * MIN);
    expect((await login(credentials('boss'))).status).toBe(200);
  });

  it('AUTH-04 / Q2b: a successful login clears the counter (4 wrong, right, then 4 wrong are still 401, not 429)', async () => {
    await failTimes(PHONE.boss, 4);
    expect((await login(credentials('boss'))).status).toBe(200);
    await failTimes(PHONE.boss, 4);
    expect((await login(credentials('boss'))).status).toBe(200);
  });

  it('AUTH-04 / Q2c: an unknown phone is counted too (6th attempt -> 429)', async () => {
    await failTimes(UNKNOWN_PHONE, 5);
    const sixth = await wrong(UNKNOWN_PHONE);
    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual(TOO_MANY_BODY);
  });

  it('AUTH-04 / Q2d: right password on the locked account x6 -> six 403 ACCOUNT_LOCKED, never counted, never 429', async () => {
    for (let i = 1; i <= 6; i++) {
      const res = await login(credentials('lockedTenant'));
      expect(res.status, `attempt #${i}`).toBe(403);
      expect(res.body).toEqual(LOCKED_BODY);
    }
  });

  it('AUTH-04 / Q2d: 4 wrong + 1 right on the locked account (403, neither counted nor clearing) + 1 wrong = 5th failure -> next is 429', async () => {
    await failTimes(PHONE.lockedTenant, 4);
    expect((await login(credentials('lockedTenant'))).status).toBe(403);
    expect((await wrong(PHONE.lockedTenant)).status).toBe(401); // the 5th counted failure
    const next = await login(credentials('lockedTenant'));
    expect(next.status).toBe(429);
    expect(next.body).toEqual(TOO_MANY_BODY);
  });

  it('AUTH-04 / Q2d: wrong passwords on the locked account are counted like any other (6th -> 429)', async () => {
    await failTimes(PHONE.lockedTenant, 5);
    expect((await wrong(PHONE.lockedTenant)).status).toBe(429);
  });

  it('AUTH-04: a fresh app starts with fresh counters (state lives in the AuthService instance)', async () => {
    await failTimes(PHONE.boss, 5);
    expect((await wrong(PHONE.boss)).status).toBe(429);
    await app.close();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    expect((await login(credentials('boss'))).status).toBe(200);
  });
});

// ---- AUTH-T2 refresh -------------------------------------------------------------------------------------

describe('AUTH-T2: POST /auth/refresh rotates the refresh token', () => {
  it('AUTH-T2: refresh -> 200 { data: { accessToken } }, new rt cookie, old session revoked, one new session, same expiresAt, old cookie dead', async () => {
    freeze(T0);
    const { cookie: oldCookie } = await loginOk('manager1', { remember: true });
    const oldRow = sessionFor(oldCookie)!;
    vi.setSystemTime(T0 + 5 * MIN);

    const res = await refresh(oldCookie, 'Other-Agent/2.0');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['data']);
    expect(Object.keys(res.body.data)).toEqual(['accessToken']);
    const payload = payloadOf(res.body.data.accessToken);
    expect(payload.sub).toBe(String(IDS.users.manager1));
    expect(payload.role).toBe('MANAGER');
    expect((await me(res.body.data.accessToken)).status).toBe(200); // the new access token really works

    const newCookie = rtValue(res);
    expect(newCookie).not.toBe(oldCookie);
    expect(oldRow.revokedAt).toEqual(new Date(T0 + 5 * MIN));
    expect(fake.db.session).toHaveLength(2);
    const fresh = sessionFor(newCookie)!;
    expect(fresh.userId).toBe(IDS.users.manager1);
    expect(fresh.remember).toBe(true);
    expect(fresh.expiresAt).toEqual(oldRow.expiresAt); // Q1: the cap counts from login
    expect(fresh.revokedAt).toBeNull();
    expect(fresh.userAgent).toBe('Other-Agent/2.0');
    expect(fake.db.session.filter((s) => s.revokedAt === null)).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(newCookie);

    const replay = await refresh(oldCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('AUTH-T2: the rotated cookie works again (a chain of refreshes) and each old one dies', async () => {
    const { cookie: c1 } = await loginOk('boss');
    const r2 = await refresh(c1);
    const c2 = rtValue(r2);
    const r3 = await refresh(c2);
    expect(r3.status).toBe(200);
    expect((await refresh(c2)).status).toBe(401);
    expect((await refresh(c1)).status).toBe(401);
    expect((await refresh(rtValue(r3))).status).toBe(200);
  });

  it('AUTH-T2: a remember=false session stays a browser-session cookie after rotation; remember=true keeps the old Expires', async () => {
    freeze(T0);
    const short = await loginOk('boss');
    const long = await loginOk('manager1', { remember: true });
    vi.setSystemTime(T0 + HOUR);
    const rs = await refresh(short.cookie);
    const rl = await refresh(long.cookie);
    expect(rtCookie(rs)).toMatch(/Path=\/api\/v1\/auth/);
    expect(rtCookie(rs)).toMatch(/;\s*HttpOnly/);
    expect(rtCookie(rs)).not.toMatch(/Expires|Max-Age/i);
    expect(sessionFor(rtValue(rs))!.remember).toBe(false);
    expect(rtCookie(rl)).toContain(`Expires=${new Date(T0 + 30 * DAY).toUTCString()}`);
  });

  it('AUTH-T2 / A-07 / Q1: remember login at t, refresh at t + 10 days -> new expiresAt is t + 30 days (not t + 40), cookie Expires the same', async () => {
    freeze(T0);
    const { cookie } = await loginOk('boss', { remember: true });
    vi.setSystemTime(T0 + 10 * DAY);
    const res = await refresh(cookie);
    expect(res.status).toBe(200);
    expect(iso(sessionFor(rtValue(res))!.expiresAt)).toBe('2026-11-28T03:00:00.000Z');
    expect(rtCookie(res)).toContain(`Expires=${new Date('2026-11-28T03:00:00Z').toUTCString()}`);
    expect(rtCookie(res)).not.toContain(new Date(T0 + 40 * DAY).toUTCString());
  });

  it('AUTH-T2 / A-07 / Q1: browser-session login at t, refresh at t + 11 h -> 200 and expiresAt t + 12 h; the new cookie is refused at t + 12 h', async () => {
    freeze(T0);
    const { cookie } = await loginOk('boss');
    vi.setSystemTime(T0 + 11 * HOUR);
    const res = await refresh(cookie);
    expect(res.status).toBe(200);
    expect(iso(sessionFor(rtValue(res))!.expiresAt)).toBe('2026-10-29T15:00:00.000Z'); // t + 12 h, not t + 23 h
    vi.setSystemTime(T0 + 12 * HOUR);
    const late = await refresh(rtValue(res));
    expect(late.status).toBe(401);
    expect(late.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('AUTH-T2 (boundary): expiresAt = now + 1 ms -> 200', async () => {
    freeze(T0);
    const { cookie } = await loginOk('boss');
    vi.setSystemTime(T0 + 12 * HOUR - 1);
    expect((await refresh(cookie)).status).toBe(200);
  });

  it('AUTH-T2 (boundary): expiresAt = now -> 401', async () => {
    freeze(T0);
    const { cookie } = await loginOk('boss');
    vi.setSystemTime(T0 + 12 * HOUR);
    expect((await refresh(cookie)).status).toBe(401);
  });

  it('AUTH-T2: no cookie -> 401 UNAUTHENTICATED', async () => {
    const res = await refresh();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('AUTH-T2: garbage, empty and object-like ("j:") cookies -> 401, never 500', async () => {
    for (const raw of ['rac', '', 'j:{"a":1}', 'j:[]', 'x'.repeat(2000)]) {
      const res = await refresh(raw);
      expect(res.status, JSON.stringify(raw)).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('AUTH-T2: an access token is not a refresh token', async () => {
    const { accessToken } = await loginOk('boss');
    expect((await refresh(accessToken)).status).toBe(401);
  });

  it('AUTH-T2: a session with revokedAt set -> 401', async () => {
    const { cookie } = await loginOk('boss');
    sessionFor(cookie)!.revokedAt = new Date();
    expect((await refresh(cookie)).status).toBe(401);
  });

  it('AUTH-T2: the user of the session was locked after login -> 401 and no new session', async () => {
    const { cookie } = await loginOk('manager1');
    fake.account('manager1').isActive = false;
    const res = await refresh(cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(fake.db.session).toHaveLength(1);
  });

  it('AUTH-T2: the user of the session no longer exists -> 401', async () => {
    const { cookie } = await loginOk('manager1');
    fake.db.user.splice(0, fake.db.user.length);
    expect((await refresh(cookie)).status).toBe(401);
  });

  it('AUTH-T2: refresh of one user never touches the sessions of another', async () => {
    const boss = await loginOk('boss');
    const mgr = await loginOk('manager1');
    await refresh(boss.cookie);
    expect(sessionFor(mgr.cookie)!.revokedAt).toBeNull();
    expect((await refresh(mgr.cookie)).status).toBe(200);
  });

  it('AUTH-T2: two simultaneous refreshes of one cookie -> exactly one 200, one 401, one new session', async () => {
    const { cookie } = await loginOk('boss');
    // Outside edge (DB): hold both session lookups until both requests have read the row,
    // so the second one reaches the conditional update after the first and sees count = 0.
    const real = fake.session.findUnique.bind(fake.session);
    let reads = 0;
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    fake.session.findUnique = async (args: Parameters<typeof real>[0]) => {
      const row = await real(args);
      if (++reads === 2) openGate();
      await gate;
      return row;
    };
    const [a, b] = await Promise.all([refresh(cookie), refresh(cookie)]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 401]);
    expect(fake.db.session).toHaveLength(2); // old (revoked) + exactly one new
    expect(fake.db.session.filter((s) => s.revokedAt === null)).toHaveLength(1);
  });
});

// ---- BE-LOGIN-14 -----------------------------------------------------------------------------------------

describe('BE-LOGIN-14: POST /auth/logout', () => {
  it('BE-LOGIN-14: with a cookie -> 200 { data: null }, session revoked, rt cookie cleared, refresh with it -> 401', async () => {
    freeze(T0);
    const { cookie } = await loginOk('boss');
    vi.setSystemTime(T0 + MIN);
    const res = await logout(cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });
    expect(sessionFor(cookie)!.revokedAt).toEqual(new Date(T0 + MIN));
    const cleared = rtCookie(res)!;
    expect(cleared).toBeDefined();
    expect(cleared.startsWith('rt=;')).toBe(true);
    expect(cleared).toContain('Path=/api/v1/auth');
    expect(cleared).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(cleared).toMatch(/;\s*HttpOnly/);
    expect(cleared).toMatch(/;\s*SameSite=Lax/);
    expect((await refresh(cookie)).status).toBe(401);
  });

  it('BE-LOGIN-14: the clearing cookie carries the same Secure attribute as the cookie it removes (production)', async () => {
    const { cookie } = await loginOk('boss');
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(rtCookie(await logout(cookie))).toMatch(/;\s*Secure/);
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
    }
  });

  it('BE-LOGIN-14: no cookie, no access token -> still 200 { data: null }', async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });
  });

  it('BE-LOGIN-14: an unknown or object-like cookie -> 200 and no session is touched', async () => {
    const { cookie } = await loginOk('boss');
    for (const raw of ['rac', 'j:{"a":1}', '']) {
      const res = await logout(raw);
      expect(res.status, JSON.stringify(raw)).toBe(200);
      expect(res.body).toEqual({ data: null });
    }
    expect(sessionFor(cookie)!.revokedAt).toBeNull();
  });

  it('BE-LOGIN-14 / P4: a tenant who must change the password can still log out -> 200', async () => {
    const { cookie, accessToken } = await loginOk('tenant');
    const res = await logout(cookie, accessToken);
    expect(res.status).toBe(200);
    expect(sessionFor(cookie)!.revokedAt).toBeInstanceOf(Date);
  });

  it('BE-LOGIN-14 / P3: a garbage or expired access token does not block logout -> 200', async () => {
    const { cookie } = await loginOk('boss');
    expect((await logout(cookie, 'rac')).status).toBe(200);
  });

  it('BE-LOGIN-14: logging out twice is fine and keeps the first revokedAt', async () => {
    freeze(T0);
    const { cookie } = await loginOk('boss');
    expect((await logout(cookie)).status).toBe(200);
    vi.setSystemTime(T0 + HOUR);
    expect((await logout(cookie)).status).toBe(200);
    expect(sessionFor(cookie)!.revokedAt).toEqual(new Date(T0));
  });

  it('BE-LOGIN-14: logout revokes only the session of that cookie (another device stays logged in)', async () => {
    const a = await loginOk('boss');
    const b = await loginOk('boss');
    await logout(a.cookie);
    expect(sessionFor(a.cookie)!.revokedAt).toBeInstanceOf(Date);
    expect(sessionFor(b.cookie)!.revokedAt).toBeNull();
    expect((await refresh(b.cookie)).status).toBe(200);
  });
});
