import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { createFakePrisma, type FakePrisma } from '../../../test/fixtures/fake-prisma.js';

// AUTH-16, D-43 (owner 20/11/2026): login by entry. Expected values come from docs/spec/10-auth.md AUTH-16 and the
// table of docs/change-login-portal/PLAN.md §3, not from the code under test.
// Outside edge replaced: PrismaService -> in-memory fake (the DB). Real: AppModule, guards, AuthController, AuthService, argon2.

const SECRET = 'auth-login-portal-spec-secret-0123456789-01';
const ACCOUNTS = {
  boss: { phone: '0900000001', password: 'Boss@2026' },
  manager: { phone: '0900000002', password: 'QuanLy1@2026' },
  tenant: { phone: '0900000004', password: 'NguoiThue@2026' },
  locked: { phone: '0900000005', password: 'TamKhoa@2026' },
  guest: { phone: '0900000006', password: 'Khach@2026' },
} as const;
const WRONG_PORTAL_VI = 'Tài khoản này không đăng nhập được ở lối vào này. Hãy chọn đúng lối vào hoặc dùng trang đăng nhập chung.';
const WRONG_PORTAL_BODY = { error: { code: 'WRONG_PORTAL', message: WRONG_PORTAL_VI } };

let app: INestApplication;
let fake: FakePrisma;
let savedSecret: string | undefined;

beforeEach(async () => {
  savedSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
  fake = await createFakePrisma();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(fake).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
});

afterEach(async () => {
  await app.close();
  if (savedSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedSecret;
});

const login = (body: object, lang?: string) => {
  const req = request(app.getHttpServer()).post('/api/v1/auth/login');
  return (lang ? req.set('Accept-Language', lang) : req).send(body);
};

type Who = keyof typeof ACCOUNTS;
const CASES: [Who, 'TENANT' | 'STAFF' | undefined, 'ok' | 'WRONG_PORTAL'][] = [
  ['boss', undefined, 'ok'], ['boss', 'TENANT', 'WRONG_PORTAL'], ['boss', 'STAFF', 'ok'],
  ['manager', undefined, 'ok'], ['manager', 'TENANT', 'WRONG_PORTAL'], ['manager', 'STAFF', 'ok'],
  ['tenant', undefined, 'ok'], ['tenant', 'TENANT', 'ok'], ['tenant', 'STAFF', 'WRONG_PORTAL'],
  ['guest', undefined, 'ok'], ['guest', 'TENANT', 'WRONG_PORTAL'], ['guest', 'STAFF', 'WRONG_PORTAL'],
];

describe('AUTH-16: role x entry', () => {
  it.each(CASES)('AUTH-16: %s at entry %s -> %s', async (who, portal, expected) => {
    const res = await login({ ...ACCOUNTS[who], ...(portal ? { portal } : {}) });
    if (expected === 'ok') {
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      return;
    }
    expect(res.status).toBe(403);
    expect(res.body).toEqual(WRONG_PORTAL_BODY);
  });
});

describe('AUTH-16: a refused login leaves nothing behind', () => {
  it('AUTH-16: no session row, no refresh cookie, last_login_at unchanged', async () => {
    const before = fake.account('manager1').lastLoginAt;
    const res = await login({ ...ACCOUNTS.manager, portal: 'TENANT' });
    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(fake.db.session).toHaveLength(0);
    expect(fake.account('manager1').lastLoginAt).toEqual(before);
  });

  it('AUTH-16, AUTH-04: 6 refused logins in a row are not failed attempts (no 429), and the right entry still works after them', async () => {
    for (let i = 0; i < 6; i++) expect((await login({ ...ACCOUNTS.tenant, portal: 'STAFF' })).status).toBe(403);
    expect((await login({ ...ACCOUNTS.tenant, portal: 'TENANT' })).status).toBe(200);
  });
});

describe('AUTH-16: the entry never reveals an account', () => {
  it('AUTH-01: a wrong password or an unknown phone at either entry gets INVALID_CREDENTIALS, not WRONG_PORTAL', async () => {
    for (const portal of ['TENANT', 'STAFF'] as const) {
      for (const body of [{ phone: ACCOUNTS.manager.phone, password: 'Sai-mat-khau-1' }, { phone: '0999999999', password: 'Sai-mat-khau-1' }]) {
        const res = await login({ ...body, portal });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      }
    }
  });

  it('AUTH-02: a locked tenant at the tenant entry and at the staff entry gets ACCOUNT_LOCKED (the lock is checked first)', async () => {
    for (const portal of ['TENANT', 'STAFF'] as const) {
      const res = await login({ ...ACCOUNTS.locked, portal });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    }
  });

  it('AUTH-16, AUTH-12: an unverified self-registered guest at an entry gets WRONG_PORTAL, without an entry EMAIL_NOT_VERIFIED', async () => {
    fake.account('guest').emailVerifiedAt = null;
    expect((await login({ ...ACCOUNTS.guest, portal: 'TENANT' })).body.error.code).toBe('WRONG_PORTAL');
    expect((await login(ACCOUNTS.guest)).body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('AUTH-16: validation and language', () => {
  it.each([['ADMIN'], ['tenant'], [''], [1], [null]])('AUTH-16: portal %j -> 400 VALIDATION_FAILED on fields.portal', async (portal) => {
    const res = await login({ ...ACCOUNTS.tenant, portal });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.portal).toBe('Lối vào không hợp lệ');
  });

  it('LOC-02, AUTH-16: with Accept-Language en the text is English and the code is unchanged', async () => {
    const res = await login({ ...ACCOUNTS.manager, portal: 'TENANT' }, 'en');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('WRONG_PORTAL');
    expect(res.body.error.message).toBe('This account cannot sign in through this entry. Choose the right entry or use the general sign-in page.');
  });
});
