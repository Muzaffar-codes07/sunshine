import { z } from 'zod';
import { moneySchema } from './shared';

export const costTypeSchema = z.enum([
  'MATERIAL_DISPATCH', 'INSTALLATION_LABOUR', 'SERVICE_LABOUR', 'REPAIR_PARTS',
]);
export const CostType = costTypeSchema.enum;
export type CostType = z.infer<typeof costTypeSchema>;

export const createCostEntryInputSchema = z.object({
  uniqueSourceId: z.string().trim().min(1),
  jobId: z.uuid(),
  amount: moneySchema,
  costType: costTypeSchema,
  description: z.string().trim().min(1),
});
export type CreateCostEntryInput = z.infer<typeof createCostEntryInputSchema>;
