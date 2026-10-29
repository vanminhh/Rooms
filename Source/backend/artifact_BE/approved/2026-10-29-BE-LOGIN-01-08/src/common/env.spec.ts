import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { REQUIRED_ENV, validateEnv } from './env.js';

// validateEnv takes the env object as a parameter, so no mocking is needed:
// every test passes a plain object (nothing reads the real process.env).
const full = {
  DATABASE_URL: 'postgresql://u:p@h:5432/db',
  DIRECT_URL: 'postgresql://u:p@h:5432/db',
};

const src = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('BE-LOGIN-03: validateEnv', () => {
  it('BE-LOGIN-03: REQUIRED_ENV is exactly DATABASE_URL and DIRECT_URL (decision D3)', () => {
    expect([...REQUIRED_ENV]).toEqual(['DATABASE_URL', 'DIRECT_URL']);
  });

  it('BE-LOGIN-03: empty env throws the exact Vietnamese message with both names', () => {
    expect(() => validateEnv({})).toThrow(
      new Error(
        'Thiếu biến môi trường: DATABASE_URL, DIRECT_URL (xem .env.example)',
      ),
    );
    // toThrow(new Error(..)) compares message only; make the exact text explicit too
    let message = '';
    try {
      validateEnv({});
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe(
      'Thiếu biến môi trường: DATABASE_URL, DIRECT_URL (xem .env.example)',
    );
  });

  it('BE-LOGIN-03: JWT_SECRET and the other 5 variables missing does not throw (D3)', () => {
    expect(() => validateEnv({ ...full })).not.toThrow();
  });

  it('BE-LOGIN-03: only DATABASE_URL missing names DATABASE_URL and not DIRECT_URL', () => {
    let message = '';
    try {
      validateEnv({ DIRECT_URL: full.DIRECT_URL });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('DIRECT_URL');
  });

  it('BE-LOGIN-03: only DIRECT_URL missing names DIRECT_URL and not DATABASE_URL', () => {
    let message = '';
    try {
      validateEnv({ DATABASE_URL: full.DATABASE_URL });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe('Thiếu biến môi trường: DIRECT_URL (xem .env.example)');
  });

  it('BE-LOGIN-03 boundary: empty string counts as missing', () => {
    expect(() => validateEnv({ ...full, DATABASE_URL: '' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('BE-LOGIN-03 boundary: whitespace-only string counts as missing', () => {
    expect(() => validateEnv({ ...full, DIRECT_URL: '   ' })).toThrow(
      /DIRECT_URL/,
    );
    expect(() => validateEnv({ ...full, DATABASE_URL: '\t\n ' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('BE-LOGIN-03: both blank (empty and spaces) lists both, in REQUIRED_ENV order', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: '  ', DIRECT_URL: '' }),
    ).toThrow(
      'Thiếu biến môi trường: DATABASE_URL, DIRECT_URL (xem .env.example)',
    );
  });

  it('BE-LOGIN-03: all required present plus unknown extra variables does not throw', () => {
    expect(() =>
      validateEnv({ ...full, SOMETHING_ELSE: 'x', JWT_SECRET: 'y' }),
    ).not.toThrow();
  });

  it('BE-LOGIN-03 security: message never contains the value of a present variable', () => {
    let message = '';
    try {
      validateEnv({ DIRECT_URL: 'postgresql://user:SECRET123@h/db' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('SECRET123');
  });

  it('BE-LOGIN-03: with no argument it reads process.env (missing var -> throws, names only)', () => {
    const saved = { ...process.env };
    try {
      delete process.env.DATABASE_URL;
      process.env.DIRECT_URL = 'postgresql://u:TOPSECRET@h/db';
      let message = '';
      try {
        validateEnv();
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toBe(
        'Thiếu biến môi trường: DATABASE_URL (xem .env.example)',
      );
      expect(message).not.toContain('TOPSECRET');
    } finally {
      process.env = saved;
    }
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
      expect(src(rel), rel).not.toMatch(
        /@nestjs\/observe|ObserveModule|ObserveInstrument|YOUR_APP_KEY/,
      );
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
