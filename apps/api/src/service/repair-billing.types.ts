import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { moneySchema, positiveQuantitySchema, ticketLineSchema } from '@sunshine/contracts';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';

export const repairItemSchema = z.strictObject({ type: z.enum(['PART', 'LABOUR']), sourceId: z.uuid() });
export const repairItemsSchema = z.array(repairItemSchema).min(1).max(200).superRefine((items, ctx) => {
  const keys = items.map((item) => `${item.type}:${item.sourceId.toLowerCase()}`);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Repair sources must be unique' });
});
export type RepairItem = z.infer<typeof repairItemSchema>;

// Trusted persisted facts, never values accepted from an HTTP request.
export const repairSourceSchema = repairItemSchema.extend({
  ticketId: z.uuid(), jobId: z.uuid(), customerId: z.uuid(),
  scope: z.string().trim().min(1).max(500), description: z.string().trim().min(1).max(4000),
  quantity: positiveQuantitySchema, unitCost: moneySchema, unitPrice: moneySchema,
  // PART allocation already owns this persisted line; never accept it from clients.
  ticketLineId: z.uuid().transform((value) => value.toLowerCase()).optional(),
}).refine((value) => value.type === 'PART' ? value.ticketLineId !== undefined : value.ticketLineId === undefined, {
  path: ['ticketLineId'], message: 'Only PART sources must name their existing allocation ticket line',
});
export type RepairSource = z.infer<typeof repairSourceSchema>;

export const repairBillingLineSchema = ticketLineSchema.extend({
  sourceId: z.uuid(), unitPrice: moneySchema, totalPrice: moneySchema,
  // Optional on saved results to retain replay of pre-integration billing snapshots.
  ticketLineId: z.uuid().optional(),
});
export const repairBillingResultSchema = z.object({
  ticketId: z.uuid(), jobId: z.uuid(), customerId: z.uuid(),
  internalCost: moneySchema, customerCharge: moneySchema, invoiceId: z.uuid().nullable(),
  lines: z.array(repairBillingLineSchema).min(1).max(200),
});
export type RepairBillingResult = z.infer<typeof repairBillingResultSchema>;
export const repairBillingSnapshotSchema = z.object({
  revision: z.literal(1), requestHash: z.string().regex(/^[a-f0-9]{64}$/), result: repairBillingResultSchema,
});

export abstract class RepairSourceReader {
  /** Same tx: consumed stock movement / approved service time, bound to this ticket,
   * original installation and actual work scope; frozen acquisition/pay and selling
   * rates. Lock/recheck eligibility and prevent reuse by another ticket. No network IO.
   * D3 posts PART costs using STOCK_MOVEMENT:<id> before returning the source.
   * PART ticketLineId must be the actual allocation-source line, one per consumed
   * source, with matching frozen quantities/costs and assessed billability.
   * Lock/recheck that line and its movement/allocation linkage in this tx.
   */
  abstract read(tx: Prisma.TransactionClient, ticketId: string, items: RepairItem[]): Promise<RepairSource[]>;
}

@Injectable()
export class UnavailableRepairSourceReader extends RepairSourceReader {
  async read(): Promise<RepairSource[]> {
    throw new ApiError(503, 'REPAIR_SOURCES_UNAVAILABLE', 'Persisted repair stock and approved time integration is unavailable');
  }
}
