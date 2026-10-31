import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';
import { repairItemsSchema, repairBillingResultSchema } from './repair-billing.types';

const uuid = z.uuid().transform((value) => value.toLowerCase());
export const replacementInputSchema = z.strictObject({
  ticketId: uuid, oldUnitId: uuid, newUnitId: uuid,
  assessmentDate: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
}).refine((value) => value.oldUnitId !== value.newUnitId, {
  path: ['newUnitId'], message: 'Replacement must be a different physical unit',
});
export type ReplacementInput = z.input<typeof replacementInputSchema>;

const unit = z.object({ id: uuid, serial: z.string().trim().min(1).max(128), jobId: uuid, customerId: uuid });
export const replacementStockResultSchema = z.object({
  oldUnit: unit.extend({ status: z.literal('QUARANTINED') }),
  newUnit: unit.extend({ status: z.literal('RESERVED'), replacesUnitId: uuid }),
  repairItems: repairItemsSchema,
}).refine((value) => value.repairItems.some((item) => item.type === 'PART'), {
  path: ['repairItems'], message: 'Replacement must include its actual consumed stock source',
});
export type ReplacementStockResult = z.infer<typeof replacementStockResultSchema>;
export type ReplacementStockCommand = z.output<typeof replacementInputSchema> & { jobId: string; customerId: string };

// Validate nonblank text without rewriting the persisted policy snapshot.
const policyText = z.string().refine((value) => value.trim().length > 0, { message: 'Policy text must be nonblank' });
export const continuedWarrantySchema = z.object({
  startDate: z.iso.date(), expiryDate: z.iso.date(), policyName: policyText,
  policyRevision: policyText, scope: policyText,
  durationMonths: z.number().int().positive().max(2147483647), active: z.boolean(),
}).refine((value) => value.startDate < value.expiryDate, { message: 'Warranty dates must be ordered' });
export const replacementResultSchema = z.object({
  ticketId: uuid, jobId: uuid, customerId: uuid, assessmentDate: z.iso.datetime(),
  oldUnit: unit.extend({ status: z.literal('QUARANTINED') }),
  newUnit: unit.extend({ status: z.literal('RESERVED'), replacesUnitId: uuid }),
  warranty: continuedWarrantySchema, billing: repairBillingResultSchema,
});
export type ReplacementResult = z.infer<typeof replacementResultSchema>;
export const replacementSnapshotSchema = z.object({
  revision: z.literal(1), requestHash: z.string().regex(/^[a-f0-9]{64}$/), result: replacementResultSchema,
});

export abstract class ReplacementStockWriter {
  /** D3-owned atomic stock primitive. Use ONLY tx; lock old/new units in stable
   * order, validate old installation and new availability/product compatibility,
   * release old active allocation into quarantine, allocate new to this ticket's
   * part line, preserve unit-level replacesUnitId and immutable RETURN/ISSUE
   * movements. Post actual consumed cost under STOCK_MOVEMENT:id/REPAIR_PARTS.
   * Return all actual work references/scope via the persisted RepairSourceReader;
   * each PART source must carry its existing allocation ticketLineId and frozen
   * cost/quantity/billability so billing can validate/reuse that line, not insert it.
   * reject reuse by another ticket. Never call new-sale warranty activation here.
   */
  abstract replace(tx: Prisma.TransactionClient, command: ReplacementStockCommand): Promise<ReplacementStockResult>;
}

@Injectable()
export class UnavailableReplacementStockWriter extends ReplacementStockWriter {
  async replace(_tx: Prisma.TransactionClient, _command: ReplacementStockCommand): Promise<ReplacementStockResult> {
    throw new ApiError(503, 'REPLACEMENT_STOCK_UNAVAILABLE', 'D3 replacement stock integration is unavailable');
  }
}
