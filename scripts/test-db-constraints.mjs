// Explicit disposable test database only. Never loads the application's .env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

test('constraint checker rejects semantic drift and isolates schema/table identity', async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url && /test/i.test(decodeURIComponent(new URL(url).pathname)),
    'TEST_DATABASE_URL must name a disposable test database.');
  const schema = `d3_constraints_${randomUUID().replaceAll('-', '')}`;
  const temp = await mkdtemp(join(tmpdir(), 'sunshine-constraint-test-'));
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query("SELECT set_config('search_path', $1, false)", [schema]);
    await client.query(`CREATE TABLE probe (unit_id text, wrong_id text, active boolean, stock integer,
      during int4range, CONSTRAINT probe_stock CHECK (stock >= 0),
      CONSTRAINT probe_overlap EXCLUDE USING gist (during WITH &&));
      CREATE UNIQUE INDEX probe_active ON probe(unit_id) WHERE active;
      CREATE TABLE decoy (stock integer, CONSTRAINT probe_stock CHECK (true));`);
    const { rows } = await client.query(`SELECT conname AS name, pg_get_constraintdef(oid) AS definition,
      CASE contype WHEN 'c' THEN 'check' ELSE 'exclusion' END AS kind FROM pg_constraint
      WHERE conrelid='probe'::regclass AND contype IN ('c','x') ORDER BY conname`);
    const { rows: [index] } = await client.query(`SELECT pg_get_indexdef('probe_active'::regclass) AS definition`);
    const required = [...rows, { name: 'probe_active', kind: 'unique_partial_index', definition: index.definition }]
      .map((entry) => ({ ...entry, table: 'probe', owner: 'D3' }));
    const manifest = join(temp, 'manifest.json');
    const save = (entries = required) => writeFile(manifest, JSON.stringify({ required: entries }));
    await save();
    const scopedUrl = new URL(url); scopedUrl.searchParams.set('schema', schema);
    const run = () => spawnSync(process.execPath, [resolve(import.meta.dirname, 'check-db-constraints.mjs'), manifest], {
      env: { ...process.env, DATABASE_URL: scopedUrl.toString() }, encoding: 'utf8', timeout: 15000,
    });
    let checks = 0;
    const expect = (status, message) => {
      const result = run();
      assert.equal(result.status, status, `${message}: ${result.stdout}\n${result.stderr}`);
      checks++; return result;
    };
    expect(0, 'correct CHECK, exclusion and partial index in non-public schema');
    await client.query('ALTER TABLE probe DROP CONSTRAINT probe_stock; ALTER TABLE probe ADD CONSTRAINT probe_stock CHECK (true)');
    assert.match(expect(1, 'same-name CHECK true rejected').stderr, /wrong definition/);
    await client.query('ALTER TABLE probe DROP CONSTRAINT probe_stock; ALTER TABLE probe ADD CONSTRAINT probe_stock CHECK (stock >= 0) NOT VALID');
    expect(1, 'unvalidated CHECK rejected');
    await client.query('ALTER TABLE probe VALIDATE CONSTRAINT probe_stock');
    expect(0, 'validated CHECK restored');
    await client.query('DROP INDEX probe_active; CREATE UNIQUE INDEX probe_active ON probe(wrong_id) WHERE active');
    expect(1, 'wrong index key rejected');
    await client.query('DROP INDEX probe_active; CREATE UNIQUE INDEX probe_active ON probe(unit_id) WHERE NOT active');
    expect(1, 'wrong index predicate rejected');
    await client.query('DROP INDEX probe_active; CREATE INDEX probe_active ON probe(unit_id) WHERE active');
    expect(1, 'non-unique index rejected');
    await client.query('DROP INDEX probe_active; CREATE UNIQUE INDEX probe_active ON probe(unit_id) WHERE active');
    await client.query('ALTER TABLE probe DROP CONSTRAINT probe_overlap; ALTER TABLE probe ADD CONSTRAINT probe_overlap EXCLUDE USING gist (during WITH =)');
    expect(1, 'wrong exclusion operator rejected');
    await client.query('ALTER TABLE probe DROP CONSTRAINT probe_overlap');
    expect(1, 'missing exclusion rejected');
    await client.query('ALTER TABLE probe ADD CONSTRAINT probe_overlap EXCLUDE USING gist (during WITH &&)');
    expect(0, 'all definitions restored, same-name decoy ignored');
    await save([...required, required[0]]);
    expect(1, 'duplicate manifest rejected');
    await save(required.map(({ definition, ...entry }) => entry));
    expect(1, 'missing expected definitions rejected');
    console.log(`${checks} checker regression scenarios passed.`);
  } finally {
    // Only this test's UUID schema, on an explicitly named disposable test DB.
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
    await rm(temp, { recursive: true, force: true });
  }
});
