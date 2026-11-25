// Run on the dev host. Record exit codes in results.txt and each step's full output in its own file beside it.
import { spawn } from 'node:child_process';
import { appendFileSync, createWriteStream, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'rooms-p5-9-'));
const log = join(dir, 'results.txt');
function record(line) {
  console.log(line);
  appendFileSync(log, line + '\n');
}
record('QA-P5-9 ' + new Date().toISOString());
console.log('Log:', log);

// Only the runtime URL is needed. Seed fixtures only after this probe succeeds.
const db = new PrismaClient();
try {
  await db.$queryRaw`SELECT 1`;
  record('DATABASE_URL SELECT 1: OK');
} catch (error) {
  record('DATABASE_URL SELECT 1: FAILED ' + (error.errorCode ?? error.code ?? 'CONNECTION_FAILED'));
  process.exitCode = 1;
} finally { await db.$disconnect(); }

if (!process.exitCode) {
  // Output still streams to the terminal; the copy keeps a red step's error after the terminal scrolls.
  async function run(label, args) {
    const output = join(dir, label.replace(/[^\w.-]+/g, '_') + '.txt');
    const copy = createWriteStream(output);
    const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => { process.stdout.write(chunk); copy.write(chunk); });
    child.stderr.on('data', (chunk) => { process.stderr.write(chunk); copy.write(chunk); });
    const code = await new Promise((resolve) => {
      child.on('error', (error) => { copy.write(String(error) + '\n'); resolve(1); });
      child.on('close', (status) => resolve(status ?? 1));
    });
    await new Promise((resolve) => copy.end(resolve));
    record(label + ' exit=' + code + ' output=' + output);
    if (code) process.exitCode = 1;
  }
  const vitest = ['node_modules/vitest/vitest.mjs', 'run'];
  await run('AUTH-16 four roles and login entries (HTTP)', [...vitest, 'src/modules/auth/auth.login-portal.spec.ts']);
  for (const suite of ['requests', 'settlement', 'contracts-renewal', 'reports', 'operations-races',
    'contracts-workflow', 'meters-billing', 'invoices-payments', 'public-filters', 'viewings']) {
    const file = 'test/' + suite + '.e2e-spec.ts';
    await run(file, [...vitest, '--config', 'vitest.config.e2e.ts', file]);
  }
  await run('cleanup list (read-only)', ['scripts/e2e/cleanup.mjs', '--check']);
}
