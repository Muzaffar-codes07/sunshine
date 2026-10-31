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
      CREATE TABLE decoy (stock integer, CONSTRAINT probe_stock CHECK (true));
      CREATE FUNCTION probe_refuse() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'refused'; END; $fn$;
      CREATE TRIGGER probe_guard BEFORE UPDATE ON probe FOR EACH ROW EXECUTE FUNCTION probe_refuse();
      CREATE VIEW probe_view AS SELECT stock FROM probe WHERE active;`);
    const { rows } = await client.query(`SELECT c.conname AS name, t.relname AS "table", pg_get_constraintdef(c.oid) AS definition,
      CASE c.contype WHEN 'c' THEN 'check' ELSE 'exclusion' END AS kind FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      WHERE c.connamespace=$1::regnamespace AND c.contype IN ('c','x') ORDER BY t.relname,c.conname`, [schema]);
    const { rows: [index] } = await client.query(`SELECT pg_get_indexdef('probe_active'::regclass) AS definition`);
    const { rows: [objects] } = await client.query(`SELECT
      (SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE t.tgname='probe_guard') AS trigger,
      pg_get_viewdef('probe_view'::regclass) AS view, pg_get_functiondef('probe_refuse'::regproc) AS fn`);
    const required = [...rows, { name: 'probe_active', table: 'probe', kind: 'unique_partial_index', definition: index.definition },
      { name: 'probe_guard', table: 'probe', kind: 'trigger', definition: objects.trigger },
      { name: 'probe_view', table: 'probe_view', kind: 'view', definition: objects.view },
      { name: 'probe_refuse', table: 'probe_refuse', kind: 'function', definition: objects.fn }]
      .map((entry) => ({ ...entry, owner: 'D3' }));
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
    await save([]);
    assert.match(expect(1, 'empty manifest rejected').stderr, /empty manifest/);
    await save();
    await client.query('ALTER TABLE probe ADD CONSTRAINT extra_check CHECK (true)');
    assert.match(expect(1, 'unlisted CHECK rejected').stderr, /unlisted check/);
    await client.query('ALTER TABLE probe DROP CONSTRAINT extra_check');
    await client.query('CREATE UNIQUE INDEX extra_partial ON probe(wrong_id) WHERE active');
    assert.match(expect(1, 'unlisted partial unique index rejected').stderr, /unlisted unique_partial_index/);
    await client.query('DROP INDEX extra_partial');
    await client.query('ALTER TABLE probe ADD CONSTRAINT extra_exclusion EXCLUDE USING gist (during WITH =)');
    assert.match(expect(1, 'unlisted exclusion rejected').stderr, /unlisted exclusion/);
    await client.query('ALTER TABLE probe DROP CONSTRAINT extra_exclusion');
    await client.query('ALTER TABLE probe DISABLE TRIGGER probe_guard');
    assert.match(expect(1, 'disabled trigger rejected').stderr, /wrong definition: trigger/);
    await client.query('ALTER TABLE probe ENABLE TRIGGER probe_guard');
    await client.query('DROP TRIGGER probe_guard ON probe');
    assert.match(expect(1, 'dropped trigger rejected').stderr, /missing trigger/);
    await client.query('CREATE TRIGGER probe_guard BEFORE UPDATE ON probe FOR EACH ROW EXECUTE FUNCTION probe_refuse()');
    expect(0, 'trigger restored');
    await client.query(`CREATE OR REPLACE FUNCTION probe_refuse() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RETURN NEW; END; $fn$`);
    assert.match(expect(1, 'emptied trigger function rejected').stderr, /wrong definition: function/);
    await client.query(`CREATE OR REPLACE FUNCTION probe_refuse() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN RAISE EXCEPTION 'refused'; END; $fn$`);
    await client.query('CREATE OR REPLACE VIEW probe_view AS SELECT stock FROM probe');
    assert.match(expect(1, 'changed view rejected').stderr, /wrong definition: view/);
    await client.query('DROP VIEW probe_view');
    assert.match(expect(1, 'dropped view rejected').stderr, /missing view/);
    await client.query('CREATE VIEW probe_view AS SELECT stock FROM probe WHERE active');
    expect(0, 'trigger, function and view restored');
    await client.query('CREATE TRIGGER extra_guard BEFORE DELETE ON probe FOR EACH ROW EXECUTE FUNCTION probe_refuse()');
    assert.match(expect(1, 'unlisted trigger rejected').stderr, /unlisted trigger/);
    await client.query('DROP TRIGGER extra_guard ON probe');
    await client.query('CREATE VIEW extra_view AS SELECT stock FROM probe');
    assert.match(expect(1, 'unlisted view rejected').stderr, /unlisted view/);
    await client.query('DROP VIEW extra_view');
    await client.query(`CREATE FUNCTION extra_fn() RETURNS int LANGUAGE sql AS 'SELECT 1'`);
    assert.match(expect(1, 'unlisted function rejected').stderr, /unlisted function/);
    await client.query('DROP FUNCTION extra_fn');
    console.log(`${checks} checker regression scenarios passed.`);
  } finally {
    // Only this test's UUID schema, on an explicitly named disposable test DB.
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
    await rm(temp, { recursive: true, force: true });
  }
});
