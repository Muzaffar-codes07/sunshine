// Exercise the actual migration engine against isolated schemas in an explicitly disposable database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, cp, copyFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, join, sep, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(decodeURIComponent(new URL(testUrl).pathname))) throw new Error('Disposable TEST_DATABASE_URL required');
const root = resolve(import.meta.dirname, '../../..');
const varRoot = join(root, 'var');
const migrationName = '20261031160000_enquiry_nan_guards';
const cases = [
  ['shadowFreeRoofAreaSqm', 'enquiries_roof_area_nonnegative'],
  ['monthlyBillInr', 'enquiries_bill_nonnegative'],
];

for (const [column, failedRule] of cases) test('C1d validation failure preserves both old guards for ' + column, async () => {
  const schema = 'c1d_atomic_' + randomUUID().replaceAll('-', '');
  assert.match(schema, /^c1d_atomic_[a-f0-9]{32}$/);
  await mkdir(varRoot, { recursive: true });
  const fixture = await mkdtemp(join(varRoot, 'migration-atomic-'));
  assert.ok(fixture.startsWith(varRoot + sep) && basename(fixture).startsWith('migration-atomic-'));
  const migrations = join(fixture, 'migrations');
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query('CREATE SCHEMA "' + schema + '"');
    await client.query("SELECT set_config('search_path', $1, false)", ['"' + schema + '"']);
    await mkdir(migrations);
    for (const name of await readdir(join(root, 'prisma/migrations'))) {
      if (name === 'migration_lock.toml') await copyFile(join(root, 'prisma/migrations', name), join(migrations, name));
      else if (/^[0-9]{14}_/.test(name) && name < '20261031160000') await cp(join(root, 'prisma/migrations', name), join(migrations, name), { recursive: true });
    }
    await copyFile(join(root, 'prisma/schema.prisma'), join(fixture, 'schema.prisma'));
    const config = join(fixture, 'prisma.config.ts');
    await writeFile(config, "import { defineConfig } from 'prisma/config';\nexport default defineConfig({schema:'./schema.prisma',migrations:{path:'./migrations'},datasource:{url:process.env.DATABASE_URL!}});\n");
    const scopedUrl = new URL(testUrl); scopedUrl.searchParams.set('schema', schema);
    const deploy = () => spawnSync(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', config], {
      cwd: root, env: { ...process.env, DATABASE_URL: scopedUrl.toString() }, encoding: 'utf8', timeout: 30000,
    });
    const base = deploy();
    assert.equal(base.status, 0, 'pre-C1d history deploys');
    const customerId = randomUUID(), enquiryId = randomUUID();
    await client.query('INSERT INTO customers(id,name,phone,"addressLine",city,pincode,"updatedAt") VALUES($1,$2,$3,$4,$5,$6,now())',
      [customerId, 'Synthetic migration test', '9876000123', '1 Test Road', 'Pune', '411001']);
    // Column comes only from the fixed cases above; all values remain parameters.
    await client.query('INSERT INTO enquiries(id,"customerId",source,"requestedCapacityKw","contactName","siteAddressLine","siteCity","sitePincode","' + column + '","updatedAt") VALUES($1,$2,$3,1,$4,$5,$6,$7,$8::numeric,now())',
      [enquiryId, customerId, 'PHONE', 'Synthetic migration test', '1 Test Road', 'Pune', '411001', 'NaN']);
    const guards = async () => (await client.query("SELECT conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace=$1::regnamespace AND conname=ANY($2::text[]) ORDER BY conname",
      [schema, ['enquiries_roof_area_nonnegative', 'enquiries_bill_nonnegative']])).rows;
    const before = await guards();
    assert.equal(before.length, 2);
    await cp(join(root, 'prisma/migrations', migrationName), join(migrations, migrationName), { recursive: true });
    const result = deploy();
    assert.notEqual(result.status, 0, 'invalid pre-existing data must fail validation');
    const output = result.stdout + result.stderr;
    // With an explicit BEGIN, Prisma 7 can report only the subsequent aborted-transaction error.
    // The preserved guards and untouched invalid row below verify rollback, independently of that wording.
    assert.ok((output.includes('23514') && output.includes(failedRule)) || output.includes('current transaction is aborted'), 'migration refused the invalid prestate');
    const stored = await client.query('SELECT "' + column + '"::text AS value FROM enquiries WHERE id=$1::uuid', [enquiryId]);
    assert.equal(stored.rows[0].value, 'NaN', 'failure does not silently rewrite existing data');
    assert.deepEqual(await guards(), before, 'failed replacement rolls back both original CHECK definitions');
  } finally {
    await client.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await client.end();
    assert.ok(fixture.startsWith(varRoot + sep) && basename(fixture).startsWith('migration-atomic-'), 'cleanup remains within the task fixture');
    await rm(fixture, { recursive: true, force: true });
  }
});
