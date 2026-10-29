// Later parts add their own variables here (CCCD_KEY, BANK_WEBHOOK_SECRET, ... are not required yet).
export const REQUIRED_ENV: readonly string[] = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'APP_URL'];

// A weak secret lets anyone forge a token for any role.
export const JWT_SECRET_MIN_LENGTH = 32;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    // Names only, never values (they may be secrets).
    throw new Error(
      `Thiếu biến môi trường: ${missing.join(', ')} (xem .env.example)`,
    );
  }
  if (env.JWT_SECRET!.trim().length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(`JWT_SECRET phải dài ít nhất ${JWT_SECRET_MIN_LENGTH} ký tự (xem .env.example)`);
  }
}
