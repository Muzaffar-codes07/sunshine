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

test('Device controls and CapabilitySpikePage tests via Vite SSR', async () => {
  const vite = await createServer({
    root: resolve(root, 'apps/web'),
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { ScanInput } = await vite.ssrLoadModule('/src/components/device/ScanInput.tsx');
    const { PhotoCapture } = await vite.ssrLoadModule('/src/components/device/PhotoCapture.tsx');
    const { SignaturePad } = await vite.ssrLoadModule('/src/components/device/SignaturePad.tsx');
    const { CapabilitySpikePage } = await vite.ssrLoadModule('/src/features/field/CapabilitySpikePage.tsx');
    const { App } = await vite.ssrLoadModule('/src/app/App.tsx');

    // 1. ScanInput tests
    {
      const html = renderToStaticMarkup(
        React.createElement(ScanInput, {
          label: 'Serial number scan',
          hint: 'Type or scan barcode and hit enter',
          onScan: () => {},
          error: 'Invalid equipment serial',
        })
      );

      assert.ok(html.includes('Serial number scan'), 'ScanInput renders custom label');
      assert.ok(html.includes('Type or scan barcode and hit enter'), 'ScanInput renders custom hint');
      assert.ok(html.includes('type="text"'), 'ScanInput renders manual text input for desktop / USB / Bluetooth scanner');
      assert.ok(html.includes('Scan with camera'), 'ScanInput renders scan with camera button');
      assert.ok(html.includes('Submit code'), 'ScanInput renders manual submit button');
      assert.ok(html.includes('aria-invalid="true"') && html.includes('Invalid equipment serial'), 'scan field exposes validation accessibly');
      assert.ok(html.includes('<video'), 'ScanInput renders video element for camera preview');
    }

    // 2. PhotoCapture tests
    {
      const html = renderToStaticMarkup(
        React.createElement(PhotoCapture, {
          label: 'Rooftop photo',
          hint: 'Capture roof space with camera',
        })
      );

      assert.ok(html.includes('Rooftop photo'), 'PhotoCapture renders label');
      assert.ok(html.includes('Capture roof space with camera'), 'PhotoCapture renders hint');
      assert.ok(html.includes('type="file"'), 'PhotoCapture renders file input');
      assert.ok(html.includes('accept="image/*"'), 'PhotoCapture has accept="image/*"');
      assert.ok(html.includes('capture="environment"'), 'PhotoCapture has capture="environment" for phone camera');
    }

    // 3. SignaturePad tests
    {
      const html = renderToStaticMarkup(
        React.createElement(SignaturePad, {
          label: 'Customer sign-off',
          hint: 'Sign using finger or stylus',
          width: 600,
          height: 200,
        })
      );

      assert.ok(html.includes('Customer sign-off'), 'SignaturePad renders label');
      assert.ok(html.includes('Sign using finger or stylus'), 'SignaturePad renders hint');
      assert.ok(html.includes('<canvas'), 'SignaturePad renders canvas');
      assert.ok(html.includes('role="img"'), 'SignaturePad canvas has role="img"');
      assert.ok(html.includes('tabindex="0"'), 'SignaturePad canvas has tabindex="0"');
      assert.ok(html.includes('Keyboard users: drawing requires pointer or touch input'), 'SignaturePad includes keyboard instructions');
      assert.ok(html.includes('Clear signature'), 'SignaturePad renders clear button');
      assert.ok(html.includes('Export PNG'), 'SignaturePad renders export PNG button');
      assert.ok(html.includes('disabled'), 'SignaturePad export is disabled until ink exists');
      assert.ok(html.includes('role="status"'), 'SignaturePad has accessible role="status" live region');
    }

    // 4. CapabilitySpikePage tests
    {
      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/spike'] },
          React.createElement(CapabilitySpikePage, null)
        )
      );

      assert.ok(html.includes('Device capability check'), 'CapabilitySpikePage renders title');
      assert.ok(html.includes('1. Device Environment'), 'CapabilitySpikePage renders Section 1');
      assert.ok(html.includes('Secure context'), 'CapabilitySpikePage checks secure context');
      assert.ok(html.includes('Camera API available'), 'CapabilitySpikePage checks getUserMedia');
      assert.ok(html.includes('BarcodeDetector built-in'), 'CapabilitySpikePage checks BarcodeDetector');
      assert.ok(html.includes('2. Barcode &amp; Serial Scanner'), 'CapabilitySpikePage renders Section 2 ScanInput');
      assert.ok(html.includes('3. Photo Capture'), 'CapabilitySpikePage renders Section 3 PhotoCapture');
      assert.ok(html.includes('4. Signature Capture'), 'CapabilitySpikePage renders Section 4 SignaturePad');
    }

    // 5. App routing /spike DEV route test
    {
      const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const html = renderToStaticMarkup(
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(
            MemoryRouter,
            { initialEntries: ['/spike'] },
            React.createElement(App, null)
          )
        )
      );

      assert.ok(html.includes('Device capability check'), 'App renders /spike route in DEV mode');
    }

    // 6. Production build verification: /spike must be absent from production dist
    {
      const { readFileSync, existsSync, readdirSync } = await import('node:fs');
      const distAssetsDir = resolve(root, 'apps/web/dist/assets');
      if (existsSync(distAssetsDir)) {
        const jsFiles = readdirSync(distAssetsDir).filter((file) => file.endsWith('.js'));
        for (const jsFile of jsFiles) {
          const content = readFileSync(resolve(distAssetsDir, jsFile), 'utf8');
          assert.strictEqual(
            content.includes('Device capability check'),
            false,
            `/spike content must not be bundled in production JS (${jsFile})`
          );
        }
      }
    }
  } finally {
    await vite.close();
  }
});
