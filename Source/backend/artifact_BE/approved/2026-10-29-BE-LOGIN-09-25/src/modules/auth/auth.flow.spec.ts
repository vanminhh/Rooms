import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import * as scenario from '../../../test/fixtures/auth-scenarios.js';
import { AuthProbeController } from '../../../test/fixtures/auth-scenarios.js';
import { createFakePrisma } from '../../../test/fixtures/fake-prisma.js';

// BE-LOGIN-24: the same 9 scenarios as test/auth.e2e-spec.ts (same bodies, test/fixtures/auth-scenarios.ts),
// run here against the in-memory Prisma fake. Outside edge replaced: PrismaService (the DB). Everything else is real:
// AppModule, the 3 global guards, AuthController/AuthService/RateLimiter, TokenService, argon2, configureApp.
// A new app and a new fake per test, so AUTH-04 counters and password changes never leak between tests.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let app: INestApplication;
let savedSecret: string | undefined;

beforeEach(async () => {
  savedSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'auth-flow-spec-secret-0123456789abcdef-01';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [AuthProbeController] })
    .overrideProvider(PrismaService)
    .useValue(await createFakePrisma())
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
});

afterEach(async () => {
  await app.close();
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

describe('BE-LOGIN-24: auth flow scenarios on the Prisma fake', () => {
  it('AUTH-01: each seeded active role logs in (fake)', () => scenario.eachRoleLogsIn(app));
  it('AUTH-01: wrong password and unknown phone give the same error (fake)', () => scenario.wrongPasswordEqualsUnknownPhone(app));
  it('AUTH-02: inactive tenant gets ACCOUNT_LOCKED (fake)', () => scenario.inactiveTenantLocked(app));
  it('AUTH-04: 6th failed attempt gets 429 (fake)', () => scenario.sixthFailureIs429(app));
  it(
    'AUTH-05: flagged tenant is blocked except change-password, logout, me until the password is changed (fake)',
    () => scenario.flaggedTenantUntilPasswordChanged(app),
  );
  it('AUTH-10: /public/contact works without login and returns the seeded Boss contact (fake)', () => scenario.publicContactWithoutLogin(app));
  it('AUTH-T2: refresh rotates and the old refresh token no longer works (fake)', () => scenario.refreshRotates(app));
  it("AUTH-T3: after change-password, other sessions' refresh fails (fake)", () => scenario.changePasswordRevokesOtherSessions(app));
  it('SCOPE-01: a route without decorators is denied (fake)', () => scenario.routeWithoutDecoratorsDenied(app));
});
