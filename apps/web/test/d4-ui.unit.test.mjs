import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let server, service, reports, http, serviceApi, reportApi;
before(async () => {
  server = await createServer({
    configFile: false, server: { middlewareMode: true, hmr: false },
    esbuild: { jsx: 'automatic' },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  service = await server.ssrLoadModule('/src/features/service/ServiceWorkspacePage.tsx');
  reports = await server.ssrLoadModule('/src/features/reports/ReportsWorkspacePage.tsx');
  http = await server.ssrLoadModule('/src/features/service/d4-http.ts');
  serviceApi = await server.ssrLoadModule('/src/features/service/service-api.ts');
  reportApi = await server.ssrLoadModule('/src/features/reports/report-api.ts');
});
after(async () => { await server?.close(); });

const unitId = '11111111-1111-4111-8111-111111111111';
const ticketId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const instant = '2026-11-01T00:00:00.000Z';
const assessment = {
  unitId, serial: 'INV-TEST', asOfDate: '2026-11-01', policyName: 'Test policy', policyRevision: '1',
  scope: 'inverter', startDate: '2025-01-01', expiryDate: '2027-01-01', coverageStatus: 'COVERED',
  isCovered: true, reason: 'Inside saved policy dates', customerCharge: '0.00', chargeStatus: 'FREE',
  requestedScope: 'inverter', assessedAt: instant,
};
const ticket = {
  id: ticketId, ticketNumber: 'TEST-001', customerId: unitId, unitId, jobId,
  replacedUnitId: null, newUnitId: null, status: 'OPEN', version: 1,
  faultDescription: 'Test inverter fault', assessmentSnapshot: null, resolutionDetails: null,
  resolvedAt: null, confirmation: null, closedAt: null, createdAt: instant, updatedAt: instant,
};
const costs = { material: '12000.00', installationLabour: '0.00', serviceLabour: '2000.00', repairParts: '0.00' };
const overview = {
  period: 'today', timezone: 'Asia/Kolkata', startDate: '2026-11-01', endDate: '2026-11-02',
  startUtc: '2026-10-31T18:30:00.000Z', endUtc: '2026-11-01T18:30:00.000Z', asOf: instant,
  invoicedRevenue: '10000.00', cashReceived: '8000.00', actualCost: '14000.00', costBreakdown: costs,
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
function errorBody(code, reasons) {
  return { error: { code, message: 'Action refused', fieldErrors: { serial: ['Check the serial'] }, requestId: unitId, ...(reasons ? { reasons } : {}) } };
}

test('ticket mutations are disabled by default while warranty lookup remains usable', () => {
  const markup = renderToStaticMarkup(createElement(service.ServiceWorkspacePage));
  assert.match(markup, /Ticket actions are unavailable/);
  assert.match(markup, /<fieldset disabled=""/);
  assert.match(markup, /Look up serial/);
  assert.match(markup, /Load ticket/);
  assert.doesNotMatch(markup, /Ticket closed/);
});

test('saved ticket read uses the authorized route and validates the complete response', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (...args) => {
    calls.push(args);
    return json({ data: ticket });
  });
  const saved = await serviceApi.getTicket(ticketId);
  assert.equal(calls[0][0], `/api/v1/tickets/${ticketId}`);
  assert.equal(calls[0][1].method, 'GET');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(saved.data.version, 1);
  globalThis.fetch.mock.mockImplementation(async () => json({ data: { id: ticketId, status: 'CLOSED' } }));
  await assert.rejects(serviceApi.getTicket(ticketId), { code: 'CONTRACT_MISMATCH' });
});

test('ticket view shows saved coverage, lineage and only the current lifecycle action', () => {
  const markup = renderToStaticMarkup(createElement(service.ServiceWorkspacePage, {
    initialTicket: { ...ticket, status: 'ASSESSED', assessmentSnapshot: assessment, replacedUnitId: unitId, newUnitId: jobId },
  }));
  assert.match(markup, /Covered — customer charge ₹0.00/);
  assert.match(markup, /Inside saved policy dates/);
  assert.match(markup, /Replaced unit/);
  assert.match(markup, /New unit/);
  assert.match(markup, /Await customer confirmation/);
  assert.doesNotMatch(markup, /Create ticket|Close ticket/);
});

test('warranty lookup encodes serial input and validates the complete server response', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (...args) => {
    calls.push(args);
    return json({ data: { unit: { id: unitId, serial: 'INV-TEST', manufacturerId: unitId, productId: jobId },
      customer: { id: unitId, name: 'Test customer' }, job: { id: jobId }, assessment } });
  });
  const result = await serviceApi.lookupWarranty({ serial: 'INV & 1', manufacturerId: unitId });
  assert.equal(new URL(`https://example.test${calls[0][0]}`).searchParams.get('serial'), 'INV & 1');
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(result.data.assessment.customerCharge, '0.00');
  globalThis.fetch.mock.mockImplementation(async () => json({ data: { paid: true } }));
  await assert.rejects(serviceApi.lookupWarranty({ serial: 'INV-TEST' }), { code: 'CONTRACT_MISMATCH' });
});

test('typed ticket request keeps its payload and same retry key without adding client-owned charge', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (...args) => { calls.push(args); return json({ data: ticket }); });
  const input = { unitId, faultDescription: 'Test fault' };
  await serviceApi.createTicket(input, 'test-retry-key');
  await serviceApi.createTicket(input, 'test-retry-key');
  assert.equal(calls[0][0], '/api/v1/tickets');
  assert.deepEqual(JSON.parse(calls[0][1].body), input);
  assert.equal(calls[0][1].headers['Idempotency-Key'], calls[1][1].headers['Idempotency-Key']);
});

test('conflicts retain field errors, refusal reasons, next action and trace ID', async (t) => {
  const reason = { code: 'ASSESSMENT_REQUIRED', reason: 'Assessment is missing', source: 'WARRANTY', nextAction: 'Assess the ticket' };
  t.mock.method(globalThis, 'fetch', async () => json(errorBody('ASSESSMENT_REQUIRED', [reason]), 409));
  await assert.rejects(serviceApi.lookupWarranty({ serial: 'INV-TEST' }), (error) => {
    assert.equal(error.status, 409);
    assert.deepEqual(error.reasons, [reason]);
    assert.deepEqual(error.fieldErrors.serial, ['Check the serial']);
    assert.equal(error.requestId, unitId);
    assert.match(http.describeD4Error(error), /Assess the ticket/);
    return true;
  });
});

test('authentication, authorization and unavailable errors remain distinct', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json(errorBody('UNAUTHENTICATED'), 401));
  await assert.rejects(reportApi.readOverview('today'), (error) => /Sign in again/.test(http.describeD4Error(error)));
  globalThis.fetch.mock.mockImplementation(async () => json(errorBody('FORBIDDEN'), 403));
  await assert.rejects(reportApi.readOverview('today'), (error) => /does not have access/.test(http.describeD4Error(error)));
  globalThis.fetch.mock.mockImplementation(async () => json(errorBody('NOT_CONFIGURED'), 503));
  await assert.rejects(reportApi.readOverview('today'), (error) => /temporarily unavailable/.test(http.describeD4Error(error)));
});

test('CSV failures stay JSON errors and successful CSV bytes are preserved', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json(errorBody('NOT_CONFIGURED'), 503));
  await assert.rejects(reportApi.readCsv('/api/v1/reports/export.csv?report=pay&period=week'), { status: 503 });
  globalThis.fetch.mock.mockImplementation(async () => json({ data: overview }));
  await assert.rejects(reportApi.readCsv('/api/v1/reports/export.csv?report=overview'), { code: 'CONTRACT_MISMATCH' });
  const csv = 'job,contribution\r\nTEST,-2000.00\r\n';
  globalThis.fetch.mock.mockImplementation(async () => new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8' } }));
  assert.equal(await (await reportApi.readCsv('/api/v1/reports/export.csv?report=overview')).text(), csv);
});

test('reports render server monetary totals, cutoff and empty states', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(['reports', 'overview', 'today'], overview);
  client.setQueryData(['reports', 'pay', 'today'], { ...overview, technicians: [], totalHours: '0.000', totalPay: '0.00' });
  client.setQueryData(['reports', 'subsidies'], { asOf: instant, groups: [] });
  const markup = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(reports.ReportsWorkspacePage)));
  assert.match(markup, /₹14,000.00/);
  assert.match(markup, /No approved technician time/);
  assert.match(markup, /No subsidy milestones recorded/);
  assert.match(markup, /end excluded/);
  assert.match(markup, /2026-11-01T00:00:00.000Z/);
  assert.match(markup, /Download this period as CSV/);
  client.clear();
});
