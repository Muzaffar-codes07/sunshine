// Explicit disposable PostgreSQL only. Never load .env or modify application data.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const root = resolve(import.meta.dirname, '..');
const url = process.env.TEST_DATABASE_URL;
assert.ok(url, 'Set TEST_DATABASE_URL to an isolated disposable test database');
const target = new URL(url);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) && /test/i.test(target.pathname),
  'Draft staging requires an explicit loopback test database');
assert.equal(target.searchParams.get('schema') ?? 'public', 'public', 'Use an isolated test database with public schema');
const filesPath = process.argv[2];
assert.ok(filesPath, 'Pass the reviewed File migration SQL path explicitly');
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  const { rows: [{ server_version: version }] } = await client.query('SHOW server_version');
  assert.match(version, /^17\.11(?:\s|$)/, 'Canonical definitions require PostgreSQL 17.11');
  const { rows: [{ existing }] } = await client.query("SELECT to_regclass('public.cost_entries') AS existing");
  assert.equal(existing, null, 'Apply the draft only once to a fresh disposable database');
  await client.query(await readFile(resolve(filesPath), 'utf8'));
  await client.query(await readFile(resolve(root, 'prisma/drafts/20261031260000_d4/migration.sql'), 'utf8'));

  // Collect only the reviewed draft/dependency objects. The ordinary checker
  // still verifies all current-main objects and rejects any unlisted rules.
  const tables = ['files', 'warranties', 'cost_entries', 'service_tickets', 'ticket_lines', 'subsidy_milestones'];
  const { rows: rules } = await client.query(`
    SELECT c.conname AS name, t.relname AS "table", 'check' AS kind, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND c.contype = 'c' AND t.relname = ANY($1)
    UNION ALL
    SELECT g.tgname, t.relname, 'trigger', pg_get_triggerdef(g.oid)
      FROM pg_trigger g JOIN pg_class t ON t.oid = g.tgrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND NOT g.tgisinternal AND t.relname = 'cost_entries'
    UNION ALL
    SELECT p.proname, p.proname, 'function', pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('cost_entries_check_reversal', 'cost_entries_refuse_mutation')
    ORDER BY 2, 1`, [tables]);
  assert.equal(rules.filter(row => row.table === 'files').length, 6, 'Expected the reviewed six File checks');
  assert.equal(rules.filter(row => row.table !== 'files').length, 28, 'Expected 23 D4 checks, three triggers and two functions');
  const manifest = JSON.parse(await readFile(resolve(root, 'prisma/required-constraints.json'), 'utf8'));
  const additions = rules.map(row => ({ ...row, owner: row.table === 'files' ? 'D2' : 'D4' }));
  await writeFile(resolve(root, 'var/d4-draft-manifest.json'), JSON.stringify({
    ...manifest, required: [...manifest.required, ...additions],
  }, null, 2) + '\n');
  await writeFile(resolve(root, 'var/d4-draft-rules.json'), JSON.stringify({
    serverVersion: version, required: additions.filter(row => row.owner === 'D4'),
  }, null, 2) + '\n');
  console.log(`Draft staged on PostgreSQL ${version}; ${additions.length} dependency/draft rules collected for review.`);
} finally {
  await client.end();
}
