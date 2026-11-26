import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakePrisma } from '../../../test/fixtures/fake-prisma.js';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { RateLimiter } from './rate-limiter.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const CLIENT_IP = '1.2.3.4';
const WRONG_PASSWORD = 'test-wrong-password';

let app: INestApplication | undefined;

async function startApp(hops: '0' | '1'): Promise<void> {
  vi.stubEnv('TRUST_PROXY_HOPS', hops);
  vi.stubEnv('JWT_SECRET', 'auth-login-proxy-fixture-secret-1234567890');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(await createFakePrisma())
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
}

afterEach(async () => {
  try {
    await app?.close();
  } finally {
    app = undefined;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});

const login = (phone: string, password: string, ip = CLIENT_IP) =>
  request(app!.getHttpServer())
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ phone, password });

const unknownPhone = (suffix: number) => `099999${String(suffix).padStart(4, '0')}`;

describe('DEP-04 / AUTH-04: login IP behind a proxy', () => {
  it('DEP-04: with zero hops the login limiter records the socket IP', async () => {
    await startApp('0');
    const record = vi.spyOn(RateLimiter.prototype, 'record');
    const phone = unknownPhone(0);
    expect((await login(phone, WRONG_PASSWORD)).status).toBe(401);
    expect(record.mock.calls.map(([key]) => key)).toEqual([
      phone,
      expect.stringMatching(/^(?:127\.0\.0\.1|::ffff:127\.0\.0\.1|::1)$/),
    ]);
  });

  it('DEP-04 / AUTH-04: one hop uses the forwarded IP and preserves its failures across a successful login', async () => {
    await startApp('1');
    const record = vi.spyOn(RateLimiter.prototype, 'record');
    const first = await login(unknownPhone(0), WRONG_PASSWORD);
    expect(first.status).toBe(401);
    expect(record.mock.calls.map(([key]) => key)).toEqual([unknownPhone(0), CLIENT_IP]);

    const failures = await Promise.all(
      Array.from({ length: 18 }, (_, index) => login(unknownPhone(index + 1), WRONG_PASSWORD)),
    );
    expect(failures.map(({ status }) => status)).toEqual(Array(18).fill(401));
    expect((await login('0900000001', 'Boss@2026')).status).toBe(200);

    const next = await Promise.all([
      login(unknownPhone(19), WRONG_PASSWORD),
      login(unknownPhone(20), WRONG_PASSWORD),
    ]);
    expect(next.map(({ status }) => status).sort((a, b) => a - b)).toEqual([401, 429]);
    expect((await login(unknownPhone(21), WRONG_PASSWORD, '5.6.7.8')).status).toBe(401);
  });
});
