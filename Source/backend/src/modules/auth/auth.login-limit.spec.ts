import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { createFakePrisma, type FakePrisma } from '../../../test/fixtures/fake-prisma.js';
import { AuthService } from './auth.service.js';
import { RateLimiter } from './rate-limiter.js';

// AUTH-04 / BE-LOGIN-12 "sửa thêm 1": the failure mark is written before the first await.
// Outside edges replaced: PrismaService -> in-memory fake (the DB). Real: AppModule, guards, AuthController,
// AuthService, RateLimiter (only spied on, calls through), argon2.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SECRET = 'auth-login-limit-spec-secret-0123456789-01';
const BOSS = { phone: '0900000001', password: 'Boss@2026' };
const LOCKED = { phone: '0900000005', password: 'TamKhoa@2026' };
const UNKNOWN_PHONE = '0999999999';
const WRONG = 'Sai-mat-khau-1';
const TOO_MANY_BODY = { error: { code: 'TOO_MANY_REQUESTS', message: 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau' } };

let app: INestApplication;
let fake: FakePrisma;
let service: AuthService;
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
  service = moduleRef.get(AuthService, { strict: false });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

const login = (body: object) => request(app.getHttpServer()).post('/api/v1/auth/login').send(body);

describe('AUTH-04: parallel wrong logins (BE-LOGIN-12)', () => {
  for (const [label, phone] of [['an existing phone', BOSS.phone], ['an unknown phone', UNKNOWN_PHONE]] as const) {
    it(`AUTH-04: parallel wrong logins - 6 simultaneous wrong passwords for ${label} give at least one 429 (expected 5x401 + 1x429)`, async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => login({ phone, password: WRONG })));
      const statuses = results.map((r) => r.status).sort((a, b) => a - b);
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
      const refused = results.find((r) => r.status === 429)!;
      expect(refused.body).toEqual(TOO_MANY_BODY);
      // afterwards even the right password is refused (sequentially)
      if (phone === BOSS.phone) {
        const right = await login(BOSS);
        expect(right.status).toBe(429);
        expect(right.body).toEqual(TOO_MANY_BODY);
        expect(fake.db.session).toHaveLength(0);
      }
    });
  }

  it('AUTH-04: 10 simultaneous wrong passwords never let more than 5 through as 401', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => login({ phone: BOSS.phone, password: WRONG })));
    expect(results.filter((r) => r.status === 401)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
  });
});

describe('AUTH-04: the mark is written before the first await (BE-LOGIN-12)', () => {
  it('AUTH-04: when user.findUnique runs, record was already called exactly once, for that phone', async () => {
    const record = vi.spyOn(RateLimiter.prototype, 'record'); // spy only, calls through
    const seen: Array<{ phone: unknown; recordCalls: number; recordedPhone: unknown }> = [];
    const real = fake.user.findUnique.bind(fake.user);
    fake.user.findUnique = async (args: Parameters<typeof real>[0]) => {
      seen.push({
        phone: (args.where as { phone?: string }).phone,
        recordCalls: record.mock.calls.length,
        recordedPhone: record.mock.calls[0]?.[0],
      });
      return real(args);
    };
    await expect(service.login({ phone: BOSS.phone, password: WRONG })).rejects.toBeDefined();
    const first = seen.find((s) => s.phone === BOSS.phone)!;
    expect(first).toBeDefined();
    expect(first.recordCalls).toBe(1);
    expect(first.recordedPhone).toBe(BOSS.phone);
    expect(record).toHaveBeenCalledTimes(1); // a wrong password does not record a second time
  });

  it('AUTH-04: the same holds for an unknown phone (marked before the lookup, and counted once)', async () => {
    const record = vi.spyOn(RateLimiter.prototype, 'record');
    let callsAtLookup = -1;
    const real = fake.user.findUnique.bind(fake.user);
    fake.user.findUnique = async (args: Parameters<typeof real>[0]) => {
      callsAtLookup = record.mock.calls.length;
      return real(args);
    };
    await expect(service.login({ phone: UNKNOWN_PHONE, password: WRONG })).rejects.toBeDefined();
    expect(callsAtLookup).toBe(1);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('AUTH-04 / Q2d: a blocked phone is refused before any mark or lookup (a 429 is not counted)', async () => {
    for (let i = 0; i < 5; i++) await expect(service.login({ phone: BOSS.phone, password: WRONG })).rejects.toBeDefined();
    const record = vi.spyOn(RateLimiter.prototype, 'record');
    const lookup = vi.spyOn(fake.user, 'findUnique');
    await expect(service.login({ phone: BOSS.phone, password: BOSS.password })).rejects.toMatchObject({ status: 429 });
    expect(record).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('AUTH-04 / Q2d: ACCOUNT_LOCKED calls remove with the very ts given to record, and never reset', async () => {
    const record = vi.spyOn(RateLimiter.prototype, 'record');
    const remove = vi.spyOn(RateLimiter.prototype, 'remove');
    const reset = vi.spyOn(RateLimiter.prototype, 'reset');
    await expect(service.login(LOCKED)).rejects.toMatchObject({ status: 403 });
    expect(record).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    const [recKey, recTs] = record.mock.calls[0];
    expect(typeof recTs).toBe('number');
    expect(remove.mock.calls[0]).toEqual([LOCKED.phone, recTs]);
    expect(recKey).toBe(LOCKED.phone);
    expect(reset).not.toHaveBeenCalled();
  });

  it('AUTH-04 / Q2d: ACCOUNT_LOCKED keeps the earlier failures (4 wrong + locked-right + 1 wrong -> next is 429)', async () => {
    for (let i = 0; i < 4; i++) await expect(service.login({ phone: LOCKED.phone, password: WRONG })).rejects.toMatchObject({ status: 401 });
    await expect(service.login(LOCKED)).rejects.toMatchObject({ status: 403 });
    await expect(service.login({ phone: LOCKED.phone, password: WRONG })).rejects.toMatchObject({ status: 401 });
    await expect(service.login(LOCKED)).rejects.toMatchObject({ status: 429 });
  });

  it('AUTH-04 / Q2b: a successful login calls reset for the phone, not remove, and the counter is empty afterwards', async () => {
    for (let i = 0; i < 4; i++) await expect(service.login({ phone: BOSS.phone, password: WRONG })).rejects.toBeDefined();
    const reset = vi.spyOn(RateLimiter.prototype, 'reset');
    const remove = vi.spyOn(RateLimiter.prototype, 'remove');
    const ok = await service.login(BOSS);
    expect(ok.accessToken).toBeTruthy();
    expect(reset).toHaveBeenCalledWith(BOSS.phone);
    expect(remove).not.toHaveBeenCalled();
    // after the reset 4 more wrong passwords are still 401 (a 5th mark would have blocked the 5th... the 4th here)
    for (let i = 0; i < 4; i++) await expect(service.login({ phone: BOSS.phone, password: WRONG })).rejects.toMatchObject({ status: 401 });
    expect((await service.login(BOSS)).accessToken).toBeTruthy();
  });

  it('AUTH-04: a wrong password does not call reset or remove', async () => {
    const reset = vi.spyOn(RateLimiter.prototype, 'reset');
    const remove = vi.spyOn(RateLimiter.prototype, 'remove');
    await expect(service.login({ phone: BOSS.phone, password: WRONG })).rejects.toMatchObject({ status: 401 });
    expect(reset).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
