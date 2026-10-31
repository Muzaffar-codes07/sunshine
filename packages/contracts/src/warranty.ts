import { z } from 'zod';
import { moneySchema } from './shared';

export const warrantyStatusSchema = z.enum(['ACTIVE', 'EXPIRED', 'VOID']);
export const WarrantyStatus = warrantyStatusSchema.enum;
export type WarrantyStatus = z.infer<typeof warrantyStatusSchema>;

// A versioned policy snapshot; activation/evaluation services apply its scope
// and calendar duration. Warranty status alone does not determine coverage.
export const warrantyPolicySchema = z.object({
  policyName: z.string().trim().min(1),
  revision: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  durationMonths: z.number().int().positive(),
});
export type WarrantyPolicy = z.infer<typeof warrantyPolicySchema>;

export const warrantyAssessmentResultSchema = z.object({
  unitId: z.uuid(),
  serial: z.string().trim().min(1),
  policyName: z.string().trim().min(1),
  // IST calendar dates; coverage includes startDate and excludes expiryDate.
  startDate: z.iso.date(),
  expiryDate: z.iso.date(),
  isCovered: z.boolean(),
  reason: z.string().trim().min(1),
  customerCharge: moneySchema,
}).refine((value) => value.startDate < value.expiryDate, {
  path: ['expiryDate'],
  message: 'Expiry date must be after start date',
}).refine((value) => !value.isCovered || /^0(?:\.0{1,2})?$/.test(value.customerCharge), {
  path: ['customerCharge'],
  message: 'Covered work must have zero customer charge',
});
export type WarrantyAssessmentResult = z.infer<typeof warrantyAssessmentResultSchema>;
