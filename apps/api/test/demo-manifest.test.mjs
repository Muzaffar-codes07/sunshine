import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildManifest,manifestSummary}=require('../dist/demo/manifest');
const {assertDemoTarget}=require('../dist/demo/seed-demo');

test('450 unique customer cases cover the agreed cohorts and chronological history',()=>{
  const rows=buildManifest('2026-11-01'),summary=manifestSummary(rows);
  assert.equal(rows.length,450);
  for(const key of ['customerId','enquiryId','phone','email'])assert.equal(new Set(rows.map(r=>r[key])).size,450,key);
  assert.equal(summary.systemTypes.ON_GRID,315);assert.equal(summary.systemTypes.OFF_GRID,135);
  assert.equal(rows.filter(r=>r.service).length,15);
  assert.equal(rows.filter(r=>r.stage==='COMPLETED').length,60);
  for(const r of rows){assert.ok(r.enquiryAt<r.surveyAt&&r.surveyAt<r.quoteAt&&r.quoteAt<r.orderAt&&r.orderAt<r.dispatchAt&&r.dispatchAt<r.deliveredAt&&r.deliveredAt<r.startedAt&&r.startedAt<r.finishedAt);}
  assert.equal(rows[390].deliveryDay,'2025-05-01');assert.equal(rows[440].deliveryDay,'2024-07-01');
  assert.equal(rows[0].enquiryAt.toISOString(),'2026-10-31T18:30:00.000Z');
  assert.equal(rows[305].orderAt.toISOString(),'2026-10-31T18:30:00.000Z');
  // The planned crew never has overlapping real work across completed imports.
  for(const a of rows.filter(r=>r.stage==='COMPLETED'))for(const b of rows.filter(r=>r.stage==='COMPLETED'&&r.index>a.index)){
    if(a.technicianIndexes.some(t=>b.technicianIndexes.includes(t)))assert.ok(a.finishedAt<=b.startedAt||b.finishedAt<=a.startedAt,`${a.index}/${b.index}`);
  }
  assert.deepEqual(buildManifest('2026-11-01'),rows);
});
test('seed guards require an exact target, disposable opt-in and a password',()=>{
  const good={DATABASE_URL:'postgresql://local@127.0.0.1:5432/demo',DEMO_DATABASE_NAME:'demo',DEMO_DATABASE_DISPOSABLE:'true',DEMO_STAFF_PASSWORD:'unit-test-only-password'};
  assert.doesNotThrow(()=>assertDemoTarget(good));
  assert.throws(()=>assertDemoTarget({...good,DEMO_DATABASE_NAME:'other'}),/MISMATCH/);
  assert.throws(()=>assertDemoTarget({...good,DEMO_DATABASE_DISPOSABLE:'false'}),/DISPOSABLE/);
  assert.throws(()=>assertDemoTarget({...good,NODE_ENV:'production'}),/DISPOSABLE/);
  assert.throws(()=>assertDemoTarget({...good,DEMO_STAFF_PASSWORD:''}),/PASSWORD/);
  for(const anchor of ['2026-02-31','bad','9999-01-01'])assert.throws(()=>buildManifest(anchor),/INVALID_ANCHOR/);
});
