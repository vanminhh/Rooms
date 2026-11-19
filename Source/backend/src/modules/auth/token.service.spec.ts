import { JwtService } from '@nestjs/jwt';
import { credentialVersion } from '../../common/crypto/credential-version.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TTL_REMEMBER_MS,
  REFRESH_TTL_SESSION_MS,
  TokenService,
} from './token.service.js';

// TokenService runs against the real JwtService (no mock). Only the clock is faked
// (an outside edge) and process.env.JWT_SECRET is set by the test and restored after.
const SECRET = 'test-only-secret-0123456789abcdef0123';
const OTHER_SECRET = 'another-secret-0123456789abcdef012345';
const PASSWORD_HASH = '$argon2id$test-only-stored-password-hash';
const fakeTokenDb = () => ({ user: { findUnique: vi.fn(async () => ({ passwordHash: PASSWORD_HASH })) } });

const b64url = (value: object | string) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

describe('AUTH-T1 / BE-LOGIN-10: access token (JWT)', () => {
  const jwt = new JwtService();
  const db = fakeTokenDb();
  const tokens = new TokenService(jwt, db as unknown as PrismaService);
  let savedSecret: string | undefined;

  beforeEach(() => {
    savedSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = SECRET;
    db.user.findUnique.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (savedSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = savedSecret;
  });

  it('AUTH-T1: ACCESS_TOKEN_TTL_SECONDS is 900', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
  });

  it('AUTH-T1: token of {id:12, role:MANAGER} has sub "12", role MANAGER and exp - iat = 900', async () => {
    const token = await tokens.signAccessToken({ id: 12, role: 'MANAGER' });
    const payload = await jwt.verifyAsync<{ sub: string; role: string; iat: number; exp: number }>(token, {
      secret: SECRET,
    });
    expect(payload.sub).toBe('12');
    expect(typeof payload.sub).toBe('string');
    expect(payload.role).toBe('MANAGER');
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('AUTH-T1: the header algorithm is HS256', async () => {
    const token = await tokens.signAccessToken({ id: 12, role: 'MANAGER' });
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')) as { alg: string };
    expect(header.alg).toBe('HS256');
  });

  it('AUTH-T1 / AUTH-T3: payload has only sub, role, cv, iat, exp; cv reveals no password hash', async () => {
    const token = await tokens.signAccessToken({ id: 3, role: 'BOSS' });
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['cv', 'exp', 'iat', 'role', 'sub']);
    expect(payload.cv).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(payload)).not.toContain(PASSWORD_HASH);
    expect(payload.cv).not.toBe(PASSWORD_HASH);
  });

  it('AUTH-T3: internal id/role issuance reads the current stored hash', async () => {
    const token = await tokens.signAccessToken({ id: 12, role: 'MANAGER' });
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: 12 }, select: { passwordHash: true } });
    expect((await tokens.verifyAccessToken(token)).cv).toBe(credentialVersion(12, PASSWORD_HASH));
  });

  it('AUTH-T3: uses the authenticated hash snapshot instead of rereading a password changed by staff', async () => {
    const verifiedHash = '$argon2id$the-login-snapshot-before-reset';
    const token = await tokens.signAccessToken({ id: 12, role: 'MANAGER', passwordHash: verifiedHash });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect((await tokens.verifyAccessToken(token)).cv).toBe(credentialVersion(12, verifiedHash));
    expect((await tokens.verifyAccessToken(token)).cv).not.toBe(credentialVersion(12, PASSWORD_HASH));
  });

  it('AUTH-T3: credential versions change with the user id and the salted hash', async () => {
    const first = await tokens.verifyAccessToken(await tokens.signAccessToken({ id: 1, role: 'TENANT', passwordHash: PASSWORD_HASH }));
    const otherUser = await tokens.verifyAccessToken(await tokens.signAccessToken({ id: 2, role: 'TENANT', passwordHash: PASSWORD_HASH }));
    const changed = await tokens.verifyAccessToken(await tokens.signAccessToken({ id: 1, role: 'TENANT', passwordHash: PASSWORD_HASH + '-new-salt' }));
    expect(first.cv).not.toBe(otherUser.cv);
    expect(first.cv).not.toBe(changed.cv);
  });

  it.each([undefined, null, 123, '', 'short', 'x'.repeat(44)])('AUTH-T3: a signed token with invalid credential version %j is rejected', async (cv) => {
    const token = await jwt.signAsync({ sub: '1', role: 'BOSS', cv }, { secret: SECRET, algorithm: 'HS256', expiresIn: 900 });
    await expect(tokens.verifyAccessToken(token)).rejects.toThrow('Invalid access credential version');
  });

  it.each(['BOSS', 'MANAGER', 'TENANT'] as const)('AUTH-T1: verifyAccessToken round-trips role %s', async (role) => {
    const token = await tokens.signAccessToken({ id: 7, role });
    await expect(tokens.verifyAccessToken(token)).resolves.toMatchObject({ sub: '7', role });
  });

  it('AUTH-T1: verifyAccessToken throws for a token signed with another secret', async () => {
    const forged = await jwt.signAsync({ sub: '1', role: 'BOSS' }, { secret: OTHER_SECRET, algorithm: 'HS256' });
    await expect(tokens.verifyAccessToken(forged)).rejects.toThrow();
  });

  it('AUTH-T1: a token is accepted at 14:59 and rejected at 15:01 (expired)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-29T10:00:00+07:00'));
    const token = await tokens.signAccessToken({ id: 1, role: 'BOSS' });

    vi.setSystemTime(new Date('2026-10-29T10:14:59+07:00'));
    await expect(tokens.verifyAccessToken(token)).resolves.toMatchObject({ sub: '1' });

    vi.setSystemTime(new Date('2026-10-29T10:15:01+07:00'));
    await expect(tokens.verifyAccessToken(token)).rejects.toThrow();
  });

  it('AUTH-T1: a token with alg "none" is rejected', async () => {
    const none = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: '1', role: 'BOSS' })}.`;
    await expect(tokens.verifyAccessToken(none)).rejects.toThrow();
  });

  it('AUTH-T1: a token signed with the right secret but another algorithm (HS512) is rejected', async () => {
    const hs512 = await jwt.signAsync({ sub: '1', role: 'BOSS' }, { secret: SECRET, algorithm: 'HS512', expiresIn: 900 });
    await expect(tokens.verifyAccessToken(hs512)).rejects.toThrow();
  });

  it('AUTH-T1: a tampered payload (TENANT -> BOSS) with the old signature is rejected', async () => {
    const token = await tokens.signAccessToken({ id: 5, role: 'TENANT' });
    const [header, , signature] = token.split('.');
    const payload = b64url({ sub: '5', role: 'BOSS', iat: 1, exp: 99999999999 });
    await expect(tokens.verifyAccessToken(`${header}.${payload}.${signature}`)).rejects.toThrow();
  });

  it.each(['', 'garbage', 'a.b.c', 'only.two'])('AUTH-T1: junk string %j is rejected', async (junk) => {
    await expect(tokens.verifyAccessToken(junk)).rejects.toThrow();
  });

  it('AUTH-T1: the secret is read on each call (a token made under another secret stops verifying)', async () => {
    const token = await tokens.signAccessToken({ id: 1, role: 'BOSS' });
    process.env.JWT_SECRET = OTHER_SECRET;
    await expect(tokens.verifyAccessToken(token)).rejects.toThrow();
    process.env.JWT_SECRET = SECRET;
    await expect(tokens.verifyAccessToken(token)).resolves.toMatchObject({ sub: '1' });
  });

  it('AUTH-T1: without JWT_SECRET nothing is signed (no unsigned/empty-secret token)', async () => {
    delete process.env.JWT_SECRET;
    await expect(tokens.signAccessToken({ id: 1, role: 'BOSS' })).rejects.toThrow();
  });
});

describe('AUTH-T2 / A-07 / BE-LOGIN-10: refresh expiry', () => {
  const tokens = new TokenService(new JwtService(), fakeTokenDb() as unknown as PrismaService);
  const t = new Date('2026-10-29T08:00:00.000Z');
  let savedTz: string | undefined;

  afterEach(() => {
    vi.useRealTimers();
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  });

  it('AUTH-T2: constants are 30 days and 12 hours in ms', () => {
    expect(REFRESH_TTL_REMEMBER_MS).toBe(2_592_000_000);
    expect(REFRESH_TTL_SESSION_MS).toBe(43_200_000);
  });

  it('AUTH-T2: refreshExpiresAt(true, t) = t + 2 592 000 000 ms', () => {
    expect(tokens.refreshExpiresAt(true, t).getTime()).toBe(t.getTime() + 2_592_000_000);
  });

  it('A-07: refreshExpiresAt(false, t) = t + 43 200 000 ms', () => {
    expect(tokens.refreshExpiresAt(false, t).getTime()).toBe(t.getTime() + 43_200_000);
  });

  it('AUTH-T2: it returns a new Date and does not mutate the input', () => {
    const input = new Date(t.getTime());
    const out = tokens.refreshExpiresAt(true, input);
    expect(out).not.toBe(input);
    expect(input.getTime()).toBe(t.getTime());
  });

  it('A-07: month end in Vietnam time (2026-10-31T23:30+07:00) -> 2026-11-01T11:30+07:00 / 2026-11-30T23:30+07:00', () => {
    const monthEnd = new Date('2026-10-31T23:30:00+07:00');
    expect(tokens.refreshExpiresAt(false, monthEnd).toISOString()).toBe(
      new Date('2026-11-01T11:30:00+07:00').toISOString(),
    );
    expect(tokens.refreshExpiresAt(true, monthEnd).toISOString()).toBe(
      new Date('2026-11-30T23:30:00+07:00').toISOString(),
    );
  });

  it.each(['UTC', 'Asia/Ho_Chi_Minh', 'America/New_York'])(
    'A-07: the month-end result does not depend on TZ=%s',
    (tz) => {
      savedTz = process.env.TZ;
      process.env.TZ = tz;
      const monthEnd = new Date('2026-10-31T16:30:00.000Z'); // 23:30 in Asia/Ho_Chi_Minh
      expect(tokens.refreshExpiresAt(false, monthEnd).toISOString()).toBe('2026-11-01T04:30:00.000Z');
      expect(tokens.refreshExpiresAt(true, monthEnd).toISOString()).toBe('2026-11-30T16:30:00.000Z');
    },
  );

  it('AUTH-T2: across a DST change the offset is still exactly 30 x 24h (no calendar math)', () => {
    savedTz = process.env.TZ;
    process.env.TZ = 'America/New_York'; // DST starts 2026-03-08
    const before = new Date('2026-03-01T12:00:00.000Z');
    expect(tokens.refreshExpiresAt(true, before).getTime() - before.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('AUTH-T2: without a "now" argument it uses the current clock', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(t);
    expect(tokens.refreshExpiresAt(true).getTime()).toBe(t.getTime() + 2_592_000_000);
    expect(tokens.refreshExpiresAt(false).getTime()).toBe(t.getTime() + 43_200_000);
  });
});
