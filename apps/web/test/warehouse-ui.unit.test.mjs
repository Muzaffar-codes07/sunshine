import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const webRequire = createRequire(resolve(root, 'apps/web/package.json'));
const React = webRequire('react');
const { renderToStaticMarkup } = webRequire('react-dom/server');
const { MemoryRouter } = webRequire('react-router-dom');
const { createServer } = webRequire('vite');

test('Warehouse Workspace UI contracts, role views and pattern rendering via Vite SSR', async () => {
  const vite = await createServer({
    root: resolve(root, 'apps/web'),
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const { WarehousePage } = await vite.ssrLoadModule('/src/features/warehouse/WarehousePage.tsx');
    const { StockReceiptDrawer } = await vite.ssrLoadModule('/src/features/warehouse/StockReceiptDrawer.tsx');
    const { App } = await vite.ssrLoadModule('/src/app/App.tsx');

    const renderWithSession = (component, user, initialEntries = ['/workspace/warehouse']) => {
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
        },
      });
      client.setQueryData(['staff-session'], user);
      // Pre-seed some mock data for warehouse queries
      client.setQueryData(['warehouse', 'locations'], {
        data: [
          { id: '11111111-1111-4111-8111-111111111111', code: 'WH-MAIN', name: 'Main Hub', kind: 'USABLE' },
        ],
      });
      client.setQueryData(['warehouse', 'stock-levels', { page: 1, pageSize: 25 }], {
        data: {
          items: [
            {
              productId: '22222222-2222-4222-8222-222222222222',
              sku: 'PANEL-400W',
              productName: 'Mono PERC Solar Panel 400W',
              locationId: '11111111-1111-4111-8111-111111111111',
              locationCode: 'WH-MAIN',
              locationKind: 'USABLE',
              onHand: '50.000',
              reserved: '10.000',
              free: '40.000',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 25,
        },
      });

      return renderToStaticMarkup(
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(MemoryRouter, { initialEntries }, component)
        )
      );
    };

    // 1. Role enforcement: SALES or TECHNICIAN cannot access warehouse
    {
      const html = renderWithSession(
        React.createElement(WarehousePage, null),
        { id: 'user-1', email: 'sales@sunshine.test', displayName: 'Sales Person', role: 'SALES' }
      );
      assert.ok(html.includes('Unauthorized'), 'displays unauthorized heading for SALES');
      assert.ok(html.includes('cannot access the warehouse workspace'), 'denies warehouse access to SALES');
    }

    // 2. WAREHOUSE role can access warehouse workspace
    {
      const html = renderWithSession(
        React.createElement(WarehousePage, null),
        { id: 'user-2', email: 'wh@sunshine.test', displayName: 'Warehouse Manager', role: 'WAREHOUSE' }
      );
      assert.ok(html.includes('Warehouse &amp; Stock Management'), 'displays warehouse title');
      assert.ok(html.includes('Stock Balances'), 'displays Stock Balances tab');
      assert.ok(html.includes('Movement Ledger'), 'displays Movement Ledger tab');
      assert.ok(html.includes('Integrity &amp; Audit'), 'displays Integrity tab');
      assert.ok(html.includes('Valuation'), 'displays Valuation tab');
      assert.ok(html.includes('Unit &amp; Serial Scan'), 'displays Unit & Serial Scan tab');
      assert.ok(html.includes('PANEL-400W'), 'displays pre-seeded SKU in table');
      assert.ok(html.includes('50.000'), 'displays on-hand balance without client calculation');
      assert.ok(html.includes('40.000'), 'displays free balance without client calculation');
    }

    // 3. StockReceiptDrawer renders inwards form elements
    {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      client.setQueryData(['warehouse', 'locations'], { data: [] });
      client.setQueryData(['warehouse', 'products'], { data: { items: [], total: 0, page: 1, pageSize: 100 } });
      const html = renderToStaticMarkup(
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(StockReceiptDrawer, { open: true, onClose: () => {} })
        )
      );
      assert.ok(html.includes('Receive Goods / Inward Stock'), 'drawer renders title');
      assert.ok(html.includes('Receipt reference / PO number'), 'drawer has reference field');
      assert.ok(html.includes('Destination location'), 'drawer has location selector');
      assert.ok(html.includes('Post Stock Receipt'), 'drawer has submit button');
    }

    // 4. App route /workspace/warehouse is wired to WarehousePage (not PlannedWorkspace)
    {
      const html = renderWithSession(
        React.createElement(App, null),
        { id: 'user-3', email: 'admin@sunshine.test', displayName: 'Admin User', role: 'ADMIN' },
        ['/workspace/warehouse']
      );
      assert.ok(!html.includes('This workspace is planned'), 'does not render PlannedWorkspace');
      assert.ok(html.includes('Warehouse &amp; Stock Management'), 'renders real WarehousePage in App routes');
    }
  } finally {
    await vite.close();
  }
});
