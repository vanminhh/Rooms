import { createHmac, timingSafeEqual } from 'node:crypto';

// AUTH-T3: a salted password-hash change permanently invalidates older access tokens.
// The keyed version reveals neither the password nor its stored Argon2 hash.
export function credentialVersion(userId: number, passwordHash: string, secret = process.env.JWT_SECRET): string {
  if (!secret) throw new Error('JWT_SECRET is required');
  return createHmac('sha256', secret)
    .update('rooms:access-credential:v1\0')
    .update(String(userId))
    .update('\0')
    .update(passwordHash)
    .digest('base64url');
}

export function matchesCredentialVersion(version: unknown, userId: number, passwordHash: string): boolean {
  if (typeof version !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(version)) return false;
  const expected = Buffer.from(credentialVersion(userId, passwordHash), 'utf8');
  return timingSafeEqual(Buffer.from(version, 'utf8'), expected);
}
