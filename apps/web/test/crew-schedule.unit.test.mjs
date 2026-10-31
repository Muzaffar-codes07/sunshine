// No database needed. Build contracts first.
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

test('the crew panel shows the schedule, offers a change only before work starts, and names the crew', async () => {
  const vite = await createServer({ root: resolve(root, 'apps/web'), server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { CrewSchedule } = await vite.ssrLoadModule('/src/features/field/CrewSchedule.tsx');
    const asha = randomUUID(), ravi = randomUUID(), jobId = randomUUID(), enquiryId = randomUUID();
    const job = (overrides = {}) => ({ data: {
      id: jobId, orderId: randomUUID(), orderDisplayNumber: 'ORD-000042', customerId: randomUUID(), status: 'SCHEDULED', version: 2,
      scheduledStart: null, scheduledFinish: null, technicianIds: [], startedAt: null, finishedAt: null, installedCapacityKw: null,
      photoFileIds: [], signatureFileId: null, signerName: null, completedChecks: [], timeRecords: [], ...overrides,
    } });
    const staff = { data: { items: [{ id: asha, displayName: 'Asha Tech', role: 'TECHNICIAN' }, { id: ravi, displayName: 'Ravi Tech', role: 'TECHNICIAN' }] } };
    const contracts = createRequire(resolve(root, 'apps/api/package.json'))('@sunshine/contracts');
    assert.equal(contracts.staffDirectoryResponseSchema.safeParse(staff).success, true, 'the fixture matches the shared contract');
    const render = (value) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      client.setQueryData(['enquiry', enquiryId, 'job', jobId], value);
      client.setQueryData(['staff', 'TECHNICIAN'], staff);
      try { return renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, {}, React.createElement(CrewSchedule, { jobId, enquiryId })))); }
      finally { client.clear(); }
    };
    const fresh = render(job());
    assert.match(fresh, /Schedule crew/); assert.match(fresh, /None assigned/); assert.match(fresh, /Not scheduled/);
    const planned = render(job({ scheduledStart: '2026-11-03T04:00:00.000Z', scheduledFinish: '2026-11-03T10:00:00.000Z', technicianIds: [asha, randomUUID()] }));
    assert.match(planned, /Change schedule/); assert.match(planned, /Asha Tech, Former technician/, 'someone no longer listed is still accounted for');
    const started = render(job({ status: 'IN_PROGRESS', technicianIds: [ravi] }));
    assert.match(started, /schedule and crew are fixed/); assert.ok(!started.includes('Change schedule') && !started.includes('Schedule crew'));
  } finally { await vite.close(); }
});
