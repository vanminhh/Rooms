import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JWT_SECRET_MIN_LENGTH, REQUIRED_ENV, trustProxyHops, validateEnv } from './env.js';

// validateEnv takes the env object as a parameter, so no mocking is needed:
// every test passes a plain object (nothing reads the real process.env).
const full = {
  DATABASE_URL: 'postgresql://u:p@h:5432/db',
  DIRECT_URL: 'postgresql://u:p@h:5432/db',
  JWT_SECRET: 'x'.repeat(40),
  APP_URL: 'http://localhost:5173',
  NODE_ENV: 'test',
  CCCD_KEY: Buffer.alloc(32, 9).toString('base64'),
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
  it('BE-P3-02 / DEP-05: NODE_ENV and CCCD_KEY are required at startup', () => {
    expect([...REQUIRED_ENV]).toEqual(['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'APP_URL', 'NODE_ENV', 'CCCD_KEY']);
  });

  it('BE-P3-02: empty env names every missing variable without values', () => {
    expect(() => validateEnv({})).toThrow(
      new Error(
        'Thiếu biến môi trường: DATABASE_URL, DIRECT_URL, JWT_SECRET, APP_URL, NODE_ENV, CCCD_KEY (xem ../.env)',
      ),
    );
    // toThrow(new Error(..)) compares message only; make the exact text explicit too
    expect(messageOf({})).toBe(
      'Thiếu biến môi trường: DATABASE_URL, DIRECT_URL, JWT_SECRET, APP_URL, NODE_ENV, CCCD_KEY (xem ../.env)',
    );
  });

  it('BE-P3-02: BANK_WEBHOOK_SECRET, CLOUDINARY_URL, MAIL_FROM remain optional', () => {
    expect(() => validateEnv({ ...full })).not.toThrow();
  });

  it('BE-P3-02: missing CCCD_KEY or NODE_ENV prevents startup', () => {
    expect(messageOf({ ...full, CCCD_KEY: '' })).toBe('Thiếu biến môi trường: CCCD_KEY (xem ../.env)');
    expect(messageOf({ ...full, NODE_ENV: '' })).toBe('Thiếu biến môi trường: NODE_ENV (xem ../.env)');
  });

  it('BE-P3-02 / DEP-05: NODE_ENV accepts only development, test or production', () => {
    for (const value of ['development', 'test', 'production']) {
      expect(() => validateEnv({ ...full, NODE_ENV: value })).not.toThrow();
    }
    expect(messageOf({ ...full, NODE_ENV: 'preview' })).toMatch(/NODE_ENV/);
  });

  it('BE-P3-02: CCCD_KEY is strictly base64 of exactly 32 bytes and errors never include the value', () => {
    for (const value of [Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64'), 'secret-invalid']) {
      const message = messageOf({ ...full, CCCD_KEY: value });
      expect(message).toContain('CCCD_KEY');
      expect(message).not.toContain(value);
    }
  });

  it('BE-LOGIN-03: only DATABASE_URL missing names DATABASE_URL and not DIRECT_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = full;
    const message = messageOf(rest);
    expect(message).toBe('Thiếu biến môi trường: DATABASE_URL (xem ../.env)');
    expect(message).not.toContain('DIRECT_URL');
  });

  it('BE-LOGIN-03: only DIRECT_URL missing names DIRECT_URL and not DATABASE_URL', () => {
    const { DIRECT_URL: _omit, ...rest } = full;
    expect(messageOf(rest)).toBe('Thiếu biến môi trường: DIRECT_URL (xem ../.env)');
  });

  it('BE-LOGIN-03 (P10): only APP_URL missing names only APP_URL', () => {
    const { APP_URL: _omit, ...rest } = full;
    expect(messageOf(rest)).toBe('Thiếu biến môi trường: APP_URL (xem ../.env)');
  });

  it('BE-LOGIN-03 (P10): only JWT_SECRET missing names only JWT_SECRET (not the length message)', () => {
    const { JWT_SECRET: _omit, ...rest } = full;
    expect(messageOf(rest)).toBe('Thiếu biến môi trường: JWT_SECRET (xem ../.env)');
  });

  it('BE-LOGIN-03 boundary: empty string counts as missing', () => {
    expect(() => validateEnv({ ...full, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...full, APP_URL: '' })).toThrow(/APP_URL/);
  });

  it('BE-LOGIN-03 boundary: whitespace-only string counts as missing', () => {
    expect(() => validateEnv({ ...full, DIRECT_URL: '   ' })).toThrow(/DIRECT_URL/);
    expect(() => validateEnv({ ...full, DATABASE_URL: '\t\n ' })).toThrow(/DATABASE_URL/);
    expect(messageOf({ ...full, JWT_SECRET: '   ' })).toBe(
      'Thiếu biến môi trường: JWT_SECRET (xem ../.env)',
    );
  });

  it('BE-LOGIN-03: several blank values are listed in REQUIRED_ENV order', () => {
    expect(messageOf({ ...full, DATABASE_URL: '  ', DIRECT_URL: '' })).toBe(
      'Thiếu biến môi trường: DATABASE_URL, DIRECT_URL (xem ../.env)',
    );
    expect(messageOf({ ...full, DIRECT_URL: '', APP_URL: ' ' })).toBe(
      'Thiếu biến môi trường: DIRECT_URL, APP_URL (xem ../.env)',
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
      process.env.NODE_ENV = full.NODE_ENV;
      process.env.CCCD_KEY = full.CCCD_KEY;
      let message = '';
      try {
        validateEnv();
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toBe('Thiếu biến môi trường: DATABASE_URL (xem ../.env)');
      expect(message).not.toContain('TOPSECRET');
    } finally {
      process.env = saved;
    }
  });
});

describe('DEP-04: trust proxy configuration', () => {
  it('DEP-04: a missing TRUST_PROXY_HOPS defaults to numeric 0', () => {
    expect(trustProxyHops(full)).toBe(0);
  });

  it.each([0, 1, 10])('DEP-04: accepts %i hops as a number', (hops) => {
    const env = { ...full, TRUST_PROXY_HOPS: String(hops) };
    expect(() => validateEnv(env)).not.toThrow();
    expect(trustProxyHops(env)).toBe(hops);
  });

  it.each(['true', 'false', '-1', '11', '0.5', '1e0', '0x1', '', ' ', '1\n'])(
    'DEP-04: invalid TRUST_PROXY_HOPS %j prevents startup',
    (value) => {
      expect(() => validateEnv({ ...full, TRUST_PROXY_HOPS: value })).toThrow(/TRUST_PROXY_HOPS/);
    },
  );
});

describe('BE-LOGIN-03 (P10): JWT_SECRET length', () => {
  const LENGTH_MESSAGE = 'JWT_SECRET phải dài ít nhất 32 ký tự (xem ../.env)';

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
      'Thiếu biến môi trường: APP_URL (xem ../.env)',
    );
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

  it('BE-P3-02 / DEP-05: main.ts loads and validates env before the scheduler is configured (PRC-06)', () => {
    const main = src('../main.ts');
    const load = main.indexOf("process.loadEnvFile('.env')");
    const loadLegacy = main.indexOf("process.loadEnvFile('../.env')");
    const validate = main.indexOf('validateEnv()');
    const loadApp = main.indexOf("await import('./app.module.js')");
    const create = main.indexOf('NestFactory.create');
    expect(load).toBeGreaterThan(-1);
    expect(loadLegacy).toBeGreaterThan(load);
    expect(validate).toBeGreaterThan(loadLegacy);
    expect(main).not.toMatch(/from ['"]\.\/app\.module\.js['"]/);
    expect(loadApp).toBeGreaterThan(validate);
    expect(create).toBeGreaterThan(loadApp);
  });

  it('BE-LOGIN-05: main.ts enables shutdown hooks', () => {
    expect(src('../main.ts')).toContain('enableShutdownHooks()');
  });
});
