import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Preview only: builds ref/generated (Prisma client of the draft schema) and ref/schema.sql for check-constraints.
// Writes only inside ref/; never touches main node_modules/.prisma or the main schema.
const refRoot = dirname(fileURLToPath(import.meta.url));
const draftRoot = resolve(refRoot, '..');
const backendRoot = resolve(draftRoot, '..', '..');
const sourceSchema = resolve(draftRoot, 'prisma/schema.prisma');
const previewSchema = resolve(refRoot, 'schema.preview.prisma');
const generatedClient = resolve(refRoot, 'generated');
const prismaCli = resolve(backendRoot, 'node_modules/prisma/build/index.js');
const constraintsSource = resolve(backendRoot, 'prisma/constraints.sql');
const constraintsPreview = resolve(refRoot, 'constraints.sql');
const schemaSql = resolve(refRoot, 'schema.sql');

if (!existsSync(sourceSchema)) throw new Error(`Draft Prisma schema not found: ${sourceSchema}`);
if (!existsSync(prismaCli)) throw new Error(`Prisma CLI not found: ${prismaCli}`);
if (!existsSync(constraintsSource)) throw new Error(`Prisma constraints not found: ${constraintsSource}`);

const schema = readFileSync(sourceSchema, 'utf8');
const generatorBlock = /generator client\s*\{(?<body>[^}]*)\}/;
if (!generatorBlock.test(schema)) throw new Error('Draft schema must define generator client.');

const previewSource = schema.replace(generatorBlock, (_block, body) => {
  const cleanBody = body.replace(/^\s*output\s*=.*\r?\n/gm, '').trimEnd();
  return `generator client {${cleanBody}\n  output = "./generated"\n}`;
});

mkdirSync(refRoot, { recursive: true });
mkdirSync(generatedClient, { recursive: true });
writeFileSync(previewSchema, previewSource, 'utf8');
copyFileSync(constraintsSource, constraintsPreview);

execFileSync(process.execPath, [prismaCli, 'generate', '--schema', previewSchema], {
  cwd: backendRoot,
  stdio: 'inherit',
});
execFileSync(
  process.execPath,
  [prismaCli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', sourceSchema, '--script', '-o', schemaSql],
  { cwd: backendRoot, stdio: 'inherit' },
);
