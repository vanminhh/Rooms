import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { createFakePrisma, type FakePrisma, type Row } from '../../../test/fixtures/fake-prisma.js';
import { type Mail, MailerService } from '../mailer/mailer.service.js';

// BE-EX-34, BE-EX-35: sign-up with phone + email + password, the email code, email verification (AUTH-11..14, A-11).
// Outside edges replaced: PrismaService -> in-memory fake (the DB), MailerService -> vi.fn spy (the mail provider),
// the clock -> vi.useFakeTimers({ toFake: ['Date'] }). Everything else is the real AppModule.
// Expected values come from docs/spec/10-auth.md (AUTH-11..14), 00-overview A-11 and 01-architecture#error-codes;
// the EMAIL_NOT_VERIFIED / OTP_INVALID / MAIL_UNAVAILABLE wording is the [ASSUMPTION] of BE-EX-34.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SECRET = 'auth-signup-spec-secret-0123456789abc-01';
const SEC = 1000;
const MIN = 60 * SEC;
// 10:00 Hà Nội on 12/11/2026.
const T0 = Date.parse('2026-11-12T10:00:00+07:00');

const NEW_PHONE = '0912345678';
const NEW_EMAIL = 'khach.moi@example.com';
const PASSWORD = 'MatKhau@2026';
const PHONE = { boss: '0900000001', manager1: '0900000002', tenant: '0900000004', lockedTenant: '0900000005' };
const STAFF_PASSWORD = { manager1: 'QuanLy1@2026' };

const err = (code: string, message: string, fields?: Record<string, string>) => ({
  error: fields ? { code, message, fields } : { code, message },
});
const OTP_INVALID = err('OTP_INVALID', 'Mã xác minh không đúng hoặc đã hết hạn');
const TOO_MANY = err('TOO_MANY_REQUESTS', 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau');
const MAIL_UNAVAILABLE = err('MAIL_UNAVAILABLE', 'Chưa gửi được email, vui lòng thử lại sau');
const EMAIL_NOT_VERIFIED = err('EMAIL_NOT_VERIFIED', 'Email chưa được xác minh');
const INVALID_CREDENTIALS = err('INVALID_CREDENTIALS', 'Số điện thoại hoặc mật khẩu không đúng');
// AUTH-11 wording.
const PHONE_TAKEN = err('PHONE_TAKEN', 'Số điện thoại đã được sử dụng', {
  phone: 'Số điện thoại đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu',
});
const EMAIL_TAKEN = err('EMAIL_TAKEN', 'Email đã được dùng cho tài khoản khác', {
  email: 'Email đã được dùng cho tài khoản khác',
});

let app: INestApplication;
let fake: FakePrisma;
let mailer: { send: Mock<(mail: Mail) => Promise<void>> };
let savedSecret: string | undefined;

beforeEach(async () => {
  savedSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  fake = await createFakePrisma();
  mailer = { send: vi.fn<(mail: Mail) => Promise<void>>().mockResolvedValue(undefined) };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(fake)
    .overrideProvider(MailerService)
    .useValue(mailer)
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
const signUp = (phone = NEW_PHONE, email = NEW_EMAIL, password = PASSWORD, fullName = 'Khách Mới') =>
  register({ fullName, phone, email, password });
const verify = (phone: string, code: string) => http().post('/api/v1/auth/verify-email').send({ phone, code });
const login = (phone: string, password: string) => http().post('/api/v1/auth/login').send({ phone, password });
const resend = (phone: string) => http().post('/api/v1/auth/resend-code').send({ phone });

/** The 6-digit code of the i-th mail (default: the last one). */
const codeOf = (i = mailer.send.mock.calls.length - 1): string => {
  const m = /Mã xác minh của bạn: (\d{6})\b/.exec(mailer.send.mock.calls[i][0].text);
  if (!m) throw new Error(`mail #${i} has no code`);
  return m[1];
};
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
const userBy = (phone: string): Row | undefined => fake.db.user.find((u) => u.phone === phone);
const otpRows = (email: string) => fake.db.emailOtp.filter((r) => r.email === email);
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex'); // independent of the code under test
/** A guest that signed up and verified, so its phone and email are taken. */
async function verifiedGuest(phone = NEW_PHONE, email = NEW_EMAIL) {
  expect((await signUp(phone, email)).status).toBe(201);
  expect((await verify(phone, codeOf())).status).toBe(200);
  later(2 * MIN);
}
/** resend-code works after the reply (same time for every case); waits until `n` mails have gone out in total. */
async function mailsSent(n: number) {
  const at = Date.now();
  await vi.waitFor(() => expect(mailer.send).toHaveBeenCalledTimes(n), { timeout: 5000, interval: 5 });
  vi.setSystemTime(at);
}
const drain = () => new Promise<void>((r) => setTimeout(r, 30));

// ---- AUTH-11 -------------------------------------------------------------------------------------------

describe('AUTH-11: POST /auth/register', () => {
  it('AUTH-11: a new phone and email create an unverified GUEST and mail one code to the lowercase address', async () => {
    const res = await signUp(NEW_PHONE, 'Khach.Moi@Example.com');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: null });
    expect(userBy(NEW_PHONE)).toMatchObject({
      role: 'GUEST', fullName: 'Khách Mới', email: NEW_EMAIL, emailVerifiedAt: null,
      mustChangePassword: false, isActive: true, locale: 'vi',
    });
    expect(await argon2.verify(userBy(NEW_PHONE)!.passwordHash as string, PASSWORD)).toBe(true);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.send.mock.calls[0][0].to).toBe(NEW_EMAIL);
    expect(codeOf()).toMatch(/^\d{6}$/);
  });

  it('AUTH-15: the locale is taken from Accept-Language at sign-up (en -> en, anything else -> vi)', async () => {
    expect((await register({ fullName: 'A', phone: '0912345601', email: 'a@example.com', password: PASSWORD }, 'en')).status).toBe(201);
    expect((await register({ fullName: 'B', phone: '0912345602', email: 'b@example.com', password: PASSWORD }, 'fr')).status).toBe(201);
    expect(userBy('0912345601')!.locale).toBe('en');
    expect(userBy('0912345602')!.locale).toBe('vi');
  });

  it('AUTH-11: a verified GUEST phone -> PHONE_TAKEN with the sign-up wording, nothing changed, no mail', async () => {
    await verifiedGuest();
    const before = { ...userBy(NEW_PHONE) };
    const res = await signUp(NEW_PHONE, 'khac@example.com', 'KhacHoan@2026', 'Người Khác');
    expect(res.status).toBe(409);
    expect(res.body).toEqual(PHONE_TAKEN);
    expect(userBy(NEW_PHONE)).toEqual(before);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['TENANT', PHONE.tenant],
    ['MANAGER', PHONE.manager1],
    ['BOSS', PHONE.boss],
  ])('AUTH-11: the phone of a staff-created %s account -> PHONE_TAKEN, no mail', async (_role, phone) => {
    const res = await signUp(phone);
    expect(res.status).toBe(409);
    expect(res.body).toEqual(PHONE_TAKEN);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(otpRows(NEW_EMAIL)).toHaveLength(0);
  });

  it('AUTH-11: the email of a verified guest on another phone -> EMAIL_TAKEN, also when typed in capitals', async () => {
    await verifiedGuest();
    const res = await signUp('0912345699', 'KHACH.MOI@Example.com');
    expect(res.status).toBe(409);
    expect(res.body).toEqual(EMAIL_TAKEN);
    expect(userBy('0912345699')).toBeUndefined();
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it('AUTH-11: the email of a staff-created account -> EMAIL_TAKEN, and that account is untouched', async () => {
    fake.account('manager1').email = 'ha@example.com';
    const before = { ...fake.account('manager1') };
    const res = await signUp('0912345699', 'ha@example.com');
    expect(res.status).toBe(409);
    expect(res.body).toEqual(EMAIL_TAKEN);
    expect(fake.account('manager1')).toEqual(before);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('AUTH-11: an unverified GUEST phone -> name, email and password replaced, a new code sent, the old password and old code are dead', async () => {
    await signUp(NEW_PHONE, 'cu@example.com', 'CuCu@20261', 'Người Giữ Chỗ');
    const firstCode = codeOf();
    const res = await signUp(NEW_PHONE, NEW_EMAIL, PASSWORD, 'Chủ Số Thật');
    expect(res.status).toBe(201);
    expect(fake.db.user.filter((u) => u.phone === NEW_PHONE)).toHaveLength(1);
    expect(userBy(NEW_PHONE)).toMatchObject({ fullName: 'Chủ Số Thật', email: NEW_EMAIL });
    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(mailer.send.mock.calls[1][0].to).toBe(NEW_EMAIL);
    expect((await login(NEW_PHONE, 'CuCu@20261')).body).toEqual(INVALID_CREDENTIALS);
    expect((await login(NEW_PHONE, PASSWORD)).body).toEqual(EMAIL_NOT_VERIFIED);
    // The code mailed to the old address no longer opens this account (1 in a million it equals the new code).
    if (firstCode !== codeOf()) expect((await verify(NEW_PHONE, firstCode)).body).toEqual(OTP_INVALID);
    expect((await verify(NEW_PHONE, codeOf())).status).toBe(200);
  });

  it('AUTH-11: an unverified GUEST email on another phone -> that account is replaced, phone included', async () => {
    await signUp('0912345600', NEW_EMAIL, 'CuCu@20261', 'Người Giữ Chỗ');
    later(61 * SEC);
    const res = await signUp(NEW_PHONE, NEW_EMAIL, PASSWORD, 'Chủ Email Thật');
    expect(res.status).toBe(201);
    expect(userBy('0912345600')).toBeUndefined();
    expect(fake.db.user.filter((u) => u.email === NEW_EMAIL)).toHaveLength(1);
    expect(userBy(NEW_PHONE)).toMatchObject({ fullName: 'Chủ Email Thật', role: 'GUEST', emailVerifiedAt: null });
    expect(otpRows(NEW_EMAIL).filter((r) => r.usedAt === null)).toHaveLength(1);
  });

  it('AUTH-11 (owner 12/11/2026): the phone of one unverified guest and the email of another are never merged -> EMAIL_TAKEN', async () => {
    await signUp('0912345600', 'a@example.com', PASSWORD, 'Khách A');
    await signUp('0912345601', 'b@example.com', PASSWORD, 'Khách B');
    const before = fake.db.user.map((u) => ({ ...u }));
    later(61 * SEC);
    const res = await signUp('0912345600', 'b@example.com');
    expect(res.status).toBe(409);
    expect(res.body).toEqual(EMAIL_TAKEN);
    expect(fake.db.user).toEqual(before);
    expect(mailer.send).toHaveBeenCalledTimes(2);
  });

  it('AUTH-11 / D-26: an unverified GUEST locked by staff is not revived, by phone (PHONE_TAKEN) or by email (EMAIL_TAKEN)', async () => {
    await signUp();
    userBy(NEW_PHONE)!.isActive = false;
    later(2 * MIN);
    const byPhone = await signUp(NEW_PHONE, 'khac@example.com', 'KhacHoan@2026');
    expect(byPhone.status).toBe(409);
    expect(byPhone.body).toEqual(PHONE_TAKEN);
    const byEmail = await signUp('0912345699', NEW_EMAIL);
    expect(byEmail.status).toBe(409);
    expect(byEmail.body).toEqual(EMAIL_TAKEN);
    expect(userBy(NEW_PHONE)).toMatchObject({ isActive: false, email: NEW_EMAIL });
  });

  it('AUTH-11: G-04 phone, email format and AUTH-03 password are validated; a blank name is refused', async () => {
    const res = await register({ fullName: '  ', phone: '12345', email: 'khong-phai-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'fullName', 'password', 'phone']);
    expect(res.body.error.fields.password).toBe('Mật khẩu tối thiểu 8 ký tự');
    expect(res.body.error.fields.phone).toBe('Số điện thoại không hợp lệ');
    expect(res.body.error.fields.email).toBe('Email không hợp lệ');
    expect(fake.db.user).toHaveLength(6);
  });

  it('AUTH-11: the email is required', async () => {
    const res = await register({ fullName: 'A', phone: NEW_PHONE, password: PASSWORD });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields)).toEqual(['email']);
  });

  it('AUTH-11: role and other extra fields cannot be sent', async () => {
    const res = await register({ fullName: 'A', phone: NEW_PHONE, email: NEW_EMAIL, password: PASSWORD, role: 'BOSS' });
    expect(res.status).toBe(400);
    expect(userBy(NEW_PHONE)).toBeUndefined();
  });
});

// ---- AUTH-12 -------------------------------------------------------------------------------------------

describe('AUTH-12: login gate and POST /auth/verify-email', () => {
  it('AUTH-11/AUTH-12 acceptance: a visitor signs up, cannot log in before the email code, and is logged in right after it', async () => {
    await signUp();
    const blocked = await login(NEW_PHONE, PASSWORD);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual(EMAIL_NOT_VERIFIED);

    const res = await verify(NEW_PHONE, codeOf());
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({
      role: 'GUEST', phone: NEW_PHONE, email: NEW_EMAIL, emailVerified: true, locale: 'vi',
    });
    expect('buildings' in res.body.data.user).toBe(false);
    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies.some((c) => c.startsWith('rt=') && /HttpOnly/i.test(c) && /Path=\/api\/v1\/auth/.test(c))).toBe(true);
    expect(userBy(NEW_PHONE)!.emailVerifiedAt).toEqual(new Date(T0));
    expect(fake.db.session.filter((s) => s.userId === userBy(NEW_PHONE)!.id)).toHaveLength(1);

    const me = await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken as string}`);
    expect(me.status).toBe(200);
    expect(me.body.data.emailVerified).toBe(true);
    expect((await login(NEW_PHONE, PASSWORD)).status).toBe(200);
  });

  it('AUTH-14: verifying changes only email_verified_at and the login time; nothing is linked or merged', async () => {
    await signUp();
    const before = { ...userBy(NEW_PHONE) };
    await verify(NEW_PHONE, codeOf());
    expect(userBy(NEW_PHONE)).toEqual({ ...before, emailVerifiedAt: new Date(T0), lastLoginAt: new Date(T0) });
    expect(fake.db.user).toHaveLength(7);
    expect(fake.db.contract).toHaveLength(1);
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
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it('AUTH-12: accounts created by staff log in with email_verified_at null', async () => {
    expect(fake.account('manager1').emailVerifiedAt).toBeNull();
    const res = await login(PHONE.manager1, STAFF_PASSWORD.manager1);
    expect(res.status).toBe(200);
    expect(res.body.data.user.emailVerified).toBe(false);
  });

  it('AUTH-02: verify-email on a locked account -> ACCOUNT_LOCKED and the email stays unverified', async () => {
    await signUp();
    userBy(NEW_PHONE)!.isActive = false;
    const res = await verify(NEW_PHONE, codeOf());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(userBy(NEW_PHONE)!.emailVerifiedAt).toBeNull();
  });

  it('AUTH-13: verify-email with no account, a staff phone or an already verified guest -> OTP_INVALID, no code is touched', async () => {
    await verifiedGuest();
    const triesBefore = otpRows(NEW_EMAIL).map((r) => r.tries);
    for (const phone of ['0999999999', PHONE.tenant, NEW_PHONE]) {
      const res = await verify(phone, '123456');
      expect(res.status).toBe(400);
      expect(res.body).toEqual(OTP_INVALID);
    }
    expect(otpRows(NEW_EMAIL).map((r) => r.tries)).toEqual(triesBefore);
  });

  it('AUTH-13: removed routes: /auth/phone/send-code and /auth/phone/verify no longer exist (BE-EX-35)', async () => {
    expect((await http().post('/api/v1/auth/phone/send-code')).status).toBe(404);
    expect((await http().post('/api/v1/auth/phone/verify').send({ code: '123456' })).status).toBe(404);
    expect((await http().post('/api/v1/auth/verify-phone').send({ phone: NEW_PHONE, code: '123456' })).status).toBe(404);
  });
});

// ---- AUTH-13 -------------------------------------------------------------------------------------------

describe('AUTH-13: email code rules (A-11)', () => {
  it('AUTH-13: a wrong code -> OTP_INVALID', async () => {
    await signUp();
    const res = await verify(NEW_PHONE, wrong(codeOf()));
    expect(res.status).toBe(400);
    expect(res.body).toEqual(OTP_INVALID);
    expect(userBy(NEW_PHONE)!.emailVerifiedAt).toBeNull();
  });

  it('AUTH-13: valid for 5 minutes: 5:00 -> OTP_INVALID, 4:59 works', async () => {
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
    expect(userBy(NEW_PHONE)!.emailVerifiedAt).toBeNull();
  });

  it('AUTH-13: 5 tries hold under parallel guesses: 20 guesses at once, the right one among them, use at most 5 tries', async () => {
    await signUp();
    const code = codeOf();
    const guesses = [...Array.from({ length: 19 }, () => wrong(code)), code];
    const results = await Promise.all(guesses.map((g) => verify(NEW_PHONE, g)));
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    expect(otpRows(NEW_EMAIL)[0].tries).toBe(5);
  });

  it('AUTH-13: the code is stored only as a hash', async () => {
    await signUp();
    const code = codeOf();
    const [row] = otpRows(NEW_EMAIL);
    expect(row).toMatchObject({ tries: 0, usedAt: null, expiresAt: new Date(T0 + 5 * MIN) });
    expect(JSON.stringify(row)).not.toContain(code);
    expect(row.codeHash).toBe(sha256(`${NEW_EMAIL}:${code}`));
  });

  it('AUTH-13: a code to the same address before 60 s -> 429; at 60 s a new code is sent and the old one is void', async () => {
    await signUp();
    const first = codeOf();
    later(59 * SEC);
    const early = await signUp();
    expect(early.status).toBe(429);
    expect(early.body).toEqual(TOO_MANY);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    later(SEC);
    expect((await signUp()).status).toBe(201);
    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(otpRows(NEW_EMAIL).filter((r) => r.usedAt === null)).toHaveLength(1);
    if (first !== codeOf()) expect((await verify(NEW_PHONE, first)).body).toEqual(OTP_INVALID);
  });

  it('AUTH-13: the 6th code to one address in a Hà Nội day -> 429; it works again after 00:00 Hà Nội', async () => {
    freeze(Date.parse('2026-11-12T00:00:00+07:00'));
    for (let i = 0; i < 5; i++) {
      expect((await signUp()).status).toBe(201);
      later(61 * SEC);
    }
    vi.setSystemTime(Date.parse('2026-11-12T23:59:59+07:00'));
    const sixth = await signUp();
    expect(sixth.status).toBe(429);
    expect(sixth.body).toEqual(TOO_MANY);
    expect(mailer.send).toHaveBeenCalledTimes(5);
    vi.setSystemTime(Date.parse('2026-11-13T00:00:00+07:00'));
    expect((await signUp()).status).toBe(201);
  });

  it('AUTH-13: the limit is per address: another address is not affected by the first one being at its limit', async () => {
    freeze(Date.parse('2026-11-12T00:00:00+07:00'));
    for (let i = 0; i < 5; i++) {
      await signUp();
      later(61 * SEC);
    }
    expect((await signUp('0912345611', 'khac@example.com')).status).toBe(201);
  });

  it('AUTH-13: the 11th code from one IP within an hour -> 429; it is fine an hour later', async () => {
    const one = (i: number) => signUp(`09123456${String(i).padStart(2, '0')}`, `khach${i}@example.com`);
    for (let i = 0; i < 10; i++) expect((await one(i)).status).toBe(201);
    const eleventh = await one(10);
    expect(eleventh.status).toBe(429);
    expect(eleventh.body).toEqual(TOO_MANY);
    expect(mailer.send).toHaveBeenCalledTimes(10);
    later(60 * MIN + SEC);
    expect((await one(10)).status).toBe(201);
  });

  it('AUTH-13: a mail failure never reports success: 503 MAIL_UNAVAILABLE, and the unsent code does not exist', async () => {
    mailer.send.mockRejectedValueOnce(new Error('provider down'));
    const res = await signUp();
    expect(res.status).toBe(503);
    expect(res.body).toEqual(MAIL_UNAVAILABLE);
    expect(otpRows(NEW_EMAIL)).toHaveLength(0);
    expect(userBy(NEW_PHONE)!.emailVerifiedAt).toBeNull();
    // The unsent code costs no daily quota and the visitor may sign up again at once.
    expect((await signUp()).status).toBe(201);
  });
});

// ---- POST /auth/resend-code ----------------------------------------------------------------------------

describe('AUTH-13: POST /auth/resend-code always answers the same', () => {
  it('AUTH-13: unknown phone, unverified guest, staff phone, locked guest and an over-limit request get the same 200 body', async () => {
    await signUp();
    await signUp('0912345602', 'khoa@example.com', PASSWORD, 'Khách Khóa');
    userBy('0912345602')!.isActive = false;
    later(61 * SEC);
    const bodies = [];
    for (const phone of ['0999999999', NEW_PHONE, PHONE.tenant, '0912345602', NEW_PHONE /* again before 60 s: limited */]) {
      const res = await resend(phone);
      expect(res.status).toBe(200);
      bodies.push(JSON.stringify(res.body));
    }
    expect(new Set(bodies)).toEqual(new Set([JSON.stringify({ data: null })]));
    await mailsSent(3); // two sign-ups and the one eligible resend
    await drain();
    expect(mailer.send).toHaveBeenCalledTimes(3);
    expect(mailer.send.mock.calls[2][0].to).toBe(NEW_EMAIL);
  });

  it('AUTH-13: a resent code verifies the account', async () => {
    await signUp();
    later(61 * SEC);
    await resend(NEW_PHONE);
    await mailsSent(2);
    expect((await verify(NEW_PHONE, codeOf())).status).toBe(200);
  });

  it('AUTH-13: a mail failure on resend is hidden from the reply: still 200', async () => {
    await signUp();
    later(61 * SEC);
    mailer.send.mockRejectedValueOnce(new Error('down'));
    const res = await resend(NEW_PHONE);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });
    await drain();
  });

  it('AUTH-13: a resend whose mail fails leaves the code already in the mailbox usable', async () => {
    await signUp();
    const mailed = codeOf();
    later(61 * SEC);
    mailer.send.mockRejectedValueOnce(new Error('down'));
    await resend(NEW_PHONE);
    await drain();
    // The unsent code is gone and the first one, still inside its 5 minutes, is the only unused code again.
    expect(otpRows(NEW_EMAIL)).toHaveLength(1);
    expect(otpRows(NEW_EMAIL)[0].usedAt).toBeNull();
    expect((await verify(NEW_PHONE, mailed)).status).toBe(200);
  });

  it('AUTH-13: a bad phone -> 400 VALIDATION_FAILED', async () => {
    const res = await resend('123');
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields)).toEqual(['phone']);
  });
});
