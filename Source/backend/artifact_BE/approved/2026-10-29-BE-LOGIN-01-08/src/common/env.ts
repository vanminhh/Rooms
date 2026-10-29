// Later parts add their own variables here (part 2 adds JWT_SECRET).
export const REQUIRED_ENV: readonly string[] = ['DATABASE_URL', 'DIRECT_URL'];

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    // Names only, never values (they may be secrets).
    throw new Error(
      `Thiếu biến môi trường: ${missing.join(', ')} (xem .env.example)`,
    );
  }
}
