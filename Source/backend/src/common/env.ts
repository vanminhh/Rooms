import { decodeCccdKey } from './crypto/cccd.js';

// BANK_WEBHOOK_SECRET remains optional until its provider is chosen.
export const REQUIRED_ENV: readonly string[] = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'APP_URL', 'NODE_ENV', 'CCCD_KEY'];

// A weak secret lets anyone forge a token for any role.
export const JWT_SECRET_MIN_LENGTH = 32;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    // Names only, never values (they may be secrets).
    throw new Error(
      `Thiếu biến môi trường: ${missing.join(', ')} (xem ../.env)`,
    );
  }
  if (env.JWT_SECRET!.trim().length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(`JWT_SECRET phải dài ít nhất ${JWT_SECRET_MIN_LENGTH} ký tự (xem ../.env)`);
  }
  if (!['development', 'test', 'production'].includes(env.NODE_ENV!)) {
    throw new Error('NODE_ENV phải là development, test hoặc production');
  }
  decodeCccdKey(env.CCCD_KEY);
}
