// Real PostgreSQL guard checks. Only an explicitly disposable TEST_DATABASE_URL is accepted.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep, basename } from 'node:path';
const require = createRequire(import.meta.url);
const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) throw Error('Disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL = url;
process.env.SESSION_SECRET = 'file-evidence-tests-only-session-secret-2026';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/platform/prisma.service');
const { FilesService } = require('../dist/files/files.service');
const { PrivateFileStore } = require('../dist/files/private-file.store');
const { constraintError } = require('../dist/platform/constraint-errors');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=', 'base64');
let app, prisma, files, actor, directory;
before(async () => {
  const parent = resolve(import.meta.dirname, '../../../var');
  await mkdir(parent, { recursive: true }); directory = await mkdtemp(resolve(parent, 'file-evidence-test-'));
  process.env.UPLOAD_DIR = directory;
  app = await NestFactory.create(AppModule, { logger: false }); await app.init();
  prisma = app.get(PrismaService);
  // Synthetic context authorization only: these tests isolate File row immutability, not D3 assignment policy.
  files = new FilesService(prisma, app.get(PrivateFileStore), { assertAccess: async () => {} });
  const row = await prisma.user.create({ data: {
    email: randomUUID() + '@evidence.test', displayName: 'Evidence tester', role: 'ADMIN', passwordHash: 'test-only-not-a-login',
  } });
  actor = { id: row.id, email: row.email, displayName: row.displayName, role: row.role };
});
after(async () => {
  await app?.close();
  if (directory) {
    const parent = resolve(import.meta.dirname, '../../../var') + sep;
    if (!resolve(directory).startsWith(parent) || !basename(directory).startsWith('file-evidence-test-')) throw Error('Unsafe evidence fixture cleanup');
    await rm(directory, { recursive: true, force: true });
  }
});
const upload = async () => (await files.upload({ buffer: png, size: png.length, mimetype: 'image/png', originalname: 'evidence.png' }, {}, actor)).data;
const locked = promise => assert.rejects(promise, error => {
  const mapped = constraintError(error);
  assert.equal(mapped?.getStatus(), 409); assert.equal(mapped?.code, 'FILE_EVIDENCE_LOCKED');
  return true;
});

test('persisted metadata cannot be rewritten through Prisma or raw SQL', async () => {
  const file = await upload(), before = await prisma.file.findUniqueOrThrow({ where: { id: file.id } });
  for (const data of [
    { id: randomUUID() }, { storageKey: randomUUID() }, { originalName: 'changed.png' },
    { mediaType: 'application/pdf' }, { sizeBytes: png.length + 1 }, { sha256: 'a'.repeat(64) },
    { uploadedById: randomUUID() }, { createdAt: new Date('2020-01-01T00:00:00Z') },
  ]) await locked(prisma.file.update({ where: { id: file.id }, data }));
  await locked(prisma.$executeRawUnsafe('UPDATE files SET "sha256" = $2 WHERE id = $1::uuid', file.id, 'b'.repeat(64)));
  assert.deepEqual(await prisma.file.findUniqueOrThrow({ where: { id: file.id } }), before);
  assert.deepEqual((await files.download(file.id, actor)).buffer, png);
});

test('one initial association and same-record attachment remain allowed; rebind or unbind is refused', async () => {
  const file = await upload(), context = { contextType: 'JOB', contextId: randomUUID() };
  const first = await prisma.$transaction(tx => files.attach(tx, file.id, context, actor));
  const same = await prisma.$transaction(tx => files.attach(tx, file.id, context, actor));
  assert.deepEqual(same, first);
  await locked(prisma.file.update({ where: { id: file.id }, data: { contextId: randomUUID() } }));
  await locked(prisma.file.update({ where: { id: file.id }, data: { contextType: 'TICKET' } }));
  await locked(prisma.file.update({ where: { id: file.id }, data: { contextType: null, contextId: null } }));
  assert.equal((await prisma.file.findUniqueOrThrow({ where: { id: file.id } })).contextId, context.contextId);
  assert.deepEqual((await files.download(file.id, actor)).buffer, png);
});

test('a rolled-back initial attachment leaves the upload unbound and can be retried', async () => {
  const file = await upload(), context = { contextType: 'JOB', contextId: randomUUID() };
  await assert.rejects(prisma.$transaction(async tx => {
    await files.attach(tx, file.id, context, actor); throw Error('caller failed');
  }), /caller failed/);
  assert.equal((await prisma.file.findUniqueOrThrow({ where: { id: file.id } })).contextId, null);
  assert.equal((await prisma.$transaction(tx => files.attach(tx, file.id, context, actor))).contextId, context.contextId);
});

test('delete and truncate cannot erase persisted file evidence, including unbound uploads', async () => {
  const file = await upload(), count = await prisma.file.count();
  await locked(prisma.file.delete({ where: { id: file.id } }));
  await locked(prisma.$executeRawUnsafe('DELETE FROM files WHERE id = $1::uuid', file.id));
  await locked(prisma.$executeRawUnsafe('TRUNCATE TABLE files CASCADE'));
  assert.equal(await prisma.file.count(), count);
  assert.ok(await prisma.file.findUnique({ where: { id: file.id } }));
});
