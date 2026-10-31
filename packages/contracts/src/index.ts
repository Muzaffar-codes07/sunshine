import { z } from 'zod';

export * from './staff';

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

const upperCode = z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Use an UPPER_SNAKE_CASE code');

/**
 * Why a command was refused (TRD decision M3), carried by 409 errors in `error.reasons`. Safe to show to staff:
 * `reason` says what is missing, `source` names the module whose fact blocked it (SURVEY, PAYMENT, STOCK…),
 * `nextAction` says what to do. A readiness check that finds several gaps returns all of them.
 */
export const refusalReasonSchema = z.object({
  code: upperCode,
  reason: z.string().min(1).max(300),
  source: upperCode,
  nextAction: z.string().min(1).max(300),
}).strict();
export type RefusalReason = z.infer<typeof refusalReasonSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())),
    requestId: z.uuid(),
    reasons: z.array(refusalReasonSchema).min(1).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export * from './sales';
export * from './commands';
export * from './enquiry-queue';
export * from './survey';
export * from './auth';

export * from './shared';
export * from './catalogue';
export * from './quotes';
