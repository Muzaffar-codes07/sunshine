import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const root = resolve(import.meta.dirname, '..');
config({ path: resolve(root, '.env'), quiet: true });
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--base-url'),
  'Usage: node scripts/smoke.mjs [--base-url http://127.0.0.1:3001]');
let externalBase;
if (args.length) {
  const url = new URL(args[1]);
  assert.ok(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
    url.pathname === '/' && !url.search && !url.hash, 'Base URL must be an HTTP(S) origin without credentials');
  externalBase = url.origin;
} else {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required; start local PostgreSQL and apply migrations first.');
}
const request = (url) => fetch(url, { signal: AbortSignal.timeout(10000) });

async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

async function withApi(databaseUrl, check) {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATABASE_URL: databaseUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const base = `http://127.0.0.1:${port}`;
  // Drain both pipes without printing server logs (which may contain secrets).
  child.stdout.resume();
  child.stderr.resume();
  let spawnError;
  child.on('error', (error) => { spawnError = error; });
  try {
    let started = false;
    for (let i = 0; i < 100; i++) {
      if (spawnError) throw new Error('API process could not start');
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`API exited before becoming healthy`);
      try {
        const response = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) { started = true; break; }
      } catch { /* wait for startup */ }
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.ok(started, 'API did not start within 10 seconds');
    await check(base);
  } finally {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      let timer;
      try {
        child.kill('SIGTERM');
        timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        await stopped;
      } finally { clearTimeout(timer); }
    }
  }
}

async function checkRelease(base) {
  const healthResponse = await request(`${base}/api/v1/health`);
  assert.equal(healthResponse.status, 200);
  const health = await healthResponse.json();
  assert.equal(health.data.service, 'sunshine-api');
  const ready = await request(`${base}/api/v1/health/ready`);
  assert.equal(ready.status, 200, 'PostgreSQL readiness failed');
  assert.equal((await ready.json()).data.database, 'ready');
  for (const path of ['/', '/sales']) {
    const page = await request(`${base}${path}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>Sunshine/);
  }
  const missing = await request(`${base}/api/v1/not-a-route`);
  assert.equal(missing.status, 404, 'API 404 must not return the SPA');
  const error = await missing.json();
  assert.equal(error.error.code, 'NOT_FOUND');
  assert.match(error.error.requestId, /^[a-f0-9-]{36}$/);
  console.log('PASS: liveness, PostgreSQL readiness, SPA/deep-link serving and structured API 404.');
}

if (externalBase) {
  await checkRelease(externalBase);
  console.log('PASS: running release checked over HTTP; unavailable-DB isolation is covered by native npm run smoke.');
} else {
  await withApi(process.env.DATABASE_URL, checkRelease);
  const unavailable = new URL(process.env.DATABASE_URL);
  unavailable.hostname = '127.0.0.1';
  unavailable.port = String(await unusedPort());
  await withApi(unavailable.toString(), async (base) => {
    const response = await request(`${base}/api/v1/health/ready`);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
    assert.ok(!JSON.stringify(body).includes(process.env.DATABASE_URL));
    assert.equal((await request(`${base}/api/v1/health`)).status, 200);
    console.log('PASS: unavailable database returns sanitized 503 while liveness stays healthy.');
  });
}
