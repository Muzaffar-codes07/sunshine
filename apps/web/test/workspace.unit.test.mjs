import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(new URL('../package.json', import.meta.url));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

test('workspace navigation restricts each role and direct links cannot mount unauthorized screens', async () => {
  const vite = await require('vite').createServer({ root: resolve(import.meta.dirname, '..'), server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { App } = await vite.ssrLoadModule('/src/app/App.tsx');
    const { visibleWorkspaces } = await vite.ssrLoadModule('/src/app/Workspace.tsx');
    assert.deepEqual(Array.from(visibleWorkspaces('TECHNICIAN'), ([path]) => path), ['sales', 'field-service']);
    assert.deepEqual(Array.from(visibleWorkspaces('WAREHOUSE'), ([path]) => path), ['orders', 'warehouse']);
    assert.deepEqual(Array.from(visibleWorkspaces('SUPPORT'), ([path]) => path), ['service']);
    assert.deepEqual(Array.from(visibleWorkspaces('SALES'), ([path]) => path), ['sales', 'orders']);
    for (const [role, path, expected] of [
      ['TECHNICIAN', '/workspace/reports', 'Your role cannot open this workspace.'],
      ['SUPPORT', '/workspace/warehouse', 'Your role cannot open this workspace.'],
      ['SUPPORT', '/workspace/service', 'Create service ticket'],
      ['ADMIN', '/workspace/reports', 'Report period'],
      ['TECHNICIAN', '/workspace', 'Assigned jobs, installation photos'],
    ]) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      client.setQueryData(['staff-session'], { id: '11111111-1111-4111-8111-111111111111', email: 'test@sunshine.test', displayName: 'Test', role });
      const html = renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(App))));
      assert.ok(html.includes(expected), `${role}: ${path}`);
      assert.ok(!html.includes('This workspace is planned'));
      client.clear();
    }
  } finally { await vite.close(); }
});
