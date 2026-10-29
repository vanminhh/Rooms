import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { JWT_SECRET_MIN_LENGTH, REQUIRED_ENV, validateEnv } from './env.js';

// validateEnv takes the env object as a parameter, so no mocking is needed:
// every test passes a plain object (nothing reads the real process.env).
const full = {
  DATABASE_URL: 'postgresql://u:p@h:5432/db',
  DIRECT_URL: 'postgresql://u:p@h:5432/db',
  JWT_SECRET: 'x'.repeat(40),
  APP_URL: 'http://localhost:5173',
};

const src = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

function messageOf(env: NodeJS.ProcessEnv): string {
  try {
    validateEnv(env);
  } catch (e) {
    return (e as Error).message;
  }
  return '';
}

describe('BE-LOGIN-03: validateEnv', () => {
  it('BE-LOGIN-03: REQUIRED_ENV is exactly DATABASE_URL, DIRECT_URL, JWT_SECRET, APP_URL (P10)', () => {
    expect([...REQUIRED_ENV]).toEqual(['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'APP_URL']);
  });

  it('BE-LOGIN-03: empty env throws the exact Vietnamese message with all 4 names', () => {
    expect(() => validateEnv({})).toThrow(
      new Error(
        'Thiếu biến môi trường: DATABASE_URL, DIRECT_URL, JWT_SECRET, APP_URL (xem .env.example)',
      ),
    );
    // toThrow(new Error(..)) compares message only; make the exact text explicit too
    expect(messageOf({})).toBe(
      'Thiếu biến môi trường: DATABASE_URL, DIRECT_URL, JWT_SECRET, APP_URL (xem .env.example)',
    );
  });

  it('BE-LOGIN-03: CCCD_KEY, BANK_WEBHOOK_SECRET, CLOUDINARY_URL, MAIL_FROM missing does not throw (D3)', () => {
    expect(() => validateEnv({ ...full })).not.toThrow();
  });

  it('BE-LOGIN-03: only DATABASE_URL missing names DATABASE_URL and not DIRECT_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = full;
    const message = messageOf(rest);
    expect(message).toBe('Thiếu biến môi trường: DATABASE_URL (xem .env.example)');
    expect(message).not.toContain('DIRECT_URL');
  });

  it('BE-LOGIN-03: only DIRECT_URL missing names DIRECT_URL and not DATABASE_URL', () => {
    const { DIRECT_URL: _omit, ...rest } = full;
    expect(messageOf(rest)).toBe('Thiếu biến môi trường: DIRECT_URL (xem .env.example)');
  });

  it('BE-LOGIN-03 (P10): only APP_URL missing names only APP_URL', () => {
    const { APP_URL: _omit, ...rest } = full;
    expect(messageOf(rest)).toBe('Thiếu biến môi trường: APP_URL (xem .env.example)');
  });

  it('BE-LOGIN-03 (P10): only JWT_SECRET missing names only JWT_SECRET (not the length message)', () => {
    const { JWT_SECRET: _omit, ...rest } = full;
    expect(messageOf(rest)).toBe('Thiếu biến môi trường: JWT_SECRET (xem .env.example)');
  });

  it('BE-LOGIN-03 boundary: empty string counts as missing', () => {
    expect(() => validateEnv({ ...full, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...full, APP_URL: '' })).toThrow(/APP_URL/);
  });

  it('BE-LOGIN-03 boundary: whitespace-only string counts as missing', () => {
    expect(() => validateEnv({ ...full, DIRECT_URL: '   ' })).toThrow(/DIRECT_URL/);
    expect(() => validateEnv({ ...full, DATABASE_URL: '\t\n ' })).toThrow(/DATABASE_URL/);
    expect(messageOf({ ...full, JWT_SECRET: '   ' })).toBe(
      'Thiếu biến môi trường: JWT_SECRET (xem .env.example)',
    );
  });

  it('BE-LOGIN-03: several blank values are listed in REQUIRED_ENV order', () => {
    expect(messageOf({ ...full, DATABASE_URL: '  ', DIRECT_URL: '' })).toBe(
      'Thiếu biến môi trường: DATABASE_URL, DIRECT_URL (xem .env.example)',
    );
    expect(messageOf({ ...full, DIRECT_URL: '', APP_URL: ' ' })).toBe(
      'Thiếu biến môi trường: DIRECT_URL, APP_URL (xem .env.example)',
    );
  });

  it('BE-LOGIN-03: all required present plus unknown extra variables does not throw', () => {
    expect(() => validateEnv({ ...full, SOMETHING_ELSE: 'x' })).not.toThrow();
  });

  it('BE-LOGIN-03 security: message never contains the value of a present variable', () => {
    const message = messageOf({ ...full, DATABASE_URL: '', DIRECT_URL: 'postgresql://user:SECRET123@h/db' });
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('SECRET123');
  });

  it('BE-LOGIN-03: with no argument it reads process.env (missing var -> throws, names only)', () => {
    const saved = { ...process.env };
    try {
      delete process.env.DATABASE_URL;
      process.env.DIRECT_URL = 'postgresql://u:TOPSECRET@h/db';
      process.env.JWT_SECRET = full.JWT_SECRET;
      process.env.APP_URL = full.APP_URL;
      let message = '';
      try {
        validateEnv();
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toBe('Thiếu biến môi trường: DATABASE_URL (xem .env.example)');
      expect(message).not.toContain('TOPSECRET');
    } finally {
      process.env = saved;
    }
  });
});

describe('BE-LOGIN-03 (P10): JWT_SECRET length', () => {
  const LENGTH_MESSAGE = 'JWT_SECRET phải dài ít nhất 32 ký tự (xem .env.example)';

  it('P10: JWT_SECRET_MIN_LENGTH is 32', () => {
    expect(JWT_SECRET_MIN_LENGTH).toBe(32);
  });

  it('P10: 31 characters -> throws the exact length message', () => {
    expect(messageOf({ ...full, JWT_SECRET: 'a'.repeat(31) })).toBe(LENGTH_MESSAGE);
  });

  it('P10: exactly 32 characters -> does not throw', () => {
    expect(() => validateEnv({ ...full, JWT_SECRET: 'a'.repeat(32) })).not.toThrow();
  });

  it('P10: 31 characters padded with spaces/newline on both ends still throws (length is trimmed)', () => {
    expect(messageOf({ ...full, JWT_SECRET: `  ${'a'.repeat(31)}\n` })).toBe(LENGTH_MESSAGE);
  });

  it('P10: 32 characters padded with whitespace does not throw', () => {
    expect(() => validateEnv({ ...full, JWT_SECRET: ` ${'a'.repeat(32)} ` })).not.toThrow();
  });

  it('P10 security: the length message never contains the secret value', () => {
    const secret = 'TopSecretValue-abc123';
    const message = messageOf({ ...full, JWT_SECRET: secret });
    expect(message).toBe(LENGTH_MESSAGE);
    expect(message).not.toContain(secret);
  });

  it('P10: the missing-variable message comes before the length check', () => {
    // short JWT_SECRET + missing APP_URL -> reports the missing variable
    const { APP_URL: _omit, ...rest } = full;
    expect(messageOf({ ...rest, JWT_SECRET: 'short' })).toBe(
      'Thiếu biến môi trường: APP_URL (xem .env.example)',
    );
  });

  it('P10: the sample value in .env.example does not pass the length check', () => {
    const parsed = parseEnv(src('../../.env.example'));
    expect(messageOf({ ...full, JWT_SECRET: parsed.JWT_SECRET })).toBe(LENGTH_MESSAGE);
  });
});

describe('BE-LOGIN-03: .env.example', () => {
  const parsed = parseEnv(src('../../.env.example'));

  it('BE-LOGIN-03: has exactly the 8 keys named by the feature', () => {
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'APP_URL',
        'BANK_WEBHOOK_SECRET',
        'CCCD_KEY',
        'CLOUDINARY_URL',
        'DATABASE_URL',
        'DIRECT_URL',
        'JWT_SECRET',
        'MAIL_FROM',
      ].sort(),
    );
  });

  it('BE-LOGIN-03: placeholder values only, no real Supabase host', () => {
    for (const [key, value] of Object.entries(parsed)) {
      expect(value, key).toBeTruthy();
      expect(value, key).not.toMatch(/supabase|pooler/i);
    }
    expect(parsed.DATABASE_URL).toContain('USER:PASSWORD');
    expect(parsed.DIRECT_URL).toContain('USER:PASSWORD');
  });

  it('BE-LOGIN-03: required variables are also listed in .env.example', () => {
    for (const name of REQUIRED_ENV) expect(parsed).toHaveProperty(name);
  });
});

describe('BE-LOGIN-01 / BE-LOGIN-03: wiring in main.ts, app.module.ts, package.json', () => {
  it('BE-LOGIN-01: no @nestjs/observe, ObserveModule, ObserveInstrument or YOUR_APP_KEY in draft src', () => {
    for (const rel of [
      '../app.module.ts',
      '../main.ts',
      './env.ts',
      './prisma/prisma.service.ts',
      './prisma/prisma.module.ts',
    ]) {
      expect(src(rel), rel).not.toMatch(/@nestjs\/observe|ObserveModule|ObserveInstrument|YOUR_APP_KEY/);
    }
  });

  it('BE-LOGIN-01: package.json no longer depends on @nestjs/observe', () => {
    const pkg = JSON.parse(src('../../package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies).not.toHaveProperty('@nestjs/observe');
    expect(pkg.devDependencies).not.toHaveProperty('@nestjs/observe');
  });

  it('BE-LOGIN-03: main.ts loads .env, then validates env, then creates the app (order)', () => {
    const main = src('../main.ts');
    const load = main.indexOf('loadEnvFile');
    const validate = main.indexOf('validateEnv()');
    const create = main.indexOf('NestFactory.create');
    expect(load).toBeGreaterThan(-1);
    expect(validate).toBeGreaterThan(load);
    expect(create).toBeGreaterThan(validate);
  });

  it('BE-LOGIN-05: main.ts enables shutdown hooks', () => {
    expect(src('../main.ts')).toContain('enableShutdownHooks()');
  });
});
