import { z } from 'zod';
import { moneySchema, quantitySchema, signedMoneySchema } from './shared';

// [startDate, endDate) in Asia/Kolkata. Query services convert IST midnight
// boundaries to UTC; dates stay strings at the API boundary.
export const dateRangeFilterSchema = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
}).refine((value) => value.startDate < value.endDate, {
  path: ['endDate'],
  message: 'End date must be after start date (exclusive)',
});
export type DateRangeFilter = z.infer<typeof dateRangeFilterSchema>;

// Lifetime posted amounts as of the query cutoff, not period-only profit.
// isCompleted distinguishes completed results from provisional unfinished work.
export const jobProfitabilitySchema = z.object({
  jobId: z.uuid(),
  isCompleted: z.boolean(),
  invoicedRevenue: moneySchema,
  cashReceived: moneySchema,
  outstanding: moneySchema,
  actualCost: moneySchema,
  contribution: signedMoneySchema,
});
export type JobProfitability = z.infer<typeof jobProfitabilitySchema>;

// One technician in the requested period. Sum frozen per-entry pay rates;
// a single current hourly rate must not reprice historical time entries.
export const paySummarySchema = z.object({
  technicianId: z.uuid(),
  technicianName: z.string().trim().min(1),
  totalHours: quantitySchema,
  totalPay: moneySchema,
});
export type PaySummary = z.infer<typeof paySummarySchema>;

// Reporting projection, not a command to update subsidy status or post cash.
// Stage/status are workflow labels; no legal eligibility or award is implied.
export const subsidyMilestoneSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  stage: z.string().trim().min(1),
  status: z.string().trim().min(1),
  submissionDate: z.iso.datetime({ offset: true }).nullable(),
  approvalDate: z.iso.datetime({ offset: true }).nullable(),
  amount: moneySchema,
  evidenceFileId: z.uuid().nullable(),
}).refine((value) => value.submissionDate === null || value.approvalDate === null
  || Date.parse(value.submissionDate) <= Date.parse(value.approvalDate), {
  path: ['approvalDate'],
  message: 'Approval date cannot precede submission date',
});
export type SubsidyMilestone = z.infer<typeof subsidyMilestoneSchema>;
