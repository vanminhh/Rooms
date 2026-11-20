import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Generate the test schema from the current model. Never connect to a configured database,
// apply migrations, overwrite a snapshot, or fall back to stale SQL after generation fails.
export function loadCheckSchema(deps, dbDir, runner = spawnSync, source = process.env) {
  const dependencyRoot = resolve(deps);
  const schemaPath = join(resolve(dbDir), 'schema.prisma');
  if (!existsSync(schemaPath)) {
    // Explicit SQL-only fixtures remain supported for historical/offline migration checks.
    return { sql: readFileSync(join(dbDir, 'schema.sql'), 'utf8'), source: 'schema.sql' };
  }
  const cli = join(dependencyRoot, 'node_modules/prisma/build/index.js');
  const dummyUrl = 'postgresql://checker:checker@127.0.0.1:1/checker';
  let result;
  try {
    result = runner(process.execPath, [cli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', schemaPath, '--script'], {
      cwd: dependencyRoot, encoding: 'utf8', shell: false, windowsHide: true, timeout: 30_000,
      env: { ...source, DATABASE_URL: dummyUrl, DIRECT_URL: dummyUrl },
    });
  } catch {
    throw new Error('DB-07: không thể sinh schema kiểm thử bằng Prisma CLI cục bộ.');
  }
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string' || !result.stdout.trim()) {
    throw new Error('DB-07: sinh schema kiểm thử thất bại; dừng kiểm tra, không dùng schema.sql cũ.');
  }
  return { sql: result.stdout, source: 'schema.prisma' };
}
