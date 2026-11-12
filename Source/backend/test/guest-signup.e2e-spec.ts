// BE-EX-09 · e2e on the DEV database: guest sign-up -> email code -> login -> forgot password by link (AUTH-11, AUTH-12, AUTH-13, AUTH-07),
// plus two parallel sign-ups for one email (the advisory lock, AUTH-14). Excluded from `npm run test` (name ends in `-spec.ts`).
// MailerService is replaced by a spy that keeps the mails: the 6-digit code is stored only as a hash, so the test reads it from the mail text.
import { existsSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { MailerService } from '../src/modules/mailer/mailer.service.js';
import { cleanupRun, E2eRun, randomPassword, uniquePhone } from '../scripts/e2e/run.js';

if (existsSync('.env')) process.loadEnvFile('.env');
vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 }); // remote dev DB, ~0.8 s per query

interface SentMail {
  to: string;
  text: string;
}

const e2e = new E2eRun();
const mails: SentMail[] = [];
const spy = {
  send: (mail: SentMail) => {
    mails.push(mail);
    return Promise.resolve();
  },
};

let app: INestApplication;
let prisma: PrismaService;
const post = (path: string, body: object) => request(app.getHttpServer()).post(`/api/v1${path}`).send(body);
const phoneTaken = async (phone: string) => (await prisma.user.findUnique({ where: { phone }, select: { id: true } })) !== null;
const mailTo = (email: string) => mails.filter((m) => m.to === email);
const codeIn = (mail: SentMail) => /(\d{6})/.exec(mail.text)![1];
const tokenIn = (mail: SentMail) => /\/quen-mat-khau\?token=(\S+)/.exec(mail.text)![1];

const stamp = e2e.runId.toLowerCase();
const EMAIL = `e2e-${stamp}@example.com`;
const RACE_EMAIL = `e2e-race-${stamp}@example.com`;
const PASSWORD = `Aa1-${randomPassword()}`;
const NEW_PASSWORD = `Bb2-${randomPassword()}`;
let phone = '';

describe('BE-EX-09: guest sign-up on the real AppModule and the dev database (e2e)', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService)
      .useValue(spy)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    phone = await uniquePhone(phoneTaken);
  });

  afterAll(async () => {
    if (!app) return;
    try {
      const users = await prisma.user.findMany({ where: { email: { in: [EMAIL, RACE_EMAIL] } }, select: { id: true } });
      for (const u of users) e2e.record('users', u.id);
      await prisma.emailOtp.deleteMany({ where: { email: { in: [EMAIL, RACE_EMAIL] } } }); // our own mail codes only
      const skipped = await cleanupRun(prisma, e2e.log);
      expect(skipped).toEqual([]);
      e2e.finish('CLEANED');
    } catch (error) {
      e2e.finish('FAILED_CLEANUP');
      throw error;
    } finally {
      await app.close();
    }
  });

  it('AUTH-11: register -> 201, one mail with a 6-digit code, an unverified GUEST row', async () => {
    const res = await post('/auth/register', { fullName: `[E2E ${e2e.runId}] Guest`, phone, email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ data: null });
    expect(mailTo(EMAIL)).toHaveLength(1);
    const row = await prisma.user.findUnique({ where: { phone } });
    expect(row).toMatchObject({ role: 'GUEST', email: EMAIL, emailVerifiedAt: null, mustChangePassword: false, locale: 'vi' });
    e2e.record('users', row!.id);
  });

  it('AUTH-12: login with the right password before verifying -> 403 EMAIL_NOT_VERIFIED, no new mail', async () => {
    const res = await post('/auth/login', { phone, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(mailTo(EMAIL)).toHaveLength(1);
  });

  it('AUTH-07: forgot-password before verifying -> 200 and no reset link', async () => {
    const res = await post('/auth/forgot-password', { phone });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 3000)); // the send is a background step
    expect(mailTo(EMAIL)).toHaveLength(1);
  });

  it('AUTH-13: a wrong code -> 400 OTP_INVALID; the right code -> 200 with a session; a reused code fails', async () => {
    const code = codeIn(mailTo(EMAIL)[0]);
    const wrong = code === '000000' ? '000001' : '000000';
    expect((await post('/auth/verify-email', { phone, code: wrong })).body.error.code).toBe('OTP_INVALID');
    const ok = await post('/auth/verify-email', { phone, code });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user).toMatchObject({ role: 'GUEST', emailVerified: true, locale: 'vi' });
    expect(String(ok.headers['set-cookie'])).toContain('rt=');
    expect((await post('/auth/verify-email', { phone, code })).status).toBe(400); // single use
  });

  it('AUTH-12, SCOPE-05: login works now; the guest is refused on a staff route and may set locale', async () => {
    const login = await post('/auth/login', { phone, password: PASSWORD });
    expect(login.status).toBe(200);
    const auth = { Authorization: `Bearer ${login.body.data.accessToken as string}` };
    const staff = await request(app.getHttpServer()).get('/api/v1/managers').set(auth);
    expect(staff.status).toBe(403);
    const patched = await request(app.getHttpServer()).patch('/api/v1/auth/me').set(auth).send({ locale: 'en' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.locale).toBe('en');
  });

  it('AUTH-07: forgot-password -> link by mail; reset-password; the old password stops working', async () => {
    expect((await post('/auth/forgot-password', { phone })).status).toBe(200);
    await vi.waitFor(() => expect(mailTo(EMAIL)).toHaveLength(2), { timeout: 30_000, interval: 500 });
    const token = tokenIn(mailTo(EMAIL)[1]);
    expect((await post('/auth/reset-password', { token, newPassword: NEW_PASSWORD })).status).toBe(200);
    expect((await post('/auth/login', { phone, password: PASSWORD })).status).toBe(401);
    expect((await post('/auth/login', { phone, password: NEW_PASSWORD })).status).toBe(200);
  });

  it('AUTH-14: two parallel sign-ups with one email leave exactly one account and no 500', async () => {
    const p1 = await uniquePhone(phoneTaken);
    const p2 = await uniquePhone(async (x) => x === p1 || (await phoneTaken(x)));
    const body = (p: string) => ({ fullName: `[E2E ${e2e.runId}] Race`, phone: p, email: RACE_EMAIL, password: PASSWORD });
    const [a, b] = await Promise.all([post('/auth/register', body(p1)), post('/auth/register', body(p2))]);
    for (const res of [a, b]) expect([201, 429]).toContain(res.status); // 429: a second code inside 60 s (AUTH-13)
    expect([a.status, b.status]).toContain(201);
    expect(await prisma.user.count({ where: { email: RACE_EMAIL } })).toBe(1);
    expect(await prisma.emailOtp.count({ where: { email: RACE_EMAIL, usedAt: null } })).toBeLessThanOrEqual(1);
  });
});
