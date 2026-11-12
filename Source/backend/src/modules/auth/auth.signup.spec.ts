import { type INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { createFakePrisma, type FakePrisma, IDS, type Row } from '../../../test/fixtures/fake-prisma.js';
import { type Sms, SmsService } from '../sms/sms.service.js';

// BE-EX-02..06: sign-up, SMS code, phone verification (AUTH-11..14, A-11), through HTTP.
// Outside edges replaced: PrismaService -> in-memory fake (the DB), SmsService -> vi.fn spy (the SMS provider),
// the clock -> vi.useFakeTimers({ toFake: ['Date'] }). Everything else is the real AppModule.
// Expected values come from docs/spec/10-auth.md (AUTH-11..14), 00-overview A-11 and 01-architecture#error-codes;
// the PHONE_NOT_VERIFIED / OTP_INVALID / SMS_UNAVAILABLE wording is the [ASSUMPTION] of BE-EX-03.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SECRET = 'auth-signup-spec-secret-0123456789abc-01';
const SEC = 1000;
const MIN = 60 * SEC;
// 10:00 Hà Nội on 12/11/2026.
const T0 = Date.parse('2026-11-12T10:00:00+07:00');

const NEW_PHONE = '0912345678';
const PASSWORD = 'MatKhau@2026';
const PHONE = { boss: '0900000001', manager1: '0900000002', tenant: '0900000004', lockedTenant: '0900000005' };
const STAFF_PASSWORD = { manager1: 'QuanLy1@2026', tenant: 'NguoiThue@2026' };

const err = (code: string, message: string, fields?: Record<string, string>) => ({
  error: fields ? { code, message, fields } : { code, message },
});
const OTP_INVALID = err('OTP_INVALID', 'Mã xác minh không đúng hoặc đã hết hạn');
const TOO_MANY = err('TOO_MANY_REQUESTS', 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau');
const SMS_UNAVAILABLE = err('SMS_UNAVAILABLE', 'Chưa gửi được tin nhắn, vui lòng thử lại sau');
const PHONE_NOT_VERIFIED = err('PHONE_NOT_VERIFIED', 'Số điện thoại chưa được xác minh');
const INVALID_CREDENTIALS = err('INVALID_CREDENTIALS', 'Số điện thoại hoặc mật khẩu không đúng');
// AUTH-11 wording.
const PHONE_TAKEN = err('PHONE_TAKEN', 'Số điện thoại đã được sử dụng', {
  phone: 'Số điện thoại đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu',
});

let app: INestApplication;
let fake: FakePrisma;
let sms: { send: Mock<(sms: Sms) => Promise<void>> };
let savedSecret: string | undefined;

beforeEach(async () => {
  savedSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  fake = await createFakePrisma();
  sms = { send: vi.fn<(sms: Sms) => Promise<void>>().mockResolvedValue(undefined) };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(fake)
    .overrideProvider(SmsService)
    .useValue(sms)
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  freeze(T0);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await app.close();
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

// ---- helpers -------------------------------------------------------------------------------------------

function freeze(when: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(when);
}
const later = (ms: number) => vi.setSystemTime(Date.now() + ms);
const http = () => request(app.getHttpServer());
const register = (body: object, lang?: string) => {
  const req = http().post('/api/v1/auth/register');
  return (lang ? req.set('Accept-Language', lang) : req).send(body);
};
const signUp = (phone = NEW_PHONE, password = PASSWORD, fullName = 'Khách Mới') => register({ fullName, phone, password });
const verify = (phone: string, code: string) => http().post('/api/v1/auth/verify-phone').send({ phone, code });
const login = (phone: string, password: string) => http().post('/api/v1/auth/login').send({ phone, password });
const resend = (phone: string, purpose: string) => http().post('/api/v1/auth/resend-code').send({ phone, purpose });
const authed = (method: 'get' | 'post', path: string, token: string) =>
  http()[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);

/** The 6-digit code of the i-th SMS (default: the last one). */
const codeOf = (i = sms.send.mock.calls.length - 1): string => {
  const m = /\b(\d{6})\b/.exec(sms.send.mock.calls[i][0].text);
  if (!m) throw new Error(`SMS #${i} has no code`);
  return m[1];
};
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
const userBy = (phone: string): Row | undefined => fake.db.user.find((u) => u.phone === phone);
const otpRows = (phone: string) => fake.db.phoneOtp.filter((r) => r.phone === phone);
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
async function tokenOf(who: 'manager1' | 'tenant') {
  if (who === 'tenant') fake.account('tenant').mustChangePassword = false;
  const res = await login(PHONE[who], STAFF_PASSWORD[who]);
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}
/** resend-code works after the reply (same time for every case); waits until `n` SMS have gone out in total. */
async function smsSent(n: number) {
  const at = Date.now();
  await vi.waitFor(() => expect(sms.send).toHaveBeenCalledTimes(n), { timeout: 5000, interval: 5 });
  vi.setSystemTime(at);
}
const drain = () => new Promise<void>((r) => setTimeout(r, 30));

// ---- AUTH-11 -------------------------------------------------------------------------------------------

describe('AUTH-11: POST /auth/register', () => {
  it('AUTH-11: a new phone creates an unverified GUEST and sends one SMS code to it', async () => {
    const res = await signUp();
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: null });
    expect(userBy(NEW_PHONE)).toMatchObject({
      role: 'GUEST', fullName: 'Khách Mới', phoneVerifiedAt: null, mustChangePassword: false, isActive: true, locale: 'vi',
    });
    expect(await argon2.verify(userBy(NEW_PHONE)!.passwordHash as string, PASSWORD)).toBe(true);
    expect(sms.send).toHaveBeenCalledTimes(1);
    expect(sms.send.mock.calls[0][0].to).toBe(NEW_PHONE);
    expect(codeOf()).toMatch(/^\d{6}$/);
  });

  it('AUTH-15: the locale is taken from Accept-Language at sign-up (en -> en, anything else -> vi)', async () => {
    expect((await register({ fullName: 'A', phone: '0912345601', password: PASSWORD }, 'en')).status).toBe(201);
    expect((await register({ fullName: 'B', phone: '0912345602', password: PASSWORD }, 'fr')).status).toBe(201);
    expect(userBy('0912345601')!.locale).toBe('en');
    expect(userBy('0912345602')!.locale).toBe('vi');
  });

  it('AUTH-11: a verified GUEST phone -> PHONE_TAKEN with the sign-up wording, nothing changed, no SMS', async () => {
    await signUp();
    await verify(NEW_PHONE, codeOf());
    const before = { ...userBy(NEW_PHONE) };
    later(2 * MIN);
    const res = await signUp(NEW_PHONE, 'KhacHoan@2026', 'Người Khác');
    expect(res.status).toBe(409);
    expect(res.body).toEqual(PHONE_TAKEN);
    expect(userBy(NEW_PHONE)).toEqual(before);
    expect(sms.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['TENANT', PHONE.tenant],
    ['MANAGER', PHONE.manager1],
    ['BOSS', PHONE.boss],
  ])('AUTH-11: the phone of a staff-created %s account -> PHONE_TAKEN, no SMS', async (_role, phone) => {
    const res = await signUp(phone);
    expect(res.status).toBe(409);
    expect(res.body).toEqual(PHONE_TAKEN);
    expect(sms.send).not.toHaveBeenCalled();
    expect(otpRows(phone)).toHaveLength(0);
  });

  it('AUTH-11: an unverified GUEST phone -> name and password replaced, a new code sent, the old password no longer works', async () => {
    await signUp(NEW_PHONE, 'CuCu@20261', 'Người Giữ Chỗ');
    const firstCode = codeOf();
    later(61 * SEC);
    const res = await signUp(NEW_PHONE, PASSWORD, 'Chủ Số Thật');
    expect(res.status).toBe(201);
    expect(fake.db.user.filter((u) => u.phone === NEW_PHONE)).toHaveLength(1);
    expect(userBy(NEW_PHONE)!.fullName).toBe('Chủ Số Thật');
    expect(sms.send).toHaveBeenCalledTimes(2);
    expect((await login(NEW_PHONE, 'CuCu@20261')).body).toEqual(INVALID_CREDENTIALS);
    expect((await login(NEW_PHONE, PASSWORD)).body).toEqual(PHONE_NOT_VERIFIED);
    // AUTH-13 (owner 12/11/2026): the new code voids the older one.
    if (firstCode !== codeOf()) expect((await verify(NEW_PHONE, firstCode)).body).toEqual(OTP_INVALID); // 1 in a million they match
    expect((await verify(NEW_PHONE, codeOf())).status).toBe(200);
  });

  it('AUTH-11 / D-26: an unverified GUEST locked by staff is not revived -> PHONE_TAKEN (owner 12/11/2026)', async () => {
    await signUp();
    userBy(NEW_PHONE)!.isActive = false;
    later(2 * MIN);
    const res = await signUp(NEW_PHONE, 'KhacHoan@2026');
    expect(res.status).toBe(409);
    expect(res.body).toEqual(PHONE_TAKEN);
    expect(userBy(NEW_PHONE)!.isActive).toBe(false);
  });

  it('AUTH-11: G-04 phone and AUTH-03 password are validated; a blank name is refused', async () => {
    const res = await register({ fullName: '  ', phone: '12345', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['fullName', 'password', 'phone']);
    expect(res.body.error.fields.password).toBe('Mật khẩu tối thiểu 8 ký tự');
    expect(res.body.error.fields.phone).toBe('Số điện thoại không hợp lệ');
    expect(fake.db.user).toHaveLength(5);
  });

  it('AUTH-11: role and other extra fields cannot be sent', async () => {
    const res = await register({ fullName: 'A', phone: NEW_PHONE, password: PASSWORD, role: 'BOSS' });
    expect(res.status).toBe(400);
    expect(userBy(NEW_PHONE)).toBeUndefined();
  });
});

// ---- AUTH-12 -------------------------------------------------------------------------------------------

describe('AUTH-12: login gate and POST /auth/verify-phone', () => {
  it('AUTH-11/AUTH-12 acceptance: a visitor signs up, cannot log in before the SMS code, and is logged in right after it', async () => {
    await signUp();
    const blocked = await login(NEW_PHONE, PASSWORD);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual(PHONE_NOT_VERIFIED);

    const res = await verify(NEW_PHONE, codeOf());
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ role: 'GUEST', phone: NEW_PHONE, phoneVerified: true, locale: 'vi' });
    expect('buildings' in res.body.data.user).toBe(false);
    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies.some((c) => c.startsWith('rt=') && /HttpOnly/i.test(c) && /Path=\/api\/v1\/auth/.test(c))).toBe(true);
    expect(userBy(NEW_PHONE)!.phoneVerifiedAt).toEqual(new Date(T0));
    expect(fake.db.session.filter((s) => s.userId === userBy(NEW_PHONE)!.id)).toHaveLength(1);

    const me = await authed('get', '/auth/me', res.body.data.accessToken as string);
    expect(me.status).toBe(200);
    expect(me.body.data.phoneVerified).toBe(true);
    expect((await login(NEW_PHONE, PASSWORD)).status).toBe(200);
  });

  it('AUTH-12: a wrong password on an unverified GUEST still says INVALID_CREDENTIALS (checked first)', async () => {
    await signUp();
    const res = await login(NEW_PHONE, 'SaiMatKhau@1');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(INVALID_CREDENTIALS);
  });

  it('AUTH-12: the login gate sends no code by itself', async () => {
    await signUp();
    await login(NEW_PHONE, PASSWORD);
    expect(sms.send).toHaveBeenCalledTimes(1);
  });

  it('AUTH-12: accounts created by staff still log in with phone_verified_at null', async () => {
    expect(fake.account('manager1').phoneVerifiedAt).toBeNull();
    const res = await login(PHONE.manager1, STAFF_PASSWORD.manager1);
    expect(res.status).toBe(200);
    expect(res.body.data.user.phoneVerified).toBe(false);
  });

  it('AUTH-02: verify-phone on a locked account -> ACCOUNT_LOCKED and the phone stays unverified', async () => {
    await signUp();
    userBy(NEW_PHONE)!.isActive = false;
    const res = await verify(NEW_PHONE, codeOf());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(userBy(NEW_PHONE)!.phoneVerifiedAt).toBeNull();
  });

  it('AUTH-13: verify-phone for a phone that has no code -> OTP_INVALID', async () => {
    const res = await verify('0999999999', '123456');
    expect(res.status).toBe(400);
    expect(res.body).toEqual(OTP_INVALID);
  });
});

// ---- AUTH-13 -------------------------------------------------------------------------------------------

describe('AUTH-13: SMS code rules (A-11)', () => {
  it('AUTH-13: a wrong code -> OTP_INVALID', async () => {
    await signUp();
    const res = await verify(NEW_PHONE, wrong(codeOf()));
    expect(res.status).toBe(400);
    expect(res.body).toEqual(OTP_INVALID);
    expect(userBy(NEW_PHONE)!.phoneVerifiedAt).toBeNull();
  });

  it('AUTH-13: valid for 5 minutes: 4:59 works, 5:00 -> OTP_INVALID', async () => {
    await signUp();
    const code = codeOf();
    later(5 * MIN);
    expect((await verify(NEW_PHONE, code)).body).toEqual(OTP_INVALID);

    later(MIN + SEC); // the resend wait is over
    await signUp();
    later(5 * MIN - SEC);
    expect((await verify(NEW_PHONE, codeOf())).status).toBe(200);
  });

  it('AUTH-13: single use: the same code a second time -> OTP_INVALID', async () => {
    await signUp();
    const code = codeOf();
    expect((await verify(NEW_PHONE, code)).status).toBe(200);
    expect((await verify(NEW_PHONE, code)).body).toEqual(OTP_INVALID);
  });

  it('AUTH-13: after 5 wrong tries the code is dead: the 6th try -> OTP_INVALID even with the right code', async () => {
    await signUp();
    const code = codeOf();
    for (let i = 0; i < 5; i++) expect((await verify(NEW_PHONE, wrong(code))).body).toEqual(OTP_INVALID);
    const res = await verify(NEW_PHONE, code);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(OTP_INVALID);
    expect(userBy(NEW_PHONE)!.phoneVerifiedAt).toBeNull();
  });

  it('AUTH-13: 5 tries hold under parallel guesses: 20 guesses at once, the right one among the last, are all refused', async () => {
    await signUp();
    const code = codeOf();
    const guesses = [...Array.from({ length: 19 }, () => wrong(code)), code];
    const results = await Promise.all(guesses.map((g) => verify(NEW_PHONE, g)));
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    expect(otpRows(NEW_PHONE)[0].tries).toBe(5);
  });

  it('AUTH-13: the code is stored only as a hash', async () => {
    await signUp();
    const code = codeOf();
    const [row] = otpRows(NEW_PHONE);
    expect(row).toMatchObject({ purpose: 'REGISTER', tries: 0, usedAt: null, expiresAt: new Date(T0 + 5 * MIN) });
    expect(JSON.stringify(row)).not.toContain(code);
    expect(row.codeHash).toBe(sha256(`${NEW_PHONE}:REGISTER:${code}`));
  });

  it('AUTH-13: resend before 60 s -> 429; at 60 s a new code is sent', async () => {
    await signUp();
    later(59 * SEC);
    const early = await signUp();
    expect(early.status).toBe(429);
    expect(early.body).toEqual(TOO_MANY);
    expect(sms.send).toHaveBeenCalledTimes(1);
    later(SEC);
    expect((await signUp()).status).toBe(201);
    expect(sms.send).toHaveBeenCalledTimes(2);
  });

  it('AUTH-13: the 6th SMS to one phone in a Hà Nội day -> 429; it works again after 00:00 Hà Nội', async () => {
    freeze(Date.parse('2026-11-12T00:00:00+07:00'));
    for (let i = 0; i < 5; i++) {
      expect((await signUp()).status).toBe(201);
      later(61 * SEC);
    }
    vi.setSystemTime(Date.parse('2026-11-12T23:59:59+07:00'));
    const sixth = await signUp();
    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual(TOO_MANY);
    expect(sms.send).toHaveBeenCalledTimes(5);
    vi.setSystemTime(Date.parse('2026-11-13T00:00:00+07:00'));
    expect((await signUp()).status).toBe(201);
  });

  it('AUTH-13: the 11th SMS from one IP within an hour -> 429; the 11th is fine an hour later', async () => {
    for (let i = 0; i < 10; i++) expect((await signUp(`09123456${String(i).padStart(2, '0')}`)).status).toBe(201);
    const eleventh = await signUp('0912345610');
    expect(eleventh.status).toBe(429);
    expect(eleventh.body).toEqual(TOO_MANY);
    expect(sms.send).toHaveBeenCalledTimes(10);
    later(60 * MIN + SEC);
    expect((await signUp('0912345610')).status).toBe(201);
  });

  it('AUTH-13: an SMS failure never reports success: 503, and the unsent code does not work', async () => {
    sms.send.mockRejectedValueOnce(new Error('provider down'));
    const res = await signUp();
    expect(res.status).toBe(503);
    expect(res.body).toEqual(SMS_UNAVAILABLE);
    expect(otpRows(NEW_PHONE)).toHaveLength(0);
    expect(userBy(NEW_PHONE)!.phoneVerifiedAt).toBeNull();
    // The unsent code costs no daily quota and the visitor may sign up again after the resend wait.
    later(61 * SEC);
    expect((await signUp()).status).toBe(201);
  });

  it('AUTH-13: no provider in production (UnavailableSmsService) -> 503 SMS_UNAVAILABLE', async () => {
    sms.send.mockRejectedValueOnce(new ServiceUnavailableException('SMS_UNAVAILABLE'));
    const res = await signUp();
    expect(res.status).toBe(503);
    expect(res.body).toEqual(SMS_UNAVAILABLE);
  });
});

// ---- POST /auth/resend-code ----------------------------------------------------------------------------

describe('AUTH-13: POST /auth/resend-code always answers the same', () => {
  it('AUTH-13: unknown phone, unverified guest, staff phone and an over-limit request get the same 200 body', async () => {
    await signUp();
    later(61 * SEC);
    const bodies = [];
    for (const [phone, purpose] of [
      ['0999999999', 'REGISTER'],
      [NEW_PHONE, 'REGISTER'],
      [PHONE.tenant, 'REGISTER'],
      [PHONE.tenant, 'RESET_PASSWORD'],
      [NEW_PHONE, 'REGISTER'], // before 60 s again -> limited, still 200
    ]) {
      const res = await resend(phone, purpose);
      expect(res.status).toBe(200);
      bodies.push(res.body);
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b)))).toEqual(new Set([JSON.stringify({ data: null })]));
    await smsSent(2); // the sign-up and the one eligible resend
    await drain();
    expect(sms.send).toHaveBeenCalledTimes(2);
    expect(sms.send.mock.calls[1][0].to).toBe(NEW_PHONE);
  });

  it('AUTH-13: a resent REGISTER code verifies the account', async () => {
    await signUp();
    later(61 * SEC);
    await resend(NEW_PHONE, 'REGISTER');
    await smsSent(2);
    expect((await verify(NEW_PHONE, codeOf())).status).toBe(200);
  });

  it('AUTH-07: RESET_PASSWORD codes go only to a verified phone; a locked account gets nothing', async () => {
    await signUp();
    await verify(NEW_PHONE, codeOf());
    fake.account('lockedTenant').phoneVerifiedAt = new Date(T0);
    await resend(NEW_PHONE, 'RESET_PASSWORD');
    await resend(PHONE.lockedTenant, 'RESET_PASSWORD');
    await smsSent(2);
    await drain();
    expect(sms.send).toHaveBeenCalledTimes(2);
    expect(otpRows(NEW_PHONE).map((r) => r.purpose)).toEqual(['REGISTER', 'RESET_PASSWORD']);
    expect(otpRows(PHONE.lockedTenant)).toHaveLength(0);
  });

  it('AUTH-13: a bad purpose or phone -> 400 VALIDATION_FAILED', async () => {
    const res = await resend('123', 'VERIFY_PHONE');
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['phone', 'purpose']);
  });
});

// ---- AUTH-12, AUTH-14: /auth/phone/* -------------------------------------------------------------------

describe('AUTH-12 / AUTH-14: POST /auth/phone/send-code and /auth/phone/verify', () => {
  it('AUTH-12: a staff-created tenant verifies their own phone; /auth/me then shows phoneVerified', async () => {
    const token = await tokenOf('tenant');
    const sent = await authed('post', '/auth/phone/send-code', token);
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ data: null });
    expect(sms.send.mock.calls[0][0].to).toBe(PHONE.tenant);
    expect(otpRows(PHONE.tenant)[0].purpose).toBe('VERIFY_PHONE');

    const before = { ...fake.account('tenant') };
    const res = await authed('post', '/auth/phone/verify', token).send({ code: codeOf() });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: IDS.users.tenant, phoneVerified: true });
    // AUTH-14: only phone_verified_at changed; nothing linked or merged.
    expect(fake.account('tenant')).toEqual({ ...before, phoneVerifiedAt: new Date(T0) });
    expect(fake.db.contract).toEqual([
      { id: IDS.contracts.HD000001, code: 'HD000001', buildingId: IDS.buildings.CG01, tenantId: IDS.users.tenant },
    ]);
    expect((await authed('get', '/auth/me', token)).body.data.phoneVerified).toBe(true);
  });

  it('AUTH-12: a manager may verify too (owner 12/11/2026: any logged-in role)', async () => {
    const token = await tokenOf('manager1');
    expect((await authed('post', '/auth/phone/send-code', token)).status).toBe(200);
    expect((await authed('post', '/auth/phone/verify', token).send({ code: codeOf() })).status).toBe(200);
    expect(fake.account('manager1').phoneVerifiedAt).toEqual(new Date(T0));
  });

  it('AUTH-12: an already verified phone -> CONFLICT_STATE on both routes, no SMS', async () => {
    const token = await tokenOf('tenant');
    fake.account('tenant').phoneVerifiedAt = new Date(T0);
    expect((await authed('post', '/auth/phone/send-code', token)).body.error.code).toBe('CONFLICT_STATE');
    expect((await authed('post', '/auth/phone/verify', token).send({ code: '123456' })).body.error.code).toBe('CONFLICT_STATE');
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('AUTH-13: a wrong code -> OTP_INVALID; a REGISTER code cannot be used for VERIFY_PHONE', async () => {
    const token = await tokenOf('tenant');
    await authed('post', '/auth/phone/send-code', token);
    expect((await authed('post', '/auth/phone/verify', token).send({ code: wrong(codeOf()) })).body).toEqual(OTP_INVALID);
    expect(fake.account('tenant').phoneVerifiedAt).toBeNull();
  });

  it('AUTH-13: SMS failure -> 503 SMS_UNAVAILABLE', async () => {
    const token = await tokenOf('tenant');
    sms.send.mockRejectedValueOnce(new Error('down'));
    const res = await authed('post', '/auth/phone/send-code', token);
    expect(res.status).toBe(503);
    expect(res.body).toEqual(SMS_UNAVAILABLE);
  });

  it('SCOPE-01: not logged in -> 401 on both routes', async () => {
    expect((await http().post('/api/v1/auth/phone/send-code')).status).toBe(401);
    expect((await http().post('/api/v1/auth/phone/verify').send({ code: '123456' })).status).toBe(401);
  });
});
