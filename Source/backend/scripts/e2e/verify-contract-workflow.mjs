// BE-P3-22: run the real dev workflow, then read-only cleanup verification.
// From Source/backend: node --env-file=.env .\scripts\e2e\verify-contract-workflow.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backendDir = fileURLToPath(new URL('../../', import.meta.url));

export function workflowEnvironment(source = process.env) {
  let url;
  try {
    url = new URL(source.DATABASE_URL);
    if (!['postgresql:', 'postgres:'].includes(url.protocol)) throw new Error('Invalid protocol');
  } catch {
    // URL parser errors may contain credentials. Never forward their message/cause.
    throw new Error('DATABASE_URL must contain a valid PostgreSQL connection URL');
  }
  const env = { ...source, NODE_ENV: 'test', MAIL_PROVIDER: '' };
  if (!url.searchParams.has('connect_timeout')) {
    url.searchParams.set('connect_timeout', '30');
    env.DATABASE_URL = url.toString();
  }
  return env;
}

function runStep(args, label, env, runner) {
  let result;
  try {
    result = runner(process.execPath, args, { cwd: backendDir, env, shell: false, stdio: 'inherit' });
  } catch {
    console.error(`${label}: unable to start Node`);
    return 1;
  }
  if (result.error) {
    console.error(`${label}: unable to start Node`);
    return 1;
  }
  return typeof result.status === 'number' && result.status >= 0 ? result.status : 1;
}

export function verifyContractWorkflow(source = process.env, runner = spawnSync) {
  const env = workflowEnvironment(source);
  console.log('BE-P3-22: connect_timeout=30s when unset; existing values are preserved; child processes only.');
  const workflowStatus = runStep([
    './node_modules/vitest/vitest.mjs', 'run', '--config', './vitest.config.e2e.ts',
    './test/contracts-workflow.e2e-spec.ts', '--maxWorkers=1', '--no-file-parallelism',
  ], 'Workflow', env, runner);
  if (workflowStatus !== 0) {
    console.error('Workflow failed; cleanup list was not run.');
    return workflowStatus;
  }
  return runStep(['./scripts/e2e/cleanup.mjs'], 'Cleanup list', env, runner);
}

if (import.meta.main) {
  try {
    process.exitCode = verifyContractWorkflow();
  } catch {
    console.error('Workflow could not start: check that DATABASE_URL is a valid PostgreSQL URL.');
    process.exitCode = 1;
  }
}
