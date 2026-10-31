// No database needed. Build contracts first.
// Uses real React rendering. Browser interactions and real uploads were checked separately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const React = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');
const { MemoryRouter } = webRequire('react-router-dom');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { createServer } = webRequire('vite');

const job = (overrides = {}) => ({
  id: randomUUID(), orderId: randomUUID(), orderDisplayNumber: 'ORD-000042', customerId: randomUUID(), status: 'SCHEDULED', version: 3,
  contactName: 'Site Customer', siteAddress: '9 Roof Road, Nagpur 440001', soldCapacityKw: 3, systemType: 'ON_GRID', crew: [{ id: randomUUID(), displayName: 'Asha Tech' }],
  scheduledStart: '2026-11-03T04:00:00.000Z', scheduledFinish: '2026-11-03T10:00:00.000Z', technicianIds: [], startedAt: null, finishedAt: null,
  installedCapacityKw: null, photoFileIds: [], signatureFileId: null, signerName: null, completedChecks: [], timeRecords: [], ...overrides,
});

test('field screens follow roles, the job stage and the system type', async () => {
  const vite = await createServer({ root: resolve(root, 'apps/web'), server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { FieldJobsPage } = await vite.ssrLoadModule('/src/features/field/FieldJobsPage.tsx');
    const { FieldJobPage } = await vite.ssrLoadModule('/src/features/field/FieldJobPage.tsx');
    const contracts = createRequire(resolve(root, 'apps/api/package.json'))('@sunshine/contracts');
    const render = (component, role, data = []) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      client.setQueryData(['staff-session'], { id: randomUUID(), email: 'a@b.test', displayName: 'UI', role });
      for (const [key, value] of data) client.setQueryData(key, value);
      try { return renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, {}, component))); }
      finally { client.clear(); }
    };
    const page = (value, role = 'TECHNICIAN') => render(React.createElement(FieldJobPage, { jobId: value.id }), role, [[['field', 'job', value.id], { data: value }]]);

    for (const role of ['SALES', 'WAREHOUSE', 'SUPPORT']) {
      assert.match(render(React.createElement(FieldJobsPage), role), /Your role cannot use the field workspace/);
      assert.match(render(React.createElement(FieldJobPage, { jobId: randomUUID() }), role), /Your role cannot use the field workspace/);
    }
    assert.match(render(React.createElement(FieldJobPage, { jobId: 'not-an-id' }), 'ADMIN'), /valid job link/);
    const listed = render(React.createElement(FieldJobsPage), 'TECHNICIAN', [[['field', 'jobs', true], [job()]]]);
    assert.match(listed, /ORD-000042/); assert.match(listed, /9 Roof Road/);
    assert.match(render(React.createElement(FieldJobsPage), 'TECHNICIAN', [[['field', 'jobs', true], []]]), /No open jobs are assigned to you/);

    const scheduled = page(job());
    assert.match(scheduled, /Start job/); assert.ok(!scheduled.includes('Complete job'), 'an unstarted job cannot be completed');

    const started = job({ status: 'IN_PROGRESS', startedAt: '2026-11-01T04:00:00.000Z' });
    const onGrid = page(started);
    assert.match(onGrid, /Complete job/); assert.match(onGrid, /Sold as 3 kW/); assert.ok(!onGrid.includes('Start job'));
    assert.ok(!onGrid.includes('value="BATTERY"'), 'an on-grid job has no battery check');
    assert.match(page({ ...started, systemType: 'OFF_GRID' }), /value="BATTERY"/);
    assert.match(onGrid, /Asha Tech: from/);

    const photo = randomUUID(), signature = randomUUID();
    const done = page(job({ status: 'COMPLETED', startedAt: '2026-11-01T04:00:00.000Z', finishedAt: '2026-11-01T08:00:00.000Z', installedCapacityKw: 3, photoFileIds: [photo], signatureFileId: signature, signerName: 'Site Customer', completedChecks: ['MOUNTING'] }));
    assert.match(done, /Completed work/); assert.ok(done.includes(`/api/v1/files/${photo}`)); assert.ok(done.includes(`/api/v1/files/${signature}`));
    assert.ok(!done.includes('Complete job') && !done.includes('Start job'), 'a completed job offers no actions');
    assert.equal(contracts.jobViewSchema.safeParse(job()).success, true, 'this fixture matches the shared contract');
  } finally { await vite.close(); }
});
