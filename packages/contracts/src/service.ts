import { z } from 'zod';
import { moneySchema, positiveQuantitySchema } from './shared';

export const ticketStatusSchema = z.enum([
  'OPEN', 'ASSESSED', 'IN_PROGRESS', 'AWAITING_CUSTOMER_CONFIRMATION', 'CLOSED',
]);
export const TicketStatus = ticketStatusSchema.enum;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

// Totals are supplied by the service using decimal arithmetic and line rounding.
export const ticketLineSchema = z.object({
  type: z.enum(['PART', 'LABOUR']),
  description: z.string().trim().min(1),
  quantity: positiveQuantitySchema,
  unitCost: moneySchema,
  totalCost: moneySchema,
  // Set by the service from the saved coverage decision, never a client override.
  billableToCustomer: z.boolean(),
});
export type TicketLine = z.infer<typeof ticketLineSchema>;

export const customerConfirmationSchema = z.object({
  confirmerName: z.string().trim().min(1),
  channel: z.enum(['PHONE', 'WHATSAPP', 'IN_PERSON']),
  confirmedAt: z.iso.datetime({ offset: true }),
  notes: z.string().trim().optional(),
});
export type CustomerConfirmation = z.infer<typeof customerConfirmationSchema>;
