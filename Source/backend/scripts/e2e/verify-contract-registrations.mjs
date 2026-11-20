// BE-P3-27. From Source/backend:
// node --env-file=.env .\scripts\e2e\verify-contract-registrations.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { workflowEnvironment } from './verify-contract-workflow.mjs';

const backendDir = fileURLToPath(new URL('../../', import.meta.url));
async function databaseReady(env) {
  let prisma;
  try {
    prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: [] });
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    console.error('BE-P3-27: database preflight failed; no E2E fixtures started. Check runtime DB access.');
    return false;
  } finally {
    try { await prisma?.$disconnect(); } catch { /* No fixture has started. */ }
  }
}

function step(args, env, runner) {
  try {
    const result = runner(process.execPath, args, { cwd: backendDir, env, shell: false, stdio: 'inherit', windowsHide: true });
    return !result.error && Number.isInteger(result.status) && result.status >= 0 ? result.status : 1;
  } catch {
    console.error('BE-P3-27: unable to start the verification child process.');
    return 1;
  }
}

export async function verifyContractRegistrations(source = process.env, runner = spawnSync, probe = databaseReady) {
  const env = workflowEnvironment(source);
  console.log('BE-P3-27: connect_timeout=30s when unset; child processes only; mail delivery disabled.');
  let ready = false;
  try { ready = await probe(env); } catch {
    console.error('BE-P3-27: database preflight failed; no E2E fixtures started.');
  }
  if (!ready) return 1;
  const status = step([
    './node_modules/vitest/vitest.mjs', 'run', '--config', './vitest.config.e2e.ts',
    './test/contracts-registrations.e2e-spec.ts', './test/contracts.e2e-spec.ts',
    '--maxWorkers=1', '--no-file-parallelism',
  ], env, runner);
  if (status !== 0) {
    console.error('BE-P3-27: E2E failed; inspect its own cleanup result. The cleanup-list step was not run.');
    return status;
  }
  // List only. Historical/unlogged rows are never automatically changed here.
  return step(['./scripts/e2e/cleanup.mjs'], env, runner);
}

if (import.meta.main) {
  try { process.exitCode = await verifyContractRegistrations(); }
  catch {
    console.error('BE-P3-27 could not start: provide a valid PostgreSQL DATABASE_URL. No environment file was changed.');
    process.exitCode = 1;
  }
}
