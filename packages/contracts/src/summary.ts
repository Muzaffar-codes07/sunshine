import { z } from 'zod';
import { enquiryStatusSchema } from './sales';
import { surveyStatusSchema } from './survey';
import { quoteStatusSchema } from './quotes';
import { invoiceStatusSchema } from './orders';
import { moneySchema } from './shared';

// D2 project summary (TRD section 2): a read-only view of one customer's progress from enquiry to payment, with
// the stage and the next step for staff. It never writes; D3 and D4 phases are reported by their own modules.

export const projectStageSchema = z.enum(['ENQUIRY', 'SURVEY', 'QUOTE', 'ORDER', 'PAID', 'CLOSED']);
export type ProjectStage = z.infer<typeof projectStageSchema>;

export const nextStepCodeSchema = z.enum([
  'QUALIFY_ENQUIRY', 'SCHEDULE_SURVEY', 'RECORD_SURVEY', 'DECIDE_SURVEY', 'RESCHEDULE_SURVEY',
  'CREATE_QUOTE', 'SEND_QUOTE', 'RECORD_QUOTE_DECISION', 'REVISE_QUOTE', 'CONFIRM_ORDER',
  'RECORD_ADVANCE', 'COLLECT_BALANCE', 'NONE',
]);

export const projectSummarySchema = z.object({
  enquiry: z.object({
    id: z.uuid(), status: enquiryStatusSchema, contactName: z.string(), siteCity: z.string(),
    requestedCapacityKw: z.number().int(), ownerId: z.uuid().nullable(), nextFollowUpAt: z.iso.datetime().nullable(),
  }),
  survey: z.object({
    id: z.uuid(), revision: z.number().int(), status: surveyStatusSchema, scheduledFor: z.iso.datetime(), technicianName: z.string(),
  }).nullable(),
  quote: z.object({ id: z.uuid(), revision: z.number().int(), status: quoteStatusSchema, totalPrice: moneySchema }).nullable(),
  order: z.object({ id: z.uuid(), displayNumber: z.string(), jobId: z.uuid().nullable(), released: z.boolean() }).nullable(),
  invoice: z.object({
    id: z.uuid(), displayNumber: z.string(), status: invoiceStatusSchema, total: moneySchema, paidAmount: moneySchema, balance: moneySchema,
  }).nullable(),
  stage: projectStageSchema,
  nextStep: z.object({ code: nextStepCodeSchema, text: z.string() }),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export const projectSummaryResponseSchema = z.object({ data: projectSummarySchema });
