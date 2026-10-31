import { z } from 'zod';

export const staffRoleSchema = z.enum(['ADMIN', 'SALES', 'WAREHOUSE', 'TECHNICIAN', 'SUPPORT']);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const healthResponseSchema = z.object({
  data: z.object({
    service: z.literal('sunshine-api'),
    status: z.literal('ok'),
    timestamp: z.iso.datetime(),
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = z.object({
  data: z.object({ database: z.literal('ready') }),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())),
    requestId: z.uuid(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
