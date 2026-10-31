import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { FILE_MAX_BYTES } from '@sunshine/contracts';
import { ApiError } from '../platform/api-error';
export const unavailable = () => new ApiError(503, 'FILE_UNAVAILABLE', 'The private file is unavailable');
const inside = (path: string, parent: string) => path === parent || (!relative(parent, path).startsWith('..' + sep) && !isAbsolute(relative(parent, path)) && relative(parent, path) !== '..');

@Injectable()
export class PrivateFileStore {
  private readonly root: string;
  private readonly webRoot: string;
  constructor() {
    const repository = resolve(__dirname, '../../../..');
    this.root = resolve(repository, process.env.UPLOAD_DIR || 'var/uploads');
    this.webRoot = resolve(repository, 'apps/web');
    if (inside(this.root, this.webRoot) || inside(this.webRoot, this.root)) throw new Error('UPLOAD_DIR must be a dedicated directory outside the web tree');
  }
  private path(key: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(key)) throw unavailable();
    return resolve(this.root, key);
  }
  private async prepare() {
    await mkdir(this.root, { recursive: true });
    const actual = await realpath(this.root), web = await realpath(this.webRoot);
    if (inside(actual, web) || inside(web, actual)) throw unavailable();
  }
  async write(buffer: Buffer): Promise<string> {
    const key = randomUUID(); let created = false;
    try {
      await this.prepare();
      const handle = await open(this.path(key), 'wx', 0o600); created = true;
      try { await handle.writeFile(buffer); await handle.sync(); } finally { await handle.close(); }
      return key;
    } catch {
      if (created) await this.remove(key).catch(() => undefined);
      throw unavailable();
    }
  }
  async read(key: string, size: number, sha256: string): Promise<Buffer> {
    try {
      const handle = await open(this.path(key), 'r');
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size !== size || size < 1 || size > FILE_MAX_BYTES) throw unavailable();
        const buffer = await handle.readFile();
        if (buffer.length !== size || createHash('sha256').update(buffer).digest('hex') !== sha256) throw unavailable();
        return buffer;
      } finally { await handle.close(); }
    } catch { throw unavailable(); }
  }
  async remove(key: string) {
    try { await unlink(this.path(key)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
