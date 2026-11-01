import { z } from 'zod';
import { moneySchema, positiveQuantitySchema, unitCostRateSchema } from './shared';

const version = z.number().int().positive().max(2147483646);
const savedVersion = z.number().int().positive().max(2147483647);
export const createTicketPartSchema = z.strictObject({
  version, productId: z.uuid().transform(value => value.toLowerCase()), quantity: positiveQuantitySchema,
  scope: z.string().trim().min(1).max(500), reason: z.string().trim().min(5).max(500),
});
export type CreateTicketPart = z.infer<typeof createTicketPartSchema>;
export const cancelTicketPartSchema = z.strictObject({ version, lineVersion: version, reason: z.string().trim().min(5).max(500) });
export type CancelTicketPart = z.infer<typeof cancelTicketPartSchema>;
export const ticketPartSchema = z.object({
  id: z.uuid(), ticketId: z.uuid(), version:savedVersion, phase: z.enum(['LEGACY','PLANNED','ISSUED','CANCELLED']),
  product: z.object({ id:z.uuid(),name:z.string(),trackingMode:z.enum(['SERIALIZED','BULK','NONE']) }).nullable(),
  description:z.string(),quantity:positiveQuantitySchema,scope:z.string().nullable(),
  unitPrice:moneySchema.nullable(),unitCost:unitCostRateSchema.nullable(),totalCost:moneySchema.nullable(),
  billableToCustomer:z.boolean(),createdAt:z.iso.datetime(),createdById:z.uuid().nullable(),
  cancelledAt:z.iso.datetime().nullable(),cancelledById:z.uuid().nullable(),cancellationReason:z.string().nullable(),
});
export const ticketPartCommandResponseSchema = z.object({ data:z.object({ ticketVersion:savedVersion,part:ticketPartSchema }) });
export const ticketPartsQuerySchema = z.strictObject({
  page:z.coerce.number().int().min(1).max(10000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(20),
});
export type TicketPartsQuery = z.infer<typeof ticketPartsQuerySchema>;
export const ticketPartsResponseSchema = z.object({ data:z.object({
  items:z.array(ticketPartSchema),total:z.number().int().nonnegative(),page:z.number().int().positive(),pageSize:z.number().int().positive(),
}) });
