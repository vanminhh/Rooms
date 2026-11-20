// BE-P3-22: read-only connection diagnosis. Run from Source/backend:
// node --env-file=.env .\scripts\e2e\check-db.mjs
// Compare the configured URLs without changing them or printing credentials.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { PrismaClient } from '@prisma/client';

function errorCode(error) {
  const code = error?.errorCode ?? error?.code;
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : 'CONNECTION_CHECK_FAILED';
}

let fileEnv = {};
try {
  fileEnv = parseEnv(readFileSync('.env', 'utf8'));
} catch {
  // Env vars may also be provided by the shell. Never print file/parser errors.
}

async function probe(key) {
  const value = process.env[key];
  if (!value) {
    console.log(JSON.stringify({ key, result: 'MISSING_URL' }));
    return false;
  }
  let url;
  try {
    url = new URL(value);
    if (!['postgresql:', 'postgres:'].includes(url.protocol)) throw new Error('Invalid protocol');
  } catch {
    console.log(JSON.stringify({ key, result: 'INVALID_URL' }));
    return false;
  }
  // Node --env-file preserves already-set shell variables. A stale inherited URL
  // can therefore win over .env; report only the comparison, never either value.
  if (fileEnv[key] !== undefined && fileEnv[key] !== value) {
    console.log(JSON.stringify({ key, warning: 'ENVIRONMENT_DIFFERS_FROM_DOTENV' }));
  }
  console.log(JSON.stringify({ key, host: url.hostname, port: url.port || '5432', check: 'SELECT 1' }));
  const started = performance.now();
  let db;
  try {
    db = new PrismaClient({ datasourceUrl: value, log: [] });
    await db.$queryRaw`SELECT 1`;
    console.log(JSON.stringify({ key, result: 'OK', ms: Math.round(performance.now() - started) }));
    return true;
  } catch (error) {
    console.log(JSON.stringify({ key, result: 'FAILED', code: errorCode(error), ms: Math.round(performance.now() - started) }));
    return false;
  } finally {
    try {
      await db?.$disconnect();
    } catch {
      console.log(JSON.stringify({ key, warning: 'DISCONNECT_FAILED' }));
    }
  }
}

const runtime = await probe('DATABASE_URL');
const direct = await probe('DIRECT_URL');
console.log(JSON.stringify({ summary: { DATABASE_URL: runtime ? 'OK' : 'FAILED', DIRECT_URL: direct ? 'OK' : 'FAILED' } }));
// A working migration URL alone does not make the runtime/E2E connection pass.
process.exitCode = runtime && direct ? 0 : 1;
