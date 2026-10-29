import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { createFakePrisma, type FakePrisma, IDS, type Row } from '../../../test/fixtures/fake-prisma.js';
import { RateLimiter } from './rate-limiter.js';
import { ConsoleMailerService, type Mail, MailerService } from '../mailer/mailer.service.js';

// Outside edges replaced: PrismaService -> in-memory fake (the DB), MailerService -> vi.fn spy (the mail provider),
// the clock -> vi.useFakeTimers({ toFake: ['Date'] }).
// Real: AppModule, the 3 global guards, AuthController/AuthService/AuditService/RateLimiter, TokenService, argon2, configureApp.
// A new app (new AuthService, so new RateLimiters) and a new fake are built for every test.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SECRET = 'auth-reset-spec-secret-0123456789abc-01';
const APP_URL = 'http://localhost:5173';
const MIN = 60 * 1000;
const T0 = Date.parse('2026-10-29T10:00:00+07:00');
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

type Who = keyof typeof IDS.users;
const PHONE: Record<Who, string> = {
  boss: '0900000001', manager1: '0900000002', manager2: '0900000003', tenant: '0900000004', lockedTenant: '0900000005',
};
const PASSWORD: Record<Who, string> = {
  boss: 'Boss@2026', manager1: 'QuanLy1@2026', manager2: 'QuanLy2@2026', tenant: 'NguoiThue@2026', lockedTenant: 'TamKhoa@2026',
};
const UNKNOWN_PHONE = '0999999999';
const NEW_PASSWORD = 'MatKhauMoi@1';
const BOSS_EMAIL = 'boss@example.com';

const validation = (fields: Record<string, string>) => ({
  error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ', fields },
});
const INVALID_LINK = validation({ token: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' });
const TOO_SHORT = validation({ newPassword: 'Mật khẩu tối thiểu 8 ký tự' });
const BAD_PHONE = validation({ phone: 'Số điện thoại không hợp lệ' });
const FORBIDDEN_FIELD = 'Trường này không được phép gửi lên';
const PCR_BODY = { error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Bạn cần đổi mật khẩu trước khi tiếp tục' } };
const TOO_MANY_BODY = { error: { code: 'TOO_MANY_REQUESTS', message: 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau' } };

let app: INestApplication;
let fake: FakePrisma;
let mailer: { send: Mock<(mail: Mail) => Promise<void>> };
let savedSecret: string | undefined;
let savedAppUrl: string | undefined;

beforeEach(async () => {
  savedSecret = process.env.JWT_SECRET;
  savedAppUrl = process.env.APP_URL;
  process.env.JWT_SECRET = SECRET;
  process.env.APP_URL = APP_URL;
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
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await app.close();
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
  if (savedAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = savedAppUrl;
});

// ---- helpers -------------------------------------------------------------------------------------------

const freeze = (when: number) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(when);
};
const http = () => request(app.getHttpServer());
const forgot = (phone: unknown) => http().post('/api/v1/auth/forgot-password').send({ phone });
const reset = (body: unknown) => http().post('/api/v1/auth/reset-password').send(body as object);
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
const tokenRow = (t: string): Row | undefined => fake.db.passwordResetToken.find((r) => r.tokenHash === sha256(t));
const hashOf = (who: Who) => fake.account(who).passwordHash as string;
const setEmail = (who: Who, email: string | null) => {
  fake.account(who).email = email;
};
/**
 * The token write and the mail run in the background after the reply (AUTH-07), so a test that expects `n` sends waits for them.
 * vi.waitFor moves a faked clock by its poll interval, so the clock is put back afterwards (only Date is faked).
 */
async function sent(n: number) {
  const at = Date.now();
  const fakeClock = vi.isFakeTimers();
  await vi.waitFor(() => expect(mailer.send).toHaveBeenCalledTimes(n), { timeout: 5000, interval: 5 });
  if (fakeClock) vi.setSystemTime(at);
}
/** Drains pending background work with a real timer, for the tests that expect NO send (only Date is faked). */
const drain = () => new Promise<void>((r) => setTimeout(r, 30));
/** The reset token carried by the link of the i-th mail that was sent. */
const sentToken = (i: number): string => {
  const text = mailer.send.mock.calls[i][0].text;
  const m = /\/quen-mat-khau\?token=([^\s]+)/.exec(text);
  if (!m) throw new Error(`mail #${i} has no reset link`);
  return m[1];
};
/** forgot-password for `who` (with an email), returning the token from the mail. */
async function requestLink(who: Who = 'boss') {
  if (fake.account(who).email == null) setEmail(who, `${who}@example.com`);
  const before = mailer.send.mock.calls.length;
  const res = await forgot(PHONE[who]);
  expect(res.status).toBe(200);
  await sent(before + 1);
  return sentToken(before);
}

// ---- AUTH-07: forgot-password ----------------------------------------------------------------------------

describe('AUTH-07: POST /auth/forgot-password', () => {
  it('AUTH-07: user with an email -> 200 { data: null }, one mail with the link, token stored only as SHA-256, expires in 30 minutes', async () => {
    freeze(T0);
    setEmail('boss', BOSS_EMAIL);
    const res = await forgot(PHONE.boss);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });

    await sent(1);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const mail = mailer.send.mock.calls[0][0];
    expect(mail.to).toBe(BOSS_EMAIL);
    expect(mail.subject).toBe('Đặt lại mật khẩu – Trọ Thông Minh');
    const t = sentToken(0);
    expect(t).toMatch(TOKEN_RE);
    expect(mail.text).toContain(`${APP_URL}/quen-mat-khau?token=${t}`);
    expect(mail.text).toContain('30 phút');

    expect(fake.db.passwordResetToken).toHaveLength(1);
    const row = fake.db.passwordResetToken[0];
    expect(row.userId).toBe(IDS.users.boss);
    expect(row.tokenHash).toBe(sha256(t));
    expect(row.tokenHash).not.toBe(t);
    expect(row.usedAt).toBeNull();
    expect((row.expiresAt as Date).getTime()).toBe(T0 + 30 * MIN);
    expect(JSON.stringify(fake.db.passwordResetToken)).not.toContain(t); // the raw token is never stored
  });

  it('AUTH-07: the link uses the APP_URL read at request time', async () => {
    process.env.APP_URL = 'https://tro.example.vn';
    setEmail('boss', BOSS_EMAIL);
    await forgot(PHONE.boss);
    await sent(1);
    expect(mailer.send.mock.calls[0][0].text).toContain(`https://tro.example.vn/quen-mat-khau?token=${sentToken(0)}`);
  });

  it('AUTH-07: two requests give two different tokens', async () => {
    const t1 = await requestLink('boss');
    const t2 = await requestLink('boss');
    expect(t1).toMatch(TOKEN_RE);
    expect(t2).toMatch(TOKEN_RE);
    expect(t1).not.toBe(t2);
  });

  it('AUTH-07: expiry crosses midnight in Asia/Ho_Chi_Minh: 2026-10-31T23:45+07:00 -> 2026-11-01T00:15+07:00', async () => {
    freeze(Date.parse('2026-10-31T23:45:00+07:00'));
    const t = await requestLink('boss');
    const expiresAt = tokenRow(t)!.expiresAt as Date;
    expect(expiresAt.getTime()).toBe(Date.parse('2026-11-01T00:15:00+07:00'));
    expect(expiresAt.toISOString()).toBe('2026-10-31T17:15:00.000Z');
  });

  it('AUTH-07: the mail is sent after the token rows are written, outside the $transaction', async () => {
    setEmail('boss', BOSS_EMAIL);
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
    const inTx: Record<string, boolean> = {};
    let rowsAtSend = -1;
    const updateMany = fake.passwordResetToken.updateMany.bind(fake.passwordResetToken);
    vi.spyOn(fake.passwordResetToken, 'updateMany').mockImplementation((a) => {
      inTx.updateMany = depth > 0;
      return updateMany(a);
    });
    const create = fake.passwordResetToken.create.bind(fake.passwordResetToken);
    vi.spyOn(fake.passwordResetToken, 'create').mockImplementation((a) => {
      inTx.create = depth > 0;
      return create(a);
    });
    mailer.send.mockImplementation(async () => {
      inTx.send = depth > 0;
      rowsAtSend = fake.db.passwordResetToken.length; // asserted below: a throw here would be swallowed by the background catch
    });
    const res = await forgot(PHONE.boss);
    expect(res.status).toBe(200);
    await sent(1);
    expect(txSpy).toHaveBeenCalledTimes(1);
    expect(inTx).toEqual({ updateMany: true, create: true, send: false });
    expect(rowsAtSend).toBe(1); // the row exists by the time the mail goes out
  });

  describe('no account enumeration', () => {
    it('AUTH-07: unknown phone, user without email, locked account with email (Q4a) all answer exactly like the happy path; nothing is sent or stored', async () => {
      setEmail('boss', BOSS_EMAIL);
      const happy = await forgot(PHONE.boss);
      expect(happy.status).toBe(200);
      await sent(1);
      const tokensAfterHappy = fake.db.passwordResetToken.length;

      setEmail('lockedTenant', 'locked@example.com');
      const cases: Array<[string, string]> = [
        ['unknown phone', UNKNOWN_PHONE],
        ['user without an email', PHONE.manager1],
        ['locked account with an email', PHONE.lockedTenant],
      ];
      for (const [label, phone] of cases) {
        const res = await forgot(phone);
        expect(res.status, label).toBe(happy.status);
        expect(res.body, label).toEqual(happy.body);
        expect(res.text, label).toBe(happy.text);
        expect(res.headers['set-cookie'], label).toBeUndefined();
      }
      await drain();
      expect(mailer.send).toHaveBeenCalledTimes(1); // still only the happy-path mail
      expect(fake.db.passwordResetToken).toHaveLength(tokensAfterHappy);
    });

    it('AUTH-07: an inactive user is skipped even when its email is set (Q4a)', async () => {
      setEmail('lockedTenant', 'locked@example.com');
      expect(fake.account('lockedTenant').isActive).toBe(false); // precondition from the seed
      const res = await forgot(PHONE.lockedTenant);
      expect(res.status).toBe(200);
      await drain();
      expect(mailer.send).not.toHaveBeenCalled();
      expect(fake.db.passwordResetToken).toHaveLength(0);
    });

    it('AUTH-07: a malformed phone -> 400 fields.phone "Số điện thoại không hợp lệ" (only the format is revealed)', async () => {
      for (const bad of ['123', '', '090000000', '09000000011', '1900000001', ' 0900000001', '0900000001 ', '09O0000001', 900000001, null, undefined]) {
        const res = await forgot(bad);
        expect(res.status, JSON.stringify(bad)).toBe(400);
        expect(res.body, JSON.stringify(bad)).toEqual(BAD_PHONE);
      }
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('AUTH-07: body [] gives the same Vietnamese fields as body {}; an extra field is refused', async () => {
      const empty = await http().post('/api/v1/auth/forgot-password').send({});
      const arr = await http().post('/api/v1/auth/forgot-password').send([]);
      expect(empty.status).toBe(400);
      expect(empty.body).toEqual(BAD_PHONE);
      expect(arr.status).toBe(400);
      expect(arr.body).toEqual(empty.body);
      setEmail('boss', BOSS_EMAIL);
      const extra = await http().post('/api/v1/auth/forgot-password').send({ phone: PHONE.boss, email: 'x@example.com' });
      expect(extra.status).toBe(400);
      expect(extra.body).toEqual(validation({ email: FORBIDDEN_FIELD }));
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('AUTH-07: needs no access token; a garbage Bearer header does not matter (route is @Public)', async () => {
      setEmail('boss', BOSS_EMAIL);
      const res = await http().post('/api/v1/auth/forgot-password').set('Authorization', 'Bearer rac.khong.hop-le').send({ phone: PHONE.boss });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: null });
      await sent(1);
    });
  });

  describe('mail failure', () => {
    it('AUTH-07: send() throws -> still 200 { data: null }; the logged error does not contain the token', async () => {
      setEmail('boss', BOSS_EMAIL);
      // The failure message echoes the whole mail, so a careless log line would leak the token.
      mailer.send.mockImplementation(async (mail) => {
        throw new Error(`SMTP down while sending: ${mail.text}`);
      });
      const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const res = await forgot(PHONE.boss);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: null });
      await vi.waitFor(() => expect(errorLog).toHaveBeenCalled()); // the failure is not swallowed silently
      expect(mailer.send).toHaveBeenCalledTimes(1);
      const t = sentToken(0);
      // BE-LOGIN-18: the line carries the error name only, never the message / stack / token.
      expect(errorLog.mock.calls).toEqual([['Could not send the password reset link (Error)']]);
      const logged = JSON.stringify(errorLog.mock.calls);
      expect(logged).not.toContain(t);
      expect(logged).not.toContain('quen-mat-khau');
      expect(logged).not.toContain(BOSS_EMAIL);
    });

    it('AUTH-07: the body is identical whether the mail went out or failed', async () => {
      setEmail('boss', BOSS_EMAIL);
      setEmail('manager1', 'ha@example.com');
      const ok = await forgot(PHONE.boss);
      await sent(1);
      const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mailer.send.mockRejectedValueOnce(new Error('boom'));
      const failed = await forgot(PHONE.manager1);
      await vi.waitFor(() => expect(errorLog).toHaveBeenCalledTimes(1));
      expect(failed.status).toBe(ok.status);
      expect(failed.text).toBe(ok.text);
    });

    it('AUTH-07: every branch answers with the same 200 body: happy, unknown phone, no email, locked, send fails, transaction fails', async () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      setEmail('boss', BOSS_EMAIL);
      setEmail('manager1', 'ha@example.com');
      setEmail('tenant', 'tenant@example.com');
      setEmail('lockedTenant', 'locked@example.com');
      const bodies: Array<[string, request.Response]> = [];
      bodies.push(['happy', await forgot(PHONE.boss)]);
      await sent(1);
      bodies.push(['unknown phone', await forgot(UNKNOWN_PHONE)]);
      fake.account('manager2').email = null;
      bodies.push(['no email', await forgot(PHONE.manager2)]);
      bodies.push(['locked', await forgot(PHONE.lockedTenant)]);
      mailer.send.mockRejectedValueOnce(new Error('boom'));
      bodies.push(['send fails', await forgot(PHONE.manager1)]);
      await sent(2);
      vi.spyOn(fake, '$transaction').mockRejectedValue(new Error('db down'));
      bodies.push(['transaction fails', await forgot(PHONE.tenant)]);
      await drain();
      for (const [label, res] of bodies) {
        expect(res.status, label).toBe(200);
        expect(res.text, label).toBe(bodies[0][1].text);
        expect(res.body, label).toEqual({ data: null });
        expect(res.headers['set-cookie'], label).toBeUndefined();
      }
    });

    it('AUTH-07: a failing $transaction (DB down) -> same 200 body, no mail, logged by error name only', async () => {
      setEmail('boss', BOSS_EMAIL);
      const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      vi.spyOn(fake, '$transaction').mockRejectedValue(new TypeError('connection refused to db with secret-token-xyz'));
      const res = await forgot(PHONE.boss);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: null });
      await vi.waitFor(() => expect(errorLog).toHaveBeenCalledTimes(1));
      await drain();
      expect(errorLog.mock.calls).toEqual([['Could not send the password reset link (TypeError)']]);
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('secret-token-xyz');
      expect(mailer.send).not.toHaveBeenCalled();
      expect(fake.db.passwordResetToken).toHaveLength(0);
    });

    it('AUTH-07: a failure in the background never becomes an unhandledRejection (send fails, transaction fails)', async () => {
      setEmail('boss', BOSS_EMAIL);
      setEmail('manager1', 'ha@example.com');
      const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const onUnhandled = vi.fn();
      process.on('unhandledRejection', onUnhandled);
      try {
        mailer.send.mockRejectedValue(new Error('SMTP down'));
        expect((await forgot(PHONE.boss)).status).toBe(200);
        await vi.waitFor(() => expect(errorLog).toHaveBeenCalledTimes(1));
        vi.spyOn(fake, '$transaction').mockRejectedValue(new Error('db down'));
        expect((await forgot(PHONE.manager1)).status).toBe(200);
        await vi.waitFor(() => expect(errorLog).toHaveBeenCalledTimes(2));
        await drain();
        expect(onUnhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });

    it('AUTH-07: the default MailerService is the console one: send() resolves and only logs', async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(fake)
        .compile();
      const real = moduleRef.get(MailerService, { strict: false });
      expect(real).toBeInstanceOf(ConsoleMailerService);
      const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      await expect(real.send({ to: 'a@example.com', subject: 'Chủ đề', text: 'Nội dung' })).resolves.toBeUndefined();
      const logged = log.mock.calls.flat().join('\n');
      expect(logged).toContain('a@example.com');
      expect(logged).toContain('Chủ đề');
      expect(logged).toContain('Nội dung');
    });
  });

  describe('timing: the reply does not wait for the token write or the mail', () => {
    it('AUTH-07: updateMany held open -> still 200 { data: null } before release, same body as an unknown phone; send runs after release', async () => {
      setEmail('boss', BOSS_EMAIL);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const updateMany = fake.passwordResetToken.updateMany.bind(fake.passwordResetToken);
      const held = vi.spyOn(fake.passwordResetToken, 'updateMany').mockImplementation(async (a) => {
        await gate;
        return updateMany(a);
      });
      const res = await forgot(PHONE.boss); // resolves only if the reply was sent while updateMany is still pending
      expect(held).toHaveBeenCalledTimes(1); // the background work really started and is stuck
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: null });
      expect(mailer.send).not.toHaveBeenCalled();
      expect(fake.db.passwordResetToken).toHaveLength(0);
      const unknown = await forgot(UNKNOWN_PHONE);
      expect(res.text).toBe(unknown.text);
      expect(res.status).toBe(unknown.status);

      release();
      await sent(1);
      expect(fake.db.passwordResetToken).toHaveLength(1);
    });

    it('AUTH-07: mailer.send held open -> still 200 { data: null } before release; the token row is already stored', async () => {
      setEmail('boss', BOSS_EMAIL);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let done = false;
      mailer.send.mockImplementation(async () => {
        await gate;
        done = true;
      });
      const res = await forgot(PHONE.boss);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: null });
      expect(mailer.send).toHaveBeenCalledTimes(1);
      expect(done).toBe(false); // the mail has not finished, yet the reply is already out
      release();
      await vi.waitFor(() => expect(done).toBe(true));
    });

    it('AUTH-07: forgotPassword neither awaits sendResetLink nor calls $transaction / mailer.send itself (static check)', () => {
      const src = readFileSync(fileURLToPath(new URL('./auth.service.ts', import.meta.url)), 'utf8');
      const start = src.indexOf('async forgotPassword(');
      const end = src.indexOf('async sendResetLink(');
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      const body = src.slice(start, end);
      expect(body).toContain('sendResetLink'); // the work is delegated...
      expect(body).not.toMatch(/await\s+this\.sendResetLink/); // ...without awaiting it
      expect(body).not.toContain('$transaction');
      expect(body).not.toMatch(/mailer\.send/);
      // sanity: the helper really is where the write and the send live
      const helper = src.slice(end, src.indexOf('async resetPassword('));
      expect(helper).toContain('$transaction');
      expect(helper).toContain('this.mailer.send');
    });
  });

  describe('Q4d: a new link voids the older unused ones', () => {
    it('Q4d: second request marks the first token used at once; reset with t1 -> 400 fields.token, with t2 -> 200', async () => {
      freeze(T0);
      const t1 = await requestLink('boss');
      expect(tokenRow(t1)!.usedAt).toBeNull();
      vi.setSystemTime(T0 + 2 * MIN);
      const t2 = await requestLink('boss');
      expect(t2).not.toBe(t1);
      expect((tokenRow(t1)!.usedAt as Date).getTime()).toBe(T0 + 2 * MIN);
      expect(tokenRow(t2)!.usedAt).toBeNull();

      const old = await reset({ token: t1, newPassword: NEW_PASSWORD });
      expect(old.status).toBe(400);
      expect(old.body).toEqual(INVALID_LINK);
      expect(await argon2.verify(hashOf('boss'), PASSWORD.boss)).toBe(true); // nothing changed

      const fresh = await reset({ token: t2, newPassword: NEW_PASSWORD });
      expect(fresh.status).toBe(200);
      expect(await argon2.verify(hashOf('boss'), NEW_PASSWORD)).toBe(true);
    });

    it("Q4d: a new link of one user does not void another user's link", async () => {
      const bossToken = await requestLink('boss');
      const managerToken = await requestLink('manager1');
      await requestLink('boss'); // voids only the boss's first link
      expect(tokenRow(bossToken)!.usedAt).not.toBeNull();
      expect(tokenRow(managerToken)!.usedAt).toBeNull();
      expect((await reset({ token: managerToken, newPassword: NEW_PASSWORD })).status).toBe(200);
    });

    it('Q4d: an already used link keeps its original usedAt when a new link is requested', async () => {
      freeze(T0);
      const t1 = await requestLink('boss');
      expect((await reset({ token: t1, newPassword: NEW_PASSWORD })).status).toBe(200);
      vi.setSystemTime(T0 + 5 * MIN);
      await requestLink('boss');
      expect((tokenRow(t1)!.usedAt as Date).getTime()).toBe(T0);
    });
  });

  describe('Q4e: 5 requests per phone per 15 minutes (sliding window)', () => {
    it('Q4e: the 6th request 1 minute later -> 200 identical body, no mail, no new token; the 5th link still works', async () => {
      freeze(T0);
      setEmail('boss', BOSS_EMAIL);
      const tokens: string[] = [];
      let firstBody: unknown;
      for (let i = 0; i < 5; i++) {
        const res = await forgot(PHONE.boss);
        expect(res.status, `request #${i + 1}`).toBe(200);
        firstBody ??= res.body;
        await sent(i + 1); // the next request starts only after this one's background work is done
        tokens.push(sentToken(i));
      }
      expect(mailer.send).toHaveBeenCalledTimes(5);
      expect(fake.db.passwordResetToken).toHaveLength(5);

      vi.setSystemTime(T0 + 1 * MIN);
      const sixth = await forgot(PHONE.boss);
      expect(sixth.status).toBe(200);
      expect(sixth.body).toEqual(firstBody);
      expect(sixth.body).toEqual({ data: null });
      await drain();
      expect(mailer.send).toHaveBeenCalledTimes(5);
      expect(fake.db.passwordResetToken).toHaveLength(5);
      // the blocked request must not have voided the 5th link (Q4d only applies to an accepted request)
      expect(tokenRow(tokens[4])!.usedAt).toBeNull();
      const used = await reset({ token: tokens[4], newPassword: NEW_PASSWORD });
      expect(used.status).toBe(200);
    });

    it('Q4e: window edge: still blocked at +15 min - 1 ms, mail goes out again at exactly +15 min', async () => {
      freeze(T0);
      setEmail('boss', BOSS_EMAIL);
      for (let i = 0; i < 5; i++) {
        await forgot(PHONE.boss);
        await sent(i + 1);
      }

      vi.setSystemTime(T0 + 15 * MIN - 1);
      await forgot(PHONE.boss);
      await drain();
      expect(mailer.send).toHaveBeenCalledTimes(5);

      vi.setSystemTime(T0 + 15 * MIN);
      const res = await forgot(PHONE.boss);
      expect(res.status).toBe(200);
      await sent(6);
      expect(fake.db.passwordResetToken).toHaveLength(6);
    });

    it('Q4e: blocked requests are not counted: 5 at t, 5 blocked at t + 1 min, then at t + 15 min mail goes out again', async () => {
      freeze(T0);
      setEmail('boss', BOSS_EMAIL);
      for (let i = 0; i < 5; i++) {
        await forgot(PHONE.boss);
        await sent(i + 1);
      }
      vi.setSystemTime(T0 + 1 * MIN);
      for (let i = 0; i < 5; i++) expect((await forgot(PHONE.boss)).status).toBe(200);
      await drain();
      expect(mailer.send).toHaveBeenCalledTimes(5); // all 5 were blocked
      vi.setSystemTime(T0 + 15 * MIN); // the first 5 left the window; had the blocked ones counted, this would still be blocked
      expect((await forgot(PHONE.boss)).status).toBe(200);
      await sent(6);
      expect(fake.db.passwordResetToken).toHaveLength(6);
    });

    it('Q4e: record() is called for the unknown phone on the first 5 requests and not on the 6th (blocked)', async () => {
      const record = vi.spyOn(RateLimiter.prototype, 'record');
      const calls = () => record.mock.calls.filter((c) => c[0] === UNKNOWN_PHONE).length;
      for (let i = 0; i < 5; i++) {
        expect((await forgot(UNKNOWN_PHONE)).status).toBe(200);
        expect(calls()).toBe(i + 1);
      }
      expect((await forgot(UNKNOWN_PHONE)).status).toBe(200);
      expect(calls()).toBe(5);
    });

    it('Q4e: the window slides: hits at +0, +1, +2, +3, +4 min -> blocked until the first one leaves at +15 min, then one more is allowed', async () => {
      freeze(T0);
      setEmail('boss', BOSS_EMAIL);
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(T0 + i * MIN);
        await forgot(PHONE.boss);
        await sent(i + 1);
      }
      vi.setSystemTime(T0 + 14 * MIN);
      await forgot(PHONE.boss);
      await drain();
      expect(mailer.send).toHaveBeenCalledTimes(5);
      vi.setSystemTime(T0 + 15 * MIN); // only the hit at T0 is out of the window
      await forgot(PHONE.boss);
      await sent(6);
      await forgot(PHONE.boss); // window now holds +1..+4 and +15 = 5 hits
      await drain();
      expect(mailer.send).toHaveBeenCalledTimes(6);
    });

    it('Q4e: another phone is not affected', async () => {
      freeze(T0);
      setEmail('boss', BOSS_EMAIL);
      setEmail('manager1', 'ha@example.com');
      for (let i = 0; i < 5; i++) {
        await forgot(PHONE.boss);
        await sent(i + 1);
      }
      await forgot(PHONE.boss); // 6th, blocked
      await drain();
      expect(mailer.send).toHaveBeenCalledTimes(5);
      const res = await forgot(PHONE.manager1);
      expect(res.status).toBe(200);
      await sent(6);
      expect(mailer.send.mock.calls[5][0].to).toBe('ha@example.com');
    });

    it('Q4e: requests that find no email still count (the counter must not tell who has an account)', async () => {
      freeze(T0);
      for (let i = 0; i < 5; i++) expect((await forgot(PHONE.boss)).status).toBe(200); // boss has no email yet
      await drain();
      expect(mailer.send).not.toHaveBeenCalled();
      setEmail('boss', BOSS_EMAIL);
      const sixth = await forgot(PHONE.boss);
      expect(sixth.status).toBe(200);
      await drain();
      expect(mailer.send).not.toHaveBeenCalled(); // already over the limit
    });

    it('Q4e: an unknown phone never gets 429, however often it asks', async () => {
      for (let i = 0; i < 8; i++) {
        const res = await forgot(UNKNOWN_PHONE);
        expect(res.status, `request #${i + 1}`).toBe(200);
        expect(res.body).toEqual({ data: null });
      }
      await drain();
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('Q4e: independent counters: after 6 forgot requests the right password still logs in (200, not 429)', async () => {
      setEmail('boss', BOSS_EMAIL);
      for (let i = 0; i < 5; i++) {
        await forgot(PHONE.boss);
        await sent(i + 1);
      }
      expect((await forgot(PHONE.boss)).status).toBe(200); // 6th, blocked
      const res = await login(PHONE.boss, PASSWORD.boss);
      expect(res.status).toBe(200);
    });

    it('Q4e: independent counters: after login is blocked (429) a forgot request still sends mail', async () => {
      setEmail('boss', BOSS_EMAIL);
      for (let i = 0; i < 5; i++) expect((await login(PHONE.boss, 'Sai-mat-khau-1')).status).toBe(401);
      const blocked = await login(PHONE.boss, PASSWORD.boss);
      expect(blocked.status).toBe(429);
      expect(blocked.body).toEqual(TOO_MANY_BODY);
      const res = await forgot(PHONE.boss);
      expect(res.status).toBe(200);
      await sent(1);
    });

    it('Q4e: a malformed phone is rejected before the counter (400s do not use up the 5 requests)', async () => {
      setEmail('boss', BOSS_EMAIL);
      for (let i = 0; i < 6; i++) expect((await forgot('0900')).status).toBe(400);
      const res = await forgot(PHONE.boss);
      expect(res.status).toBe(200);
      await sent(1);
    });
  });
});

// ---- AUTH-07 / AUTH-T3: reset-password -------------------------------------------------------------------

describe('AUTH-07: POST /auth/reset-password', () => {
  it('AUTH-07: valid token -> 200 { data: null }; new password works, old one does not; token marked used', async () => {
    freeze(T0);
    const t = await requestLink('boss');
    const oldHash = hashOf('boss');
    vi.setSystemTime(T0 + 10 * MIN);
    const res = await reset({ token: t, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: null });

    const newHash = hashOf('boss');
    expect(newHash).not.toBe(oldHash);
    expect(newHash.startsWith('$argon2id$')).toBe(true);
    expect(newHash).not.toContain(NEW_PASSWORD);
    expect(await argon2.verify(newHash, NEW_PASSWORD)).toBe(true);
    expect(await argon2.verify(newHash, PASSWORD.boss)).toBe(false);
    expect((tokenRow(t)!.usedAt as Date).getTime()).toBe(T0 + 10 * MIN);

    const old = await login(PHONE.boss, PASSWORD.boss);
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe('INVALID_CREDENTIALS');
    expect((await login(PHONE.boss, NEW_PASSWORD)).status).toBe(200);
  });

  it('AUTH-T3: every session of that user is revoked; other users and already revoked sessions are left alone', async () => {
    freeze(T0);
    setEmail('boss', BOSS_EMAIL);
    const A = await loginOk('boss');
    const B = await loginOk('boss');
    const gone = await loginOk('boss');
    const tenant = await loginOk('tenant');
    expect((await http().post('/api/v1/auth/logout').set('Cookie', `rt=${gone.cookie}`)).status).toBe(200);
    const t = await requestLink('boss');

    vi.setSystemTime(T0 + 10 * MIN);
    expect((await reset({ token: t, newPassword: NEW_PASSWORD })).status).toBe(200);
    expect(sessionFor(A.cookie).revokedAt).toBeInstanceOf(Date);
    expect(sessionFor(B.cookie).revokedAt).toBeInstanceOf(Date);
    expect((sessionFor(gone.cookie).revokedAt as Date).getTime()).toBe(T0); // original logout time kept
    expect(sessionFor(tenant.cookie).revokedAt).toBeNull();
    expect((await refresh(A.cookie)).status).toBe(401);
    expect((await refresh(B.cookie)).status).toBe(401);
    expect((await refresh(tenant.cookie)).status).toBe(200);
  });

  it('AUD-01: exactly 1 audit row user.reset_password, actor = entity = the user, ip set, no before/after, no secret', async () => {
    const t = await requestLink('boss');
    const res = await reset({ token: t, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(fake.db.auditLog).toHaveLength(1);
    const row = fake.db.auditLog[0];
    expect(row.actorId).toBe(IDS.users.boss);
    expect(row.entityId).toBe(IDS.users.boss);
    expect(row.action).toBe('user.reset_password');
    expect(row.entity).toBe('user');
    expect(typeof row.ip).toBe('string');
    expect(row.ip).toMatch(/127\.0\.0\.1|::1/); // supertest talks to the app over loopback
    expect(row.before ?? null).toBeNull();
    expect(row.after ?? null).toBeNull();
    const text = JSON.stringify(row);
    for (const secret of ['$argon2', t, NEW_PASSWORD, PASSWORD.boss]) expect(text).not.toContain(secret);
  });

  it('AUD-01: forgot-password alone writes no audit row; a failed reset writes none either', async () => {
    const t = await requestLink('boss');
    expect(fake.db.auditLog).toHaveLength(0);
    await reset({ token: 'rac-khong-phai-token', newPassword: NEW_PASSWORD });
    await reset({ token: t, newPassword: 'ngan' });
    expect(fake.db.auditLog).toHaveLength(0);
  });

  it('AUTH-T3: token update, user update, session revocation and audit insert all run inside one $transaction', async () => {
    const t = await requestLink('boss');
    await loginOk('boss');
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
    const spyOp = <K extends 'passwordResetToken' | 'user' | 'session' | 'auditLog'>(table: K, method: 'update' | 'updateMany' | 'create') => {
      const target = fake[table] as unknown as Record<string, (a: unknown) => Promise<unknown>>;
      const orig = target[method].bind(target);
      vi.spyOn(target, method).mockImplementation((a: unknown) => {
        log.push({ op: `${table}.${method}`, inTx: depth > 0 });
        return orig(a);
      });
    };
    spyOp('passwordResetToken', 'updateMany');
    spyOp('user', 'update');
    spyOp('session', 'updateMany');
    spyOp('auditLog', 'create');

    const res = await reset({ token: t, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(txSpy).toHaveBeenCalledTimes(1);
    expect(log.map((l) => l.op).sort()).toEqual([
      'auditLog.create', 'passwordResetToken.updateMany', 'session.updateMany', 'user.update',
    ]);
    expect(log.every((l) => l.inTx)).toBe(true);
  });

  describe('Q4c: the must-change-password flag', () => {
    it('Q4c: flagged Boss resets -> flag cleared; then login + PATCH /auth/me works (no PASSWORD_CHANGE_REQUIRED)', async () => {
      fake.account('boss').mustChangePassword = true;
      const before = await loginOk('boss'); // login is allowed while flagged
      const blocked = await http().patch('/api/v1/auth/me').set('Authorization', `Bearer ${before.accessToken}`).send({});
      expect(blocked.status).toBe(403);
      expect(blocked.body).toEqual(PCR_BODY); // precondition: the flag really blocks

      const t = await requestLink('boss');
      const res = await reset({ token: t, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(200);
      expect(fake.account('boss').mustChangePassword).toBe(false);

      const again = await login(PHONE.boss, NEW_PASSWORD);
      expect(again.status).toBe(200);
      expect(again.body.data.user.mustChangePassword).toBe(false);
      const patch = await http().patch('/api/v1/auth/me').set('Authorization', `Bearer ${again.body.data.accessToken}`).send({});
      expect(patch.status).toBe(200);
    });

    it('Q4c: reset works without any access token even while the account is flagged (route is @Public, P4)', async () => {
      fake.account('boss').mustChangePassword = true;
      const t = await requestLink('boss');
      const res = await http()
        .post('/api/v1/auth/reset-password')
        .set('Authorization', 'Bearer rac.khong.hop-le')
        .send({ token: t, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(200);
      expect(fake.account('boss').mustChangePassword).toBe(false);
    });
  });

  describe('Q4b: invalid, used, expired tokens', () => {
    it('Q4b: using the same token twice -> 2nd is 400 fields.token; the password set by the 1st stays', async () => {
      const t = await requestLink('boss');
      expect((await reset({ token: t, newPassword: NEW_PASSWORD })).status).toBe(200);
      const hashAfterFirst = hashOf('boss');
      const second = await reset({ token: t, newPassword: 'MatKhauMoi@2' });
      expect(second.status).toBe(400);
      expect(second.body).toEqual(INVALID_LINK);
      expect(hashOf('boss')).toBe(hashAfterFirst);
      expect(await argon2.verify(hashOf('boss'), NEW_PASSWORD)).toBe(true);
      expect(await argon2.verify(hashOf('boss'), 'MatKhauMoi@2')).toBe(false);
      expect(fake.db.auditLog).toHaveLength(1);
    });

    it('Q4b: garbage, near-miss and stored-hash tokens all give the same 400 body', async () => {
      const t = await requestLink('boss');
      const storedHash = tokenRow(t)!.tokenHash as string;
      const nearMisses = [
        'rac-khong-phai-token',
        'a'.repeat(43),
        `${t}x`,
        t.slice(1),
        t.toUpperCase() === t ? t.toLowerCase() : t.toUpperCase(),
        ` ${t}`,
        storedHash, // knowing the stored hash must not be enough to reset
      ];
      for (const token of nearMisses) {
        const res = await reset({ token, newPassword: NEW_PASSWORD });
        expect(res.status, token).toBe(400);
        expect(res.body, token).toEqual(INVALID_LINK);
      }
      expect(await argon2.verify(hashOf('boss'), PASSWORD.boss)).toBe(true);
      expect(tokenRow(t)!.usedAt).toBeNull();
      expect((await reset({ token: t, newPassword: NEW_PASSWORD })).status).toBe(200); // the real one is intact
    });

    it('Q4b: expiry boundary: 1 ms before expiresAt -> 200', async () => {
      freeze(T0);
      const t = await requestLink('boss');
      vi.setSystemTime(T0 + 30 * MIN - 1);
      const res = await reset({ token: t, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(200);
    });

    it('Q4b: expiry boundary: exactly at expiresAt -> 400 fields.token, password and token untouched', async () => {
      freeze(T0);
      const t = await requestLink('boss');
      vi.setSystemTime(T0 + 30 * MIN);
      const res = await reset({ token: t, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(INVALID_LINK);
      expect(await argon2.verify(hashOf('boss'), PASSWORD.boss)).toBe(true);
      expect(tokenRow(t)!.usedAt).toBeNull();
      expect(fake.db.auditLog).toHaveLength(0);
    });

    it('Q4b: a day later -> 400 fields.token', async () => {
      freeze(T0);
      const t = await requestLink('boss');
      vi.setSystemTime(T0 + 24 * 60 * MIN);
      const res = await reset({ token: t, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(INVALID_LINK);
    });

    it('Q4b: expiry across midnight in Asia/Ho_Chi_Minh: valid at 2026-11-01T00:14:59.999+07:00, invalid at 00:15:00', async () => {
      freeze(Date.parse('2026-10-31T23:45:00+07:00'));
      const t = await requestLink('boss');
      vi.setSystemTime(Date.parse('2026-11-01T00:15:00+07:00'));
      expect((await reset({ token: t, newPassword: NEW_PASSWORD })).status).toBe(400);
      vi.setSystemTime(Date.parse('2026-11-01T00:14:59.999+07:00'));
      expect((await reset({ token: t, newPassword: NEW_PASSWORD })).status).toBe(200);
    });

    it('Q4b: two parallel resets with the same token -> exactly one 200 and one 400; one audit row; the winner password is the one stored', async () => {
      const t = await requestLink('boss');
      const [a, b] = await Promise.all([
        reset({ token: t, newPassword: 'MatKhauMoi@A' }),
        reset({ token: t, newPassword: 'MatKhauMoi@B' }),
      ]);
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 400]);
      const loser = a.status === 400 ? a : b;
      expect(loser.body).toEqual(INVALID_LINK);
      const winnerPassword = a.status === 200 ? 'MatKhauMoi@A' : 'MatKhauMoi@B';
      const loserPassword = a.status === 200 ? 'MatKhauMoi@B' : 'MatKhauMoi@A';
      expect(await argon2.verify(hashOf('boss'), winnerPassword)).toBe(true);
      expect(await argon2.verify(hashOf('boss'), loserPassword)).toBe(false);
      expect(fake.db.auditLog).toHaveLength(1);
    });

    it("Q4b: a token cannot reset another user's password", async () => {
      const bossToken = await requestLink('boss');
      await reset({ token: bossToken, newPassword: NEW_PASSWORD });
      expect(await argon2.verify(hashOf('manager1'), PASSWORD.manager1)).toBe(true);
      expect(await argon2.verify(hashOf('tenant'), PASSWORD.tenant)).toBe(true);
      expect(fake.db.auditLog.map((r) => r.entityId)).toEqual([IDS.users.boss]);
    });
  });

  describe('AUTH-03: new password', () => {
    it('AUTH-03: 7 characters -> 400 fields.newPassword; the token is not used up and still works afterwards', async () => {
      const t = await requestLink('boss');
      const res = await reset({ token: t, newPassword: 'Abcdef1' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(TOO_SHORT);
      expect(tokenRow(t)!.usedAt).toBeNull();
      expect(await argon2.verify(hashOf('boss'), PASSWORD.boss)).toBe(true);
      expect(fake.db.auditLog).toHaveLength(0);
      expect((await reset({ token: t, newPassword: 'Abcdefg1' })).status).toBe(200); // 8 characters
      expect(await argon2.verify(hashOf('boss'), 'Abcdefg1')).toBe(true);
    });

    it('AUTH-03: 8 Vietnamese characters ("Mật khẩu") -> 200', async () => {
      const t = await requestLink('boss');
      const res = await reset({ token: t, newPassword: 'Mật khẩu' });
      expect(res.status).toBe(200);
      expect(await argon2.verify(hashOf('boss'), 'Mật khẩu')).toBe(true);
    });

    it('AUTH-03: newPassword "", a number, null or missing -> 400 fields.newPassword', async () => {
      const t = await requestLink('boss');
      for (const bad of ['', 12345678, null]) {
        const res = await reset({ token: t, newPassword: bad });
        expect(res.status, JSON.stringify(bad)).toBe(400);
        expect(res.body, JSON.stringify(bad)).toEqual(TOO_SHORT);
      }
      const missing = await reset({ token: t });
      expect(missing.status).toBe(400);
      expect(missing.body).toEqual(TOO_SHORT);
      expect(tokenRow(t)!.usedAt).toBeNull();
    });

    it('AUTH-03: the validation error comes before the token check: a short password with a garbage token -> fields.newPassword only', async () => {
      const res = await reset({ token: 'rac-khong-phai-token', newPassword: 'ngan' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(TOO_SHORT);
    });
  });

  describe('input validation', () => {
    it('AUTH-07: missing, empty or non-string token -> 400 fields.token', async () => {
      for (const body of [
        { newPassword: NEW_PASSWORD },
        { token: '', newPassword: NEW_PASSWORD },
        { token: 123, newPassword: NEW_PASSWORD },
        { token: null, newPassword: NEW_PASSWORD },
        { token: ['a'], newPassword: NEW_PASSWORD },
      ]) {
        const res = await reset(body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body, JSON.stringify(body)).toEqual(INVALID_LINK);
      }
    });

    it('AUTH-07 / P13: body [] gives the same Vietnamese fields as body {}', async () => {
      const empty = await http().post('/api/v1/auth/reset-password').send({});
      const arr = await http().post('/api/v1/auth/reset-password').send([]);
      expect(empty.status).toBe(400);
      expect(empty.body).toEqual(
        validation({
          token: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
          newPassword: 'Mật khẩu tối thiểu 8 ký tự',
        }),
      );
      expect(arr.status).toBe(400);
      expect(arr.body).toEqual(empty.body);
    });

    it('AUTH-07: an extra field (userId, role) is refused and nothing is changed', async () => {
      const t = await requestLink('boss');
      const res = await reset({ token: t, newPassword: NEW_PASSWORD, userId: IDS.users.manager1, role: 'BOSS' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(validation({ userId: FORBIDDEN_FIELD, role: FORBIDDEN_FIELD }));
      expect(tokenRow(t)!.usedAt).toBeNull();
      expect(await argon2.verify(hashOf('manager1'), PASSWORD.manager1)).toBe(true);
      expect(await argon2.verify(hashOf('boss'), PASSWORD.boss)).toBe(true);
    });
  });
});
