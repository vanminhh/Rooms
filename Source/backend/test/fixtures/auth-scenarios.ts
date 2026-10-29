// Bodies of the 9 BE-LOGIN-24 scenarios (PLAN.md CP-7), shared by two files:
//   - src/modules/auth/auth.flow.spec.ts  runs them against the in-memory Prisma fake (part of `npm run test`);
//   - test/auth.e2e-spec.ts               runs the same bodies against the dev database (only after the draft is applied).
// So the e2e logic is exercised by the fake run before it ever touches a real DB.
// Every function takes a ready Nest app (configureApp applied, AuthProbeController registered) and uses HTTP only.
// Each scenario leaves the dev accounts as it found them (passwords restored) so the order of tests does not matter.
// Credentials come from DEV_ACCOUNTS (prisma/seed.ts); error bodies from 10-auth.md / 01-architecture.md.
import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { expect } from 'vitest';
import { DEV_ACCOUNTS, type DevAccount } from '../../prisma/seed.js';
import { Roles } from '../../src/common/guards/auth.decorators.js';

// Probe routes that exist only in tests: they give the global guards something to protect.
@Controller('t')
export class AuthProbeController {
  @Get('bare') bare() { return { ok: true }; }
  @Roles('TENANT') @Get('tenant') tenant() { return { ok: true }; }
  @Roles('BOSS', 'MANAGER') @Get('staff') staff() { return { ok: true }; }
}

const account = (key: DevAccount['key']): DevAccount => DEV_ACCOUNTS.find((a) => a.key === key)!;
const WRONG_PASSWORD = 'Sai-mat-khau-1';
const err = (code: string, message: string) => ({ error: { code, message } });
const INVALID_BODY = err('INVALID_CREDENTIALS', 'Số điện thoại hoặc mật khẩu không đúng');
const LOCKED_BODY = err('ACCOUNT_LOCKED', 'Tài khoản đã bị khóa. Liên hệ quản lý.');
const TOO_MANY_BODY = err('TOO_MANY_REQUESTS', 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau');
const PCR_BODY = err('PASSWORD_CHANGE_REQUIRED', 'Bạn cần đổi mật khẩu trước khi tiếp tục');
const FORBIDDEN_BODY = err('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này');
const UNAUTHENTICATED_BODY = err('UNAUTHENTICATED', 'Bạn cần đăng nhập để tiếp tục');

interface Opts { token?: string; cookie?: string }
function send(app: INestApplication, method: 'get' | 'post' | 'patch', path: string, body?: object, { token, cookie }: Opts = {}) {
  let req = request(app.getHttpServer())[method](`/api/v1${path}`);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  if (cookie) req = req.set('Cookie', `rt=${cookie}`);
  return body === undefined ? req : req.send(body);
}

const login = (app: INestApplication, phone: string, password: string) => send(app, 'post', '/auth/login', { phone, password });
const rtOf = (res: request.Response): string => {
  const c = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((h) => h.startsWith('rt='));
  if (!c) throw new Error('response has no rt cookie');
  return c.split(';')[0].slice('rt='.length);
};
async function loginOk(app: INestApplication, a: DevAccount) {
  const res = await login(app, a.phone, a.password);
  expect(res.status, `login ${a.key}`).toBe(200);
  return { token: res.body.data.accessToken as string, cookie: rtOf(res) };
}
async function changePassword(app: INestApplication, s: { token: string; cookie: string }, currentPassword: string, newPassword: string) {
  const res = await send(app, 'post', '/auth/change-password', { currentPassword, newPassword }, s);
  expect(res.status, 'change-password').toBe(200);
  expect(res.body).toEqual({ data: null });
}

export async function eachRoleLogsIn(app: INestApplication) {
  for (const key of ['boss', 'manager1', 'manager2', 'tenant'] as const) {
    const a = account(key);
    const res = await login(app, a.phone, a.password);
    expect(res.status, key).toBe(200);
    expect(res.body.data.user.role, key).toBe(a.role);
    expect(res.body.data.user.phone, key).toBe(a.phone);
    const me = await send(app, 'get', '/auth/me', undefined, { token: res.body.data.accessToken });
    expect(me.status, `${key} token works`).toBe(200);
    expect(me.body.data.role, key).toBe(a.role);
  }
}

export async function wrongPasswordEqualsUnknownPhone(app: INestApplication) {
  const wrong = await login(app, account('boss').phone, WRONG_PASSWORD);
  const unknown = await login(app, '0999999998', WRONG_PASSWORD); // not 0999999999: that one is for the AUTH-04 scenario
  expect(wrong.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(wrong.body).toEqual(INVALID_BODY);
  expect(unknown.body).toEqual(wrong.body);
  expect(wrong.headers['set-cookie']).toBeUndefined();
  expect(unknown.headers['set-cookie']).toBeUndefined();
}

export async function inactiveTenantLocked(app: INestApplication) {
  const a = account('lockedTenant');
  const res = await login(app, a.phone, a.password);
  expect(res.status).toBe(403);
  expect(res.body).toEqual(LOCKED_BODY);
  expect(res.headers['set-cookie']).toBeUndefined();
}

export async function sixthFailureIs429(app: INestApplication) {
  const unknownPhone = '0999999999'; // keeps the real dev accounts out of the lock-out
  for (let i = 1; i <= 5; i++) {
    const res = await login(app, unknownPhone, WRONG_PASSWORD);
    expect(res.status, `failure #${i}`).toBe(401);
    expect(res.body, `failure #${i}`).toEqual(INVALID_BODY);
  }
  const sixth = await login(app, unknownPhone, WRONG_PASSWORD);
  expect(sixth.status).toBe(429);
  expect(sixth.body).toEqual(TOO_MANY_BODY);
}

export async function flaggedTenantUntilPasswordChanged(app: INestApplication) {
  const t = account('tenant');
  const next = 'MatKhauMoi@1';
  expect(t.mustChangePassword).toBe(true); // the seed starts this tenant flagged
  const s = await loginOk(app, t);

  // logout is allowed while flagged (a second session, so s stays alive)
  const other = await loginOk(app, t);
  expect((await send(app, 'post', '/auth/logout', undefined, { cookie: other.cookie })).status).toBe(200);

  const me = await send(app, 'get', '/auth/me', undefined, { token: s.token });
  expect(me.status).toBe(200);
  expect(me.body.data.mustChangePassword).toBe(true);
  // body {} on PATCH: the seed does not restore email/contact fields, so the scenario must not change them
  for (const [method, path, body] of [['patch', '/auth/me', {}], ['get', '/t/tenant', undefined], ['get', '/t/staff', undefined], ['get', '/t/bare', undefined]] as const) {
    const res = await send(app, method, path, body, { token: s.token });
    expect(res.status, `${method} ${path}`).toBe(403);
    expect(res.body, `${method} ${path}`).toEqual(PCR_BODY);
  }

  await changePassword(app, s, t.password, next);

  expect((await send(app, 'patch', '/auth/me', {}, { token: s.token })).status).toBe(200);
  expect((await send(app, 'get', '/t/tenant', undefined, { token: s.token })).status).toBe(200);
  const staff = await send(app, 'get', '/t/staff', undefined, { token: s.token });
  expect(staff.status).toBe(403);
  expect(staff.body).toEqual(FORBIDDEN_BODY); // role check now reached: a tenant is not staff
  expect((await send(app, 'get', '/auth/me', undefined, { token: s.token })).body.data.mustChangePassword).toBe(false);

  await changePassword(app, s, next, t.password); // restore the dev password for the other scenarios
  expect((await send(app, 'post', '/auth/logout', undefined, { cookie: s.cookie })).status).toBe(200);
  expect((await send(app, 'post', '/auth/refresh', undefined, { cookie: s.cookie })).status).toBe(401);
}

export async function publicContactWithoutLogin(app: INestApplication) {
  const res = await send(app, 'get', '/public/contact'); // no Authorization header
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    data: { phone: '0900000001', zaloUrl: 'https://zalo.me/0900000001', facebookUrl: 'https://facebook.com/tro.thong.minh' },
  });
}

export async function refreshRotates(app: INestApplication) {
  const first = await login(app, account('boss').phone, account('boss').password);
  expect(first.status).toBe(200);
  const oldCookie = rtOf(first);

  const rotated = await send(app, 'post', '/auth/refresh', undefined, { cookie: oldCookie });
  expect(rotated.status).toBe(200);
  expect(Object.keys(rotated.body.data)).toEqual(['accessToken']);
  const newCookie = rtOf(rotated);
  expect(newCookie).not.toBe(oldCookie);
  expect((await send(app, 'get', '/auth/me', undefined, { token: rotated.body.data.accessToken })).status).toBe(200);

  const replay = await send(app, 'post', '/auth/refresh', undefined, { cookie: oldCookie });
  expect(replay.status).toBe(401);
  expect(replay.body).toEqual(UNAUTHENTICATED_BODY);
  expect((await send(app, 'post', '/auth/refresh', undefined, { cookie: newCookie })).status).toBe(200); // the new one works
}

export async function changePasswordRevokesOtherSessions(app: INestApplication) {
  // manager1 (not the flagged tenant) so this scenario does not depend on the AUTH-05 one
  const m = account('manager1');
  const next = 'MatKhauMoi@2';
  const a = await loginOk(app, m);
  const b = await loginOk(app, m);

  await changePassword(app, a, m.password, next);

  const bRefresh = await send(app, 'post', '/auth/refresh', undefined, { cookie: b.cookie });
  expect(bRefresh.status).toBe(401);
  expect(bRefresh.body).toEqual(UNAUTHENTICATED_BODY);
  const aRefresh = await send(app, 'post', '/auth/refresh', undefined, { cookie: a.cookie });
  expect(aRefresh.status).toBe(200); // the session that changed the password stays
  expect((await login(app, m.phone, next)).status).toBe(200); // the new password really took effect

  await changePassword(app, { token: aRefresh.body.data.accessToken, cookie: rtOf(aRefresh) }, next, m.password); // restore
}

export async function routeWithoutDecoratorsDenied(app: INestApplication) {
  const anonymous = await send(app, 'get', '/t/bare');
  expect(anonymous.status).toBe(401);
  expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);

  const boss = await loginOk(app, account('boss'));
  const denied = await send(app, 'get', '/t/bare', undefined, { token: boss.token });
  expect(denied.status).toBe(403);
  expect(denied.body).toEqual(FORBIDDEN_BODY);
}
