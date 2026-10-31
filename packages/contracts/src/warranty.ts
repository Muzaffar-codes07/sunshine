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
  asOfDate: z.iso.date(),
  policyName: z.string().trim().min(1).nullable(),
  policyRevision: z.string().trim().min(1).nullable(),
  scope: z.string().trim().min(1).nullable(),
  // IST calendar dates; coverage includes startDate and excludes expiryDate.
  startDate: z.iso.date().nullable(),
  expiryDate: z.iso.date().nullable(),
  coverageStatus: z.enum(['COVERED', 'EXPIRED', 'VOID', 'NOT_STARTED', 'NO_WARRANTY', 'OUT_OF_SCOPE']),
  isCovered: z.boolean(),
  reason: z.string().trim().min(1),
  // Lookup cannot price repair work whose parts/labour have not been assessed.
  customerCharge: moneySchema.nullable(),
  chargeStatus: z.enum(['FREE', 'PENDING_ASSESSMENT']),
}).refine((value) => value.startDate === null || value.expiryDate === null || value.startDate < value.expiryDate, {
  path: ['expiryDate'],
  message: 'Expiry date must be after start date',
}).refine((value) => !value.isCovered || (value.customerCharge !== null && /^0(?:\.0{1,2})?$/.test(value.customerCharge)), {
  path: ['customerCharge'],
  message: 'Covered work must have zero customer charge',
}).refine((value) => value.isCovered === (value.coverageStatus === 'COVERED') &&
  (value.isCovered ? value.chargeStatus === 'FREE' :
    value.chargeStatus === 'PENDING_ASSESSMENT' && value.customerCharge === null), {
  message: 'Coverage and charge status must agree',
}).refine((value) => {
  const policy = [value.policyName, value.policyRevision, value.scope, value.startDate, value.expiryDate];
  return value.coverageStatus === 'NO_WARRANTY' ? policy.every((field) => field === null) :
    policy.every((field) => field !== null);
}, { message: 'A saved warranty requires its complete policy and dates' });
export type WarrantyAssessmentResult = z.infer<typeof warrantyAssessmentResultSchema>;

export const warrantyLookupQuerySchema = z.strictObject({
  serial: z.string().trim().min(1).max(128).transform((serial) => serial.toUpperCase()),
  manufacturerId: z.uuid().optional(),
  productId: z.uuid().optional(),
});
export type WarrantyLookupQuery = z.infer<typeof warrantyLookupQuerySchema>;

// Deliberately bounded projections: never expose ORM rows or customer contact details.
export const warrantyEquipmentSchema = z.object({
  unit: z.object({ id: z.uuid(), serial: z.string().trim().min(1), manufacturerId: z.uuid(), productId: z.uuid() }),
  customer: z.object({ id: z.uuid(), name: z.string().trim().min(1) }).nullable(),
  job: z.object({ id: z.uuid() }).nullable(),
});
export type WarrantyEquipment = z.infer<typeof warrantyEquipmentSchema>;
export const warrantyLookupResponseSchema = z.object({
  data: warrantyEquipmentSchema.extend({ assessment: warrantyAssessmentResultSchema }),
});
export type WarrantyLookupResponse = z.infer<typeof warrantyLookupResponseSchema>;
