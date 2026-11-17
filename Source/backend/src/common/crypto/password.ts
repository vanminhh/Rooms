import argon2 from 'argon2';

export const PASSWORD_MIN_LENGTH = 8; // AUTH-03
// CON-07: a new tenant has no usable password until their first contract is signed.
export const PENDING_TENANT_PASSWORD_HASH = '!pending-contract-tenant';

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

// A broken or empty hash is "no match", never an error.
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
