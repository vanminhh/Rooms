import { createDecipheriv } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { encryptCccd, last4 } from './cccd.js';

const key = Buffer.alloc(32, 7);
const env = { CCCD_KEY: key.toString('base64') };
const number = '001203004567';

// Decryption is test-only until a later task needs to show the full number.
function decryptForTest(value: string): string {
  const [version, iv, ciphertext, tag] = value.split(':');
  if (version !== 'v1') throw new Error('unknown version');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

describe('BE-P3-02 / CON-04: CCCD encryption', () => {
  it('CON-04: AES-256-GCM ciphertext round trips using the configured 32-byte key', () => {
    const encrypted = encryptCccd(number, env);
    expect(encrypted).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(encrypted).not.toContain(number);
    expect(decryptForTest(encrypted)).toBe(number);
  });

  it('CON-04: a random IV makes two encryptions of the same number differ', () => {
    const first = encryptCccd(number, env);
    const second = encryptCccd(number, env);
    expect(first).not.toBe(second);
    expect(first.split(':')[1]).not.toBe(second.split(':')[1]);
    expect(decryptForTest(first)).toBe(number);
    expect(decryptForTest(second)).toBe(number);
  });

  it('CON-04: changing the ciphertext causes authentication to fail', () => {
    const parts = encryptCccd(number, env).split(':');
    const bytes = Buffer.from(parts[2], 'base64');
    bytes[0] ^= 1;
    parts[2] = bytes.toString('base64');
    expect(() => decryptForTest(parts.join(':'))).toThrow();
  });

  it('CON-04: last4 exposes only the final four digits', () => {
    expect(last4(number)).toBe('4567');
    expect(() => last4('not-a-number')).toThrow();
  });

  it('Q-P3-4: missing, wrong-length and malformed CCCD_KEY are refused without revealing values', () => {
    for (const value of [undefined, Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64'), 'secret-invalid']) {
      try {
        encryptCccd(number, { CCCD_KEY: value });
        throw new Error('Expected invalid key to fail');
      } catch (error) {
        expect((error as Error).message).toContain('CCCD_KEY');
        if (value) expect((error as Error).message).not.toContain(value);
      }
    }
  });

  it('CON-04: encryption emits no key or CCCD in logs', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      encryptCccd(number, env);
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});
