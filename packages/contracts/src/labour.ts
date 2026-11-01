import { z } from 'zod';
import { moneySchema, quantitySchema } from './shared';
const uuid = z.uuid().transform(value => value.toLowerCase());
export const createTechnicianRateSchema = z.strictObject({ technicianId: uuid, hourlyRate: moneySchema,
  reference: z.string().trim().min(5).max(500) });
export type CreateTechnicianRate = z.infer<typeof createTechnicianRateSchema>;
export const approveInstallationTimeSchema = z.strictObject({ rateRevisionId: uuid, note: z.string().trim().min(5).max(500) });
export type ApproveInstallationTime = z.infer<typeof approveInstallationTimeSchema>;
export const technicianRateSchema = z.object({ id: z.uuid(), technicianId: z.uuid(), hourlyRate: moneySchema,
  reference: z.string(), createdAt: z.iso.datetime(), createdById: z.uuid() });
export const technicianRateResponseSchema = z.object({ data: technicianRateSchema });
export const labourApprovalSchema = z.object({ rateRevisionId: z.uuid(), costEntryId: z.uuid(), elapsedMs: z.string().regex(/^[1-9]\d*$/),
  hours: quantitySchema, hourlyRate: moneySchema, amount: moneySchema, approvedById: z.uuid(), approvedAt: z.iso.datetime(), note: z.string() });
export const installationTimeSchema = z.object({ id: z.uuid(), jobId: z.uuid(), technicianId: z.uuid(), technicianName: z.string(),
  startedAt: z.iso.datetime(), finishedAt: z.iso.datetime(), jobStatus: z.string(), approval: labourApprovalSchema.nullable() });
export const installationTimeResponseSchema = z.object({ data: installationTimeSchema });
const pagination = { page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) };
export const installationTimeQuerySchema = z.strictObject({ ...pagination, status: z.enum(['PENDING','APPROVED','ALL']).default('PENDING'), jobId: uuid.optional() });
export type InstallationTimeQuery = z.infer<typeof installationTimeQuerySchema>;
export const installationTimeListSchema = z.object({ data: z.object({ items: z.array(installationTimeSchema), total: z.number().int().nonnegative(),
  page: z.number().int().positive(), pageSize: z.number().int().positive() }) });
export const technicianRatesQuerySchema = z.strictObject({ ...pagination, technicianId: uuid });
export type TechnicianRatesQuery = z.infer<typeof technicianRatesQuerySchema>;
export const technicianRatesListSchema = z.object({ data: z.object({ items: z.array(technicianRateSchema), total: z.number().int().nonnegative(),
  page: z.number().int().positive(), pageSize: z.number().int().positive() }) });
