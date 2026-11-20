import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

type Result = { status: number | null; stdout?: string; error?: Error };
type Runner = (...args: any[]) => Result;
type Loader = (deps: string, directory: string, runner?: Runner, env?: NodeJS.ProcessEnv) => { sql: string; source: string };
const { loadCheckSchema } = await import(new URL('../prisma/check-schema.mjs', import.meta.url).href) as { loadCheckSchema: Loader };

describe('QA-P3-02/DB-07: offline constraint checker schema source', () => {
  it('uses the current model even when the tracked SQL snapshot is old, with no configured DB URL or apply command', () => {
    const runner = vi.fn<Runner>(() => ({ status: 0, stdout: 'CREATE TABLE fresh_schema(id integer);' }));
    const source = { DATABASE_URL: 'postgresql://private:private-secret@invalid.example/db', DIRECT_URL: 'postgresql://private:direct-secret@invalid.example/db', NODE_ENV: 'development' };
    const before = { ...source };
    expect(loadCheckSchema('.', 'prisma', runner, source)).toEqual({ source: 'schema.prisma', sql: 'CREATE TABLE fresh_schema(id integer);' });
    const [executable, args, options] = runner.mock.calls[0];
    expect(executable).toBe(process.execPath);
    expect(args).toEqual([join(resolve('.'), 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve('prisma/schema.prisma'), '--script']);
    expect(options).toMatchObject({ cwd: resolve('.'), encoding: 'utf8', shell: false, windowsHide: true, timeout: 30_000 });
    expect(options.env.DATABASE_URL).toBe('postgresql://checker:checker@127.0.0.1:1/checker');
    expect(options.env.DIRECT_URL).toBe(options.env.DATABASE_URL);
    expect(source).toEqual(before);
  });

  it.each([{ status: 1, stdout: '' }, { status: null, stdout: '' }, { status: 0, stdout: '' }, { status: 0, stdout: ' ' }, { status: 0, stdout: 'SQL', error: new Error('private-secret') }])(
    'fails closed on generator failure rather than silently testing the old snapshot (%j)', result => {
      expect(() => loadCheckSchema('.', 'prisma', () => result)).toThrow('không dùng schema.sql cũ');
    },
  );

  it('does not disclose a runner exception or database credentials', () => {
    expect(() => loadCheckSchema('.', 'prisma', () => { throw new Error('private-secret'); })).toThrow('Prisma CLI cục bộ');
    try { loadCheckSchema('.', 'prisma', () => { throw new Error('private-secret'); }); }
    catch (error) { expect(String(error)).not.toContain('private-secret'); }
  });

  it('continues to accept an explicit SQL-only fixture without running Prisma', () => {
    const directory = resolve('node_modules/.cache/rooms-check-constraints/sql-only');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'schema.sql'), 'CREATE TABLE historical_fixture(id integer);');
    const runner = vi.fn<Runner>(() => ({ status: 1 }));
    expect(loadCheckSchema('.', directory, runner)).toEqual({ source: 'schema.sql', sql: 'CREATE TABLE historical_fixture(id integer);' });
    expect(runner).not.toHaveBeenCalled();
  });
});
