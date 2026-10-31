import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required; apply migrations first.');
const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') ?? 'public';
assert.ok(schema.length > 0, 'Database schema must not be empty.');
const manifestPath = resolve(process.argv[2] ?? resolve(root, 'prisma/required-constraints.json'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const constraintType = { check: 'c', exclusion: 'x' };
const supportedKinds = ['check', 'exclusion', 'unique_partial_index', 'trigger', 'view', 'function'];
assert.ok(Array.isArray(manifest.required), 'Manifest required must be an array.');
assert.ok(manifest.required.length > 0, 'Manifest must list the required database rules; an empty manifest is not verified.');
const seen = new Set();
for (const entry of manifest.required) {
  assert.ok(entry && ['name', 'table', 'owner', 'definition'].every((key) =>
    typeof entry[key] === 'string' && entry[key].trim().length > 0), 'Each entry needs name, table, owner and canonical definition.');
  assert.ok(supportedKinds.includes(entry.kind), `Unsupported constraint kind: ${entry.kind}`);
  const key = `${entry.table}\0${entry.name}`;
  assert.ok(!seen.has(key), `Duplicate manifest entry: ${entry.table}.${entry.name}`);
  seen.add(key);
}

const failures = [];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  // pg does not implement Prisma's ?schema= option. Scope rendering and lookup explicitly.
  await client.query("SELECT set_config('search_path', $1, false)", [`"${schema.replaceAll('"', '""')}"`]);
  const { rows: actualRules } = await client.query(
    `SELECT c.conname AS name, t.relname AS "table", CASE c.contype WHEN 'c' THEN 'check' ELSE 'exclusion' END AS kind
       FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND c.contype IN ('c', 'x')
      UNION ALL
     SELECT c.relname AS name, t.relname AS "table", 'unique_partial_index' AS kind
       FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
       JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND i.indisunique AND i.indpred IS NOT NULL
      UNION ALL
     SELECT t.tgname AS name, c.relname AS "table", 'trigger' AS kind
       FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND NOT t.tgisinternal
      UNION ALL
     SELECT c.relname AS name, c.relname AS "table", 'view' AS kind
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'v'
      UNION ALL
     SELECT p.proname AS name, p.proname AS "table", 'function' AS kind
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 AND p.prokind = 'f'
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')`, [schema],
  );
  for (const rule of actualRules) {
    if (!manifest.required.some((entry) => entry.name === rule.name && entry.table === rule.table && entry.kind === rule.kind)) {
      failures.push(`unlisted ${rule.kind} ${schema}.${rule.table}.${rule.name}`);
    }
  }
  for (const { name, table, kind, owner, definition } of manifest.required) {
    const label = `${kind} ${schema}.${table}.${name} (owner ${owner})`;
    if (kind === 'unique_partial_index') {
      const { rows: [found] } = await client.query(
        `SELECT i.indisunique AS "unique", i.indpred IS NOT NULL AS partial,
                i.indisvalid AND i.indisready AS valid, pg_get_indexdef(i.indexrelid) AS definition
           FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
           JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.relname = $1 AND t.relname = $2 AND n.nspname = $3`,
        [name, table, schema],
      );
      if (!found) failures.push(`missing ${label}`);
      else if (!found.unique || !found.partial || !found.valid || found.definition !== definition) {
        failures.push(`wrong definition: ${label}`);
      }
    } else if (kind === 'trigger' || kind === 'view' || kind === 'function') {
      // A trigger that exists but is disabled protects nothing, so "enabled" is part of the definition.
      const { rows: [found] } = await client.query(kind === 'trigger'
        ? `SELECT t.tgenabled = 'O' AS valid, pg_get_triggerdef(t.oid) AS definition
             FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE t.tgname = $1 AND c.relname = $2 AND n.nspname = $3 AND NOT t.tgisinternal`
        : kind === 'view'
          ? `SELECT true AS valid, pg_get_viewdef(c.oid) AS definition
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relname = $1 AND c.relname = $2 AND n.nspname = $3 AND c.relkind = 'v'`
          : `SELECT true AS valid, pg_get_functiondef(p.oid) AS definition
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE p.proname = $1 AND p.proname = $2 AND n.nspname = $3 AND p.prokind = 'f'`,
        [name, table, schema],
      );
      if (!found) failures.push(`missing ${label}`);
      else if (!found.valid || found.definition !== definition) failures.push(`wrong definition: ${label}`);
    } else {
      const { rows: [found] } = await client.query(
        `SELECT c.contype AS type, c.convalidated AS valid, pg_get_constraintdef(c.oid) AS definition
           FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE c.conname = $1 AND t.relname = $2 AND n.nspname = $3`,
        [name, table, schema],
      );
      if (!found) failures.push(`missing ${label}`);
      else if (found.type !== constraintType[kind] || !found.valid || found.definition !== definition) {
        failures.push(`wrong definition: ${label}`);
      }
    }
  }
} finally { await client.end(); }
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else { console.log(`Required database constraints verified: ${manifest.required.length}.`); }
