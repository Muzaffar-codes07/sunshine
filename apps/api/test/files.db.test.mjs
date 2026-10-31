// Real PostgreSQL and private disk checks. Explicitly disposable database and owned fixture directory only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, writeFile, unlink, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
const require = createRequire(import.meta.url);
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) throw Error('Disposable TEST_DATABASE_URL required');
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'files-test-only-session-secret-2026';
process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:3001';
process.env.SESSION_COOKIE_SECURE = 'false';
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ApiExceptionFilter } = require('../dist/platform/api-exception.filter');
const { PrismaService } = require('../dist/platform/prisma.service');
const { ApiError } = require('../dist/platform/api-error');
const { FilesService } = require('../dist/files/files.service');
const { PrivateFileStore } = require('../dist/files/private-file.store');
const { hashPassword } = require('../dist/auth/passwords');
const { FILE_MAX_BYTES, storedFileSchema } = require('@sunshine/contracts');
const origin = 'http://127.0.0.1:3001', password = 'files-test-password-2026';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1kAAAAASUVORK5CYII=', 'base64');
const jpeg = Buffer.from([255,216,255,224,0,2,255,217]);
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4,0,0,0]), Buffer.from('WEBP')]);
const upload = (buffer = png, mimetype = 'image/png', originalname = 'photo.png') => ({ buffer, size: buffer.length, mimetype, originalname });
const expectCode = (promise, status, code) => assert.rejects(promise, e => e.getStatus() === status && e.code === code);
let app, base, prisma, files, store, directory, technician, other, cookie, otherCookie;
const actor = row => ({ id: row.id, email: row.email, displayName: row.displayName, role: row.role });
const login = async row => {
  const r = await fetch(base + '/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: row.email, password }) });
  assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0];
};
before(async () => {
  const parent = resolve(import.meta.dirname, '../../../var');
  await mkdir(parent, { recursive: true });
  directory = await mkdtemp(resolve(parent, 'files-test-'));
  process.env.UPLOAD_DIR = directory;
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1'); app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1'); base = (await app.getUrl()) + '/api/v1';
  prisma = app.get(PrismaService); files = app.get(FilesService); store = app.get(PrivateFileStore);
  const makeUser = async role => prisma.user.create({ data: { email: randomUUID() + '@test.local', displayName: 'File tester', role, passwordHash: await hashPassword(password) } });
  technician = await makeUser('TECHNICIAN'); other = await makeUser('ADMIN');
  cookie = await login(technician); otherCookie = await login(other);
});
after(async () => {
  await app?.close();
  if (directory) {
    const parent = resolve(import.meta.dirname, '../../../var') + sep;
    if (!resolve(directory).startsWith(parent) || !directory.split(sep).pop().startsWith('files-test-')) throw Error('Unsafe fixture cleanup');
    await rm(directory, { recursive: true, force: true });
  }
});

test('persisted uploads return safe metadata and exact private bytes, with no storage key in the DTO', async () => {
  const { data } = await files.upload(upload(png, 'image/png', '../nested/photo.png'), {}, actor(technician));
  assert.ok(storedFileSchema.safeParse(data).success);
  assert.equal(data.originalName, 'photo.png');
  assert.equal(data.sha256, createHash('sha256').update(png).digest('hex'));
  assert.equal('storageKey' in data, false);
  assert.deepEqual((await files.download(data.id.toUpperCase(), actor(technician))).buffer, png);
  await expectCode(files.download(data.id, actor(other)), 403, 'FORBIDDEN');
  const row = await prisma.file.findUniqueOrThrow({ where: { id: data.id } });
  assert.deepEqual(await readFile(resolve(directory, row.storageKey)), png);
  for (const [bytes, type] of [[jpeg, 'image/jpeg'], [pdf, 'application/pdf'], [webp, 'image/webp']]) {
    assert.equal((await files.upload(upload(bytes, type), {}, actor(technician))).data.mediaType, type);
  }
});

test('missing, empty, oversize, forged and mismatched uploads leave no metadata or blobs', async () => {
  const count = await prisma.file.count(), disk = await readdir(directory);
  for (const value of [undefined, upload(Buffer.alloc(0)), upload(Buffer.alloc(FILE_MAX_BYTES + 1)), upload(Buffer.from('<html/>')), upload(png, 'application/pdf')]) {
    await expectCode(files.upload(value, {}, actor(technician)), 400, 'INVALID_INPUT');
  }
  assert.equal(await prisma.file.count(), count); assert.deepEqual(await readdir(directory), disk);
});

test('failed disk persistence or a failed metadata transaction never creates usable evidence', async () => {
  const count = await prisma.file.count(), disk = await readdir(directory);
  const broken = new FilesService(prisma, { write: async () => { throw new ApiError(503, 'FILE_UNAVAILABLE', 'Unavailable'); } });
  await expectCode(broken.upload(upload(), {}, actor(technician)), 503, 'FILE_UNAVAILABLE');
  await assert.rejects(files.upload(upload(), {}, { ...actor(technician), id: randomUUID() }));
  assert.equal(await prisma.file.count(), count); assert.deepEqual(await readdir(directory), disk);
});

test('bound upload and download fail closed without the record adapter, including for the uploader', async () => {
  // Jobs have their rules now. Ticket files stay closed until D4 supplies its own.
  const context = { contextType: 'TICKET', contextId: randomUUID() }, disk = await readdir(directory);
  await expectCode(files.upload(upload(), context, actor(technician)), 503, 'FILE_AUTHORIZATION_UNAVAILABLE');
  assert.deepEqual(await readdir(directory), disk);
  const allowed = new FilesService(prisma, store, { assertAccess: async () => {} });
  const row = (await allowed.upload(upload(), context, actor(technician))).data;
  await expectCode(files.download(row.id, actor(technician)), 503, 'FILE_AUTHORIZATION_UNAVAILABLE');
});

test('record authorization covers upload, download and attach; rejected writes remove the stored bytes', async () => {
  const calls = [], context = { contextType: 'JOB', contextId: randomUUID() };
  const guarded = new FilesService(prisma, store, { assertAccess: async (tx, user, target, action) => {
    assert.equal(typeof tx.file.findUnique, 'function'); calls.push(action);
    if (user.id !== technician.id || target.contextId.toLowerCase() !== context.contextId) throw new ApiError(403, 'FORBIDDEN', 'Record access denied');
  } });
  const disk = await readdir(directory);
  await expectCode(guarded.upload(upload(), context, actor(other)), 403, 'FORBIDDEN');
  assert.deepEqual(await readdir(directory), disk);
  const orphan = (await guarded.upload(upload(), {}, actor(technician))).data;
  await expectCode(prisma.$transaction(tx => guarded.requireEvidence(tx, orphan.id, context, actor(technician))), 409, 'EVIDENCE_REQUIRED');
  await assert.rejects(prisma.$transaction(async tx => { await guarded.attach(tx, orphan.id, context, actor(technician)); throw Error('rollback'); }), /rollback/);
  assert.equal((await prisma.file.findUniqueOrThrow({ where: { id: orphan.id } })).contextId, null);
  await prisma.$transaction(tx => guarded.attach(tx, orphan.id.toUpperCase(), { ...context, contextId: context.contextId.toUpperCase() }, actor(technician)));
  assert.deepEqual((await guarded.download(orphan.id, actor(technician))).buffer, png);
  await expectCode(guarded.download(orphan.id, actor(other)), 403, 'FORBIDDEN');
  await prisma.$transaction(tx => guarded.requireEvidence(tx, orphan.id, context, actor(technician)));
  await expectCode(prisma.$transaction(tx => guarded.requireEvidence(tx, orphan.id, { ...context, contextId: randomUUID() }, actor(technician))), 409, 'EVIDENCE_REQUIRED');
  await expectCode(prisma.$transaction(tx => guarded.attach(tx, orphan.id, { contextType: 'TICKET', contextId: randomUUID() }, actor(technician))), 409, 'FILE_ALREADY_ATTACHED');
  assert.ok(['UPLOAD', 'DOWNLOAD', 'ATTACH'].every(action => calls.includes(action)));
});

test('concurrent attachments cannot bind one upload to two records', async () => {
  const guarded = new FilesService(prisma, store, { assertAccess: async () => {} });
  const row = (await guarded.upload(upload(), {}, actor(technician))).data;
  const contexts = [1,2].map(() => ({ contextType: 'JOB', contextId: randomUUID() }));
  const results = await Promise.allSettled(contexts.map(c => prisma.$transaction(tx => guarded.attach(tx, row.id, c, actor(technician)))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'FILE_ALREADY_ATTACHED');
});

test('missing and modified blobs refuse download with a sanitized 503', async () => {
  for (const change of ['remove', 'alter']) {
    const row = (await files.upload(upload(), {}, actor(technician))).data;
    const metadata = await prisma.file.findUniqueOrThrow({ where: { id: row.id } });
    const path = resolve(directory, metadata.storageKey);
    if (change === 'remove') await unlink(path); else await writeFile(path, Buffer.alloc(png.length));
    await expectCode(files.download(row.id, actor(technician)), 503, 'FILE_UNAVAILABLE');
  }
});

test('database rejects impossible file metadata and partial associations', async () => {
  const row = (await files.upload(upload(), {}, actor(technician))).data;
  for (const data of [{sizeBytes:0}, {sizeBytes:FILE_MAX_BYTES+1}, {sha256:'xyz'}, {mediaType:'text/html'}, {storageKey:'../../secret'}, {originalName:' '}, {contextType:'JOB',contextId:null}]) {
    await assert.rejects(prisma.file.update({ where:{id:row.id}, data }));
  }
});

test('HTTP multipart requires login and trusted origin, bounds the request and serves authorized attachments only', async () => {
  const form = (bytes = png, fields = {}) => {
    const body = new FormData(); body.append('file', new Blob([bytes], { type:'image/png' }), 'photo.png');
    for (const [key,value] of Object.entries(fields)) body.append(key,value);
    return body;
  };
  const post = (body, auth = cookie, source = origin) => fetch(base + '/files', { method:'POST', headers:{ ...(auth && {cookie:auth}), ...(source && {origin:source}) }, body });
  assert.equal((await post(form(), null)).status,401);
  assert.equal((await post(form(), cookie, 'https://untrusted.invalid')).status,403);
  assert.equal((await post(form(), cookie, null)).status,403);
  assert.equal((await post(form(png, {uploadedById:other.id}))).status,400);
  assert.equal((await post(form(png, {contextType:'JOB'}))).status,400);
  assert.equal((await post(form(Buffer.alloc(FILE_MAX_BYTES+1)))).status,413);
  const response = await post(form()); assert.equal(response.status,201);
  const {data} = await response.json();
  const get = await fetch(base + '/files/' + data.id, {headers:{cookie}});
  assert.equal(get.status,200); assert.match(get.headers.get('content-disposition'),/^attachment; filename="[a-f0-9-]+\.png"$/);
  assert.equal(get.headers.get('cache-control'),'private, no-store'); assert.equal(get.headers.get('x-content-type-options'),'nosniff');
  assert.deepEqual(Buffer.from(await get.arrayBuffer()),png);
  assert.equal((await fetch(base + '/files/' + data.id)).status,401);
  assert.equal((await fetch(base + '/files/' + data.id,{headers:{cookie:otherCookie}})).status,403);
  const metadata = await prisma.file.findUniqueOrThrow({where:{id:data.id}});
  const staticRead = await fetch(base.replace('/api/v1','') + '/uploads/' + metadata.storageKey);
  assert.ok(!Buffer.from(await staticRead.arrayBuffer()).equals(png), 'private bytes are never a static asset');
});

test('JPEG container detection preserves trailing phone metadata after the end marker', async () => {
  const bytes = Buffer.concat([jpeg, Buffer.from('MotionPhoto_Data: trailing private metadata')]);
  const {data} = await files.upload(upload(bytes, 'image/jpeg', 'phone-photo.jpg'), {}, actor(technician));
  assert.equal(data.mediaType, 'image/jpeg');
  assert.equal(data.sizeBytes, bytes.length);
  assert.deepEqual((await files.download(data.id, actor(technician))).buffer, bytes);
  await expectCode(files.upload(upload(jpeg.subarray(0, -2), 'image/jpeg'), {}, actor(technician)), 400, 'INVALID_INPUT');
});
