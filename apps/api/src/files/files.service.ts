import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FILE_MAX_BYTES, fileContextSchema, storedFileSchema, type FileContext, type StaffIdentity, type StoredFile } from '@sunshine/contracts';
import type { File as FileRow, Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';
import { PrismaService } from '../platform/prisma.service';
import { FILE_RECORD_AUTHORIZER, type FileRecordAuthorizer } from './file-authorization.port';
import { PrivateFileStore } from './private-file.store';

export interface UploadedBytes { buffer: Buffer; size: number; mimetype: string; originalname: string; }
const denied = () => new ApiError(403, 'FORBIDDEN', 'You cannot access this file');
const missing = () => new ApiError(404, 'NOT_FOUND', 'File not found');
const invalid = (message: string) => new ApiError(400, 'INVALID_INPUT', message);
const contextOf = (row: FileRow): FileContext | null => row.contextType && row.contextId ? { contextType: row.contextType, contextId: row.contextId } : null;
export const fileView = (row: FileRow): StoredFile => storedFileSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });

/** Metadata exists only after the blob is fully persisted. Bound access always uses the domain adapter. */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: PrivateFileStore,
    @Optional() @Inject(FILE_RECORD_AUTHORIZER) private readonly records?: FileRecordAuthorizer,
  ) {}

  async upload(file: UploadedBytes | undefined, fields: FileContext | Record<string, never>, actor: StaffIdentity) {
    if (!file || !Buffer.isBuffer(file.buffer)) throw invalid('Choose one file to upload');
    if (file.buffer.length < 1 || file.buffer.length > FILE_MAX_BYTES || file.size !== file.buffer.length) throw invalid('File must be between 1 byte and 10 MiB');
    const mediaType = detectMediaType(file.buffer);
    if (!mediaType || mediaType !== file.mimetype.toLowerCase()) throw invalid('Declared type must match JPEG, PNG, WebP or PDF file bytes');
    const originalName = file.originalname.split(/[\\/]/).pop()?.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 150) || 'upload';
    const context = 'contextType' in fields ? fileContextSchema.parse(fields) : null;
    if (context && !this.records) throw new ApiError(503, 'FILE_AUTHORIZATION_UNAVAILABLE', 'Record file access is not configured');
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = await this.store.write(file.buffer);
    try {
      const row = await this.prisma.$transaction(async tx => {
        if (context) await this.authorize(tx, actor, context, 'UPLOAD');
        return tx.file.create({ data: {
          storageKey, originalName, mediaType, sizeBytes: file.size, sha256, uploadedById: actor.id,
          contextType: context?.contextType, contextId: context?.contextId,
        } });
      });
      return { data: fileView(row) };
    } catch (error) {
      await this.store.remove(storageKey).catch(() => this.logger.warn('Unreferenced private upload requires cleanup'));
      throw error;
    }
  }

  async download(id: string, actor: StaffIdentity) {
    const row = await this.prisma.$transaction(async tx => {
      const file = await tx.file.findUnique({ where: { id } });
      if (!file) throw missing();
      const context = contextOf(file);
      if (context) await this.authorize(tx, actor, context, 'DOWNLOAD');
      else if (file.uploadedById !== actor.id) throw denied();
      return file;
    });
    return { file: fileView(row), buffer: await this.store.read(row.storageKey, row.sizeBytes, row.sha256) };
  }

  /** Caller-owned transaction; an association cannot be moved to another job/ticket. */
  async attach(tx: Prisma.TransactionClient, id: string, context: FileContext, actor: StaffIdentity): Promise<StoredFile> {
    context = fileContextSchema.parse(context);
    const [locked] = await tx.$queryRawUnsafe<{ id: string }[]>('SELECT id FROM files WHERE id = $1::uuid FOR UPDATE', id);
    if (!locked) throw missing();
    const row = await tx.file.findUniqueOrThrow({ where: { id: locked.id } });
    const existing = contextOf(row);
    if (existing && (existing.contextType !== context.contextType || existing.contextId !== context.contextId.toLowerCase())) {
      throw new ApiError(409, 'FILE_ALREADY_ATTACHED', 'This file belongs to another record');
    }
    if (!existing && row.uploadedById !== actor.id) throw denied();
    await this.authorize(tx, actor, context, 'ATTACH');
    return fileView(await tx.file.update({ where: { id: row.id }, data: { contextType: context.contextType, contextId: context.contextId } }));
  }

  /** DB-only gate. Use download for byte preflight BEFORE a job/stock/money transaction. */
  async requireEvidence(tx: Prisma.TransactionClient, id: string, context: FileContext, actor: StaffIdentity): Promise<StoredFile> {
    context = fileContextSchema.parse(context);
    const row = await tx.file.findUnique({ where: { id } });
    if (!row || row.contextType !== context.contextType || row.contextId !== context.contextId.toLowerCase()) {
      throw new ApiError(409, 'EVIDENCE_REQUIRED', 'A persisted file attached to this record is required');
    }
    await this.authorize(tx, actor, context, 'DOWNLOAD');
    return fileView(row);
  }
  private async authorize(tx: Prisma.TransactionClient, actor: StaffIdentity, context: FileContext, action: 'UPLOAD' | 'DOWNLOAD' | 'ATTACH') {
    if (!this.records) throw new ApiError(503, 'FILE_AUTHORIZATION_UNAVAILABLE', 'Record file access is not configured');
    await this.records.assertAccess(tx, actor, context, action);
  }
}

/** Identifies permitted container signatures, not authenticity, virus safety or full decoding. */
export function detectMediaType(bytes: Buffer): StoredFile['mediaType'] | null {
  if (bytes.length >= 4 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) && bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) return 'image/jpeg';
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR') return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length) return 'image/webp';
  if (bytes.length >= 12 && /^%PDF-[12]\.[0-9]/.test(bytes.toString('ascii', 0, 8)) && /%%EOF\s*$/.test(bytes.subarray(-1024).toString('ascii'))) return 'application/pdf';
  return null;
}
