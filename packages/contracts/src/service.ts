import { z } from 'zod';
import { moneySchema, positiveQuantitySchema } from './shared';
import { warrantyAssessmentResultSchema } from './warranty';

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

const versionSchema = z.number().int().positive().max(2147483646);
export const createTicketInputSchema = z.strictObject({
  unitId: z.uuid(),
  faultDescription: z.string().trim().min(1).max(4000),
});
export type CreateTicketInput = z.infer<typeof createTicketInputSchema>;

export const assessTicketInputSchema = z.strictObject({
  version: versionSchema,
  asOfDate: z.iso.datetime({ offset: true }),
  requestedScope: z.string().trim().min(1).max(500),
});
export type AssessTicketInput = z.infer<typeof assessTicketInputSchema>;

export const resolveTicketInputSchema = z.strictObject({
  version: versionSchema,
  resolutionDetails: z.string().trim().min(1).max(4000),
});
export type ResolveTicketInput = z.infer<typeof resolveTicketInputSchema>;

export const confirmTicketInputSchema = customerConfirmationSchema.extend({
  version: versionSchema,
  confirmerName: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4000).optional(),
}).strict();
export type ConfirmTicketInput = z.infer<typeof confirmTicketInputSchema>;

export const ticketAssessmentSnapshotSchema = warrantyAssessmentResultSchema.safeExtend({
  requestedScope: z.string().trim().min(1).max(500),
  assessedAt: z.iso.datetime({ offset: true }),
});
export type TicketAssessmentSnapshot = z.infer<typeof ticketAssessmentSnapshotSchema>;

export const serviceTicketSchema = z.object({
  id: z.uuid(), ticketNumber: z.string().min(1),
  customerId: z.uuid(), unitId: z.uuid(), jobId: z.uuid(),
  status: ticketStatusSchema, version: z.number().int().positive(),
  faultDescription: z.string().min(1),
  assessmentSnapshot: ticketAssessmentSnapshotSchema.nullable(),
  resolutionDetails: z.string().min(1).nullable(),
  resolvedAt: z.iso.datetime({ offset: true }).nullable(),
  confirmation: customerConfirmationSchema.nullable(),
  closedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ServiceTicket = z.infer<typeof serviceTicketSchema>;
export const serviceTicketResponseSchema = z.object({ data: serviceTicketSchema });
export type ServiceTicketResponse = z.infer<typeof serviceTicketResponseSchema>;
