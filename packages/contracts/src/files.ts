import { z } from 'zod';
export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const fileContextTypeSchema = z.enum(['JOB', 'TICKET']);
export const fileContextSchema = z.object({ contextType: fileContextTypeSchema, contextId: z.uuid() }).strict();
export type FileContext = z.infer<typeof fileContextSchema>;
export const uploadFileFieldsSchema = z.union([z.object({}).strict(), fileContextSchema]);
export const storedFileSchema = z.object({
  id: z.uuid(), originalName: z.string().min(1).max(150),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  sizeBytes: z.number().int().min(1).max(FILE_MAX_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  uploadedById: z.uuid(), createdAt: z.iso.datetime(),
  contextType: fileContextTypeSchema.nullable(), contextId: z.uuid().nullable(),
}).refine(value => (value.contextType === null) === (value.contextId === null), 'File association must be complete');
export type StoredFile = z.infer<typeof storedFileSchema>;
export const storedFileResponseSchema = z.object({ data: storedFileSchema });
