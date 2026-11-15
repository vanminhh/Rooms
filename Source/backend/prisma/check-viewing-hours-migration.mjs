// BE-EX-17: offline upgrade check; never connects to DATABASE_URL.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = dirname(fileURLToPath(import.meta.url));
const migration = '20261114000000_viewing_hours';
const db = new PGlite();
const fresh = new PGlite();
try {
  for (const name of readdirSync(join(root, 'migrations')).filter(n => /^\d/.test(n) && n < migration).sort()) {
    await db.exec(readFileSync(join(root, 'migrations', name, 'migration.sql'), 'utf8'));
  }
  await db.exec(`
    INSERT INTO users(id,role,phone,full_name,password_hash,updated_at) VALUES(1,'BOSS','0900000001','Boss','x',now());
    INSERT INTO buildings(id,code,name,address,district,ward,water_mode,updated_at) VALUES(1,'TEST','Test','Test','Test','Test','PER_M3',now());
    INSERT INTO rooms(id,building_id,code,floor,area_m2,updated_at) VALUES(1,1,'1',1,20,now());
    INSERT INTO viewings(room_id,guest_name,guest_phone,visit_date,time_slot,status,source,note,updated_at)
      SELECT 1,'Legacy','0900000006','2026-11-01','MORNING',s::"ViewingStatus",'WEB','Preserve this note',now()
      FROM unnest(ARRAY['NEW','CONFIRMED','WON','LOST','CANCELLED']) s;
  `);
  const before = (await db.query('SELECT * FROM viewings ORDER BY id')).rows;
  await db.exec(readFileSync(join(root, 'migrations', migration, 'migration.sql'), 'utf8'));
  const after = (await db.query('SELECT * FROM viewings ORDER BY id')).rows;
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    for (const key of Object.keys(before[i])) assert.deepEqual(after[i][key], before[i][key], `Legacy row ${i}: ${key}`);
    assert.deepEqual(Object.keys(after[i]).filter(key => !(key in before[i])).sort(), ['user_id', 'visit_at']);
    for (const key of ['user_id', 'visit_at']) assert.equal(after[i][key], null);
  }
  console.log(`PASS VIEW-08: all ${after.length} legacy statuses load unchanged; new columns are null.`);

  await fresh.exec(readFileSync(join(root, 'schema.sql'), 'utf8'));
  await fresh.exec(readFileSync(join(root, 'constraints.sql'), 'utf8'));
  const queries = [
    `SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='viewings' ORDER BY column_name`,
    `SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='viewings'::regclass ORDER BY conname`,
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='viewings' ORDER BY indexname`,
    `SELECT t.typname, e.enumlabel, e.enumsortorder FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname LIKE 'Viewing%' ORDER BY t.typname,e.enumsortorder`,
  ];
  for (const query of queries) assert.deepEqual((await db.query(query)).rows, (await fresh.query(query)).rows);
  assert.deepEqual((await db.query(`SELECT enumlabel FROM pg_enum WHERE enumtypid='"ViewingStatus"'::regtype ORDER BY enumsortorder`)).rows.map(row => row.enumlabel),
    ['NEW', 'CONFIRMED', 'WON', 'LOST', 'CANCELLED', 'DONE']);
  assert.equal((await db.query(`SELECT typname FROM pg_type WHERE typname IN ('ViewingConfirmation','ViewingCancelledBy')`)).rows.length, 0);
  console.log('PASS DB-07: upgraded and fresh viewing columns, constraints, indexes and enums match.');
  console.log('PASS VIEW-04/15/18: DONE is the only added status; no confirmation/cancellation metadata columns or enums.');
} finally {
  await db.close();
  await fresh.close();
}
