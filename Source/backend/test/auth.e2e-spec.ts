// BE-LOGIN-24: e2e on the DEV database. DO NOT RUN before the draft is approved and applied (PLAN.md section 0, 5):
// seed() resets the 5 dev accounts, and the scenarios create sessions and change last_login_at.
// The scenario bodies are shared with src/modules/auth/auth.flow.spec.ts, which runs them on the Prisma fake.
import { existsSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import { seed } from '../prisma/seed.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import * as scenario from './fixtures/auth-scenarios.js';
import { AuthProbeController } from './fixtures/auth-scenarios.js';

if (existsSync('.env')) process.loadEnvFile('.env'); // DATABASE_URL, DIRECT_URL, JWT_SECRET of the dev setup

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

describe('BE-LOGIN-24: auth flow on the real AppModule and the dev database (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [AuthProbeController] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    await seed(app.get(PrismaService)); // Q6 = A: the 5 dev accounts start exactly as the seed defines them
  });

  afterAll(async () => {
    if (!app) return;
    await seed(app.get(PrismaService)); // put the accounts back (passwords, mustChangePassword, isActive)
    await app.close();
  });

  it('AUTH-01: each seeded active role logs in', () => scenario.eachRoleLogsIn(app));
  it('AUTH-01: wrong password and unknown phone give the same error', () => scenario.wrongPasswordEqualsUnknownPhone(app));
  it('AUTH-02: inactive tenant gets ACCOUNT_LOCKED', () => scenario.inactiveTenantLocked(app));
  it('AUTH-04: 6th failed attempt gets 429', () => scenario.sixthFailureIs429(app));
  it(
    'AUTH-05: flagged tenant is blocked except change-password, logout, me until the password is changed',
    () => scenario.flaggedTenantUntilPasswordChanged(app),
  );
  it('AUTH-10: /public/contact works without login and returns the seeded Boss contact', () => scenario.publicContactWithoutLogin(app));
  it('AUTH-T2: refresh rotates and the old refresh token no longer works', () => scenario.refreshRotates(app));
  it("AUTH-T3: after change-password, other sessions' refresh fails", () => scenario.changePasswordRevokesOtherSessions(app));
  it('SCOPE-01: a route without decorators is denied', () => scenario.routeWithoutDecoratorsDenied(app));
});
