import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

// Prisma's migrate diff and status don't report a missing hand-written constraint, so check the database itself.
const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required; start PostgreSQL and apply migrations first.');

const manifestPath = resolve(process.argv[2] ?? resolve(root, 'prisma/required-constraints.json'));
const { kinds, required } = JSON.parse(await readFile(manifestPath, 'utf8'));
const constraintType = { check: 'c', exclusion: 'x' };
const failures = [];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  for (const { name, table, kind, owner } of required) {
    assert.ok(name && table && owner && kinds.includes(kind), `Invalid manifest entry: ${JSON.stringify({ name, table, kind, owner })}`);
    const missing = `${kind} ${name} on ${table} (owner ${owner})`;
    if (kind === 'unique_partial_index') {
      const { rows } = await client.query(
        `SELECT t.relname AS "table", i.indisunique AS "unique", i.indpred IS NOT NULL AS partial, i.indisvalid AS valid
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indexrelid
           JOIN pg_class t ON t.oid = i.indrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = $1 AND n.nspname = current_schema()`,
        [name],
      );
      const found = rows[0];
      if (!found) failures.push(`missing ${missing}`);
      else if (found.table !== table || !found.unique || !found.partial || !found.valid) failures.push(`wrong definition: ${missing}`);
    } else {
      const { rows } = await client.query(
        `SELECT c.contype AS type, t.relname AS "table", c.convalidated AS valid
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE c.conname = $1 AND n.nspname = current_schema()`,
        [name],
      );
      const found = rows[0];
      if (!found) failures.push(`missing ${missing}`);
      else if (found.table !== table || found.type !== constraintType[kind] || !found.valid) failures.push(`wrong definition: ${missing}`);
    }
  }
} finally {
  await client.end();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Required database constraints verified: ${required.length}.`);
}
