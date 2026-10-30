import { createHash, randomBytes } from 'node:crypto';

// 32 random bytes, 43 base64url characters. Only sha256Hex(token) is stored (AUTH-T2).
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
