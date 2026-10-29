import { hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from './password.js';

// Real argon2 (no mock): the unit under test is the hashing itself.
describe('AUTH-03 / BE-LOGIN-09: password hashing', () => {
  it('AUTH-03: PASSWORD_MIN_LENGTH is 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it('BE-LOGIN-09: hashPassword("Boss@2026") starts with $argon2id$', async () => {
    const hash = await hashPassword('Boss@2026');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('BE-LOGIN-09: the hash does not contain the plain password', async () => {
    const hash = await hashPassword('Boss@2026');
    expect(hash).not.toContain('Boss@2026');
  });

  it('BE-LOGIN-09: verifyPassword is true for the same password', async () => {
    const hash = await hashPassword('Boss@2026');
    expect(await verifyPassword(hash, 'Boss@2026')).toBe(true);
  });

  it('BE-LOGIN-09: verifyPassword is false for a different password (Boss@2027)', async () => {
    const hash = await hashPassword('Boss@2026');
    expect(await verifyPassword(hash, 'Boss@2027')).toBe(false);
  });

  it('BE-LOGIN-09: verifyPassword is case sensitive and does not trim', async () => {
    const hash = await hashPassword('Boss@2026');
    expect(await verifyPassword(hash, 'boss@2026')).toBe(false);
    expect(await verifyPassword(hash, 'Boss@2026 ')).toBe(false);
    expect(await verifyPassword(hash, '')).toBe(false);
  });

  it('BE-LOGIN-09: two hashes of the same password differ (salt) and both verify', async () => {
    const a = await hashPassword('Boss@2026');
    const b = await hashPassword('Boss@2026');
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, 'Boss@2026')).toBe(true);
    expect(await verifyPassword(b, 'Boss@2026')).toBe(true);
  });

  it('BE-LOGIN-09: Unicode password "Mật khẩu@2026" hashes and verifies', async () => {
    const hash = await hashPassword('Mật khẩu@2026');
    expect(await verifyPassword(hash, 'Mật khẩu@2026')).toBe(true);
    expect(await verifyPassword(hash, 'Mat khau@2026')).toBe(false);
  });

  it('BE-LOGIN-09: verifyPassword("khong-phai-hash", "x") is false and does not throw', async () => {
    await expect(verifyPassword('khong-phai-hash', 'x')).resolves.toBe(false);
  });

  it('BE-LOGIN-09: verifyPassword("", "x") is false and does not throw', async () => {
    await expect(verifyPassword('', 'x')).resolves.toBe(false);
  });

  it('BE-LOGIN-09: a truncated argon2 hash is false, not an error', async () => {
    const hash = await hashPassword('Boss@2026');
    await expect(verifyPassword(hash.slice(0, 40), 'Boss@2026')).resolves.toBe(false);
  });
});
