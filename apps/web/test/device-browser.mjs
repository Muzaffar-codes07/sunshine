// Optional browser acceptance, no application dependency. Set PLAYWRIGHT_PACKAGE to an
// installed playwright(-core) package directory and CHROMIUM_PATH to a browser executable.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const base = process.env.WEB_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true });
const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function waitFor(fn) { await page.waitForFunction(fn); }
try {
  // Media APIs are controlled fixtures, not evidence of physical phone compatibility.
  await page.addInitScript(() => {
    window.mediaTest = { stops: 0, detects: 0, active: 0, maxActive: 0, mode: 'permission', grants: [], detections: [] };
    const state = window.mediaTest;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: () => new Promise(resolve => {
      state.grants.push(() => resolve({ getTracks: () => [{ stop: () => state.stops++ }] }));
    }) });
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, get() { return this.testStream; }, set(value) { this.testStream = value; } });
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
    HTMLMediaElement.prototype.play = async () => {};
    window.BarcodeDetector = class {
      static async getSupportedFormats() { return ['code_128']; }
      detect() {
        state.detects++; state.active++; state.maxActive = Math.max(state.maxActive, state.active);
        return new Promise(resolve => state.detections.push(() => { state.active--; resolve([{ rawValue: '  INVERTER-44  ' }]); }));
      }
    };
  });
  await page.goto(`${base}/spike`);
  await page.getByRole('heading', { name: 'Device capability check' }).waitFor();
  // Cancel before permission resolves: the late stream must immediately stop.
  await page.getByRole('button', { name: 'Scan with camera' }).click();
  await page.getByRole('button', { name: 'Cancel camera' }).click();
  await page.evaluate(() => window.mediaTest.grants.shift()());
  await waitFor(() => window.mediaTest.stops === 1);
  assert.equal(await page.getByRole('button', { name: 'Stop camera', exact: true }).count(), 0);
  // One slow detect at a time; a late detection after stop cannot deliver a scan.
  await page.getByRole('button', { name: 'Scan with camera' }).click();
  await page.evaluate(() => window.mediaTest.grants.shift()());
  await waitFor(() => window.mediaTest.detects === 1);
  await page.waitForTimeout(800); // Deliberately span three detector interval ticks.
  assert.equal(await page.evaluate(() => window.mediaTest.detects), 1);
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await page.evaluate(() => window.mediaTest.detections.shift()());
  assert.equal(await page.getByRole('heading', { name: /Scanned codes/ }).count(), 0);
  // A successful detection is delivered once and closes the camera.
  await page.getByRole('button', { name: 'Scan with camera' }).click();
  await page.evaluate(() => window.mediaTest.grants.shift()());
  await waitFor(() => window.mediaTest.detects === 2);
  await page.evaluate(() => window.mediaTest.detections.shift()());
  await page.getByRole('heading', { name: 'Scanned codes (1)' }).waitFor();
  assert.equal(await page.evaluate(() => window.mediaTest.maxActive), 1);
  assert.equal(await page.evaluate(() => window.mediaTest.stops), 3);
  // Keyboard scanner fallback.
  await page.getByRole('textbox', { name: 'Barcode / serial number' }).fill('MANUAL-44');
  await page.getByRole('textbox', { name: 'Barcode / serial number' }).press('Enter');
  await page.getByRole('heading', { name: 'Scanned codes (2)' }).waitFor();
  // Real image selection, preview, removal; no pretend server upload.
  await page.locator('input[type=file]').setInputFiles({ name: 'roof.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUi5rGwMDAxMDAwMDAAAAMWgESNbkt0AAAAABJRU5ErkJggg==', 'base64') });
  await page.getByAltText('Selected capture preview').waitFor();
  await page.getByAltText('Selected capture preview').evaluate(image => image.decode());
  await page.getByRole('button', { name: 'Remove photo' }).click();
  assert.equal(await page.getByAltText('Selected capture preview').count(), 0);
  // Pointer signature and actual PNG export; clear restores disabled export.
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  assert.ok(box);
  assert.equal(await page.getByRole('button', { name: 'Export PNG' }).isDisabled(), true);
  await page.mouse.move(box.x + 20, box.y + 30); await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 70, { steps: 8 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Export PNG' }).click();
  await page.getByText(/Exported image \(image\/png/).waitFor();
  await page.getByRole('button', { name: 'Clear signature' }).click();
  assert.equal(await page.getByRole('button', { name: 'Export PNG' }).isDisabled(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '360px has no page overflow');
  // Unmount while permission is pending, without reloading away the test harness.
  await page.getByRole('button', { name: 'Scan with camera' }).click();
  await page.getByRole('link', { name: /Back to home/ }).click();
  await page.evaluate(() => window.mediaTest.grants.shift()());
  await waitFor(() => window.mediaTest.stops === 4);
  assert.deepEqual(errors, []);
  console.log('PASS device browser: cancel/unmount late permission, one detection, stale results, fallback, photo, signature, 360px. Media is simulated; no real-phone claim.');
} finally { await context.close(); await browser.close(); }
