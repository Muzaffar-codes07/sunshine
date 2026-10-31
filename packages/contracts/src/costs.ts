import { z } from 'zod';
import { signedMoneySchema } from './shared';

export const costTypeSchema = z.enum([
  'MATERIAL_DISPATCH', 'INSTALLATION_LABOUR', 'SERVICE_LABOUR', 'REPAIR_PARTS',
]);
export const CostType = costTypeSchema.enum;
export type CostType = z.infer<typeof costTypeSchema>;

// PostgreSQL timestamptz(3) must retain the exact caller instant on replay.
export const costOccurrenceSchema = z.iso.datetime({ offset: true }).refine(
  (value) => !/\.\d{4,}/.test(value),
  'Cost occurrence time supports millisecond precision',
);

export const createCostEntryInputSchema = z.object({
  uniqueSourceId: z.string().trim().min(1),
  jobId: z.uuid().transform((value) => value.toLowerCase()),
  amount: signedMoneySchema,
  costType: costTypeSchema,
  description: z.string().trim().min(1),
  occurredAt: costOccurrenceSchema,
  reversalOfId: z.uuid().transform((value) => value.toLowerCase()).optional(),
}).superRefine((value, ctx) => {
  if (value.reversalOfId) {
    if (value.uniqueSourceId !== `REVERSAL:${value.reversalOfId}`) {
      ctx.addIssue({ code: 'custom', path: ['uniqueSourceId'], message: 'Use REVERSAL:<original cost ID>' });
    }
    if (!value.amount.startsWith('-') && /[1-9]/.test(value.amount)) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'A reversal must negate the original cost' });
    }
  } else if (value.amount.startsWith('-') || /^REVERSAL:/i.test(value.uniqueSourceId)) {
    ctx.addIssue({ code: 'custom', message: 'Negative amounts and REVERSAL sources require reversalOfId' });
  }
});
export type CreateCostEntryInput = z.infer<typeof createCostEntryInputSchema>;
