import { randomToken, sha256Hex } from './token.js';

describe('AUTH-T2 / BE-LOGIN-10: opaque refresh token helpers', () => {
  it('AUTH-T2: randomToken() is 43 base64url characters (32 bytes)', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('AUTH-T2: 1000 calls of randomToken() give 1000 different values', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(randomToken());
    expect(seen.size).toBe(1000);
  });

  it('AUTH-T2: sha256Hex("abc") is the standard SHA-256 test vector', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('AUTH-T2: sha256Hex("") is the SHA-256 of the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('AUTH-T2: sha256Hex is 64 lowercase hex characters, deterministic, and differs per input', () => {
    const token = randomToken();
    expect(sha256Hex(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(token)).toBe(sha256Hex(token));
    expect(sha256Hex(token)).not.toBe(sha256Hex(`${token}x`));
  });

  it('AUTH-T2: the stored hash does not reveal the token', () => {
    const token = randomToken();
    expect(sha256Hex(token)).not.toContain(token);
  });
});
