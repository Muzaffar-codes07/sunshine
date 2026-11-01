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

// Aggregates may exceed a single numeric(14,2) row and include reversals.
export const reportAmountSchema = z.string().regex(/^-?(0|[1-9]\d*)\.\d{2}$/)
  .refine((value) => value !== '-0.00');
export const reportPeriodSchema = z.enum(['today', 'week', 'month']);
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
export const profitabilityQuerySchema = z.strictObject({ jobId: z.uuid() });
export const overviewQuerySchema = z.strictObject({ period: reportPeriodSchema.default('today') });
export const emptyReportQuerySchema = z.strictObject({});

export const reportCostBreakdownSchema = z.object({
  material: reportAmountSchema,
  installationLabour: reportAmountSchema,
  serviceLabour: reportAmountSchema,
  repairParts: reportAmountSchema,
});
export const jobProfitabilityReportSchema = jobProfitabilitySchema.extend({
  asOf: z.iso.datetime(),
  invoicedRevenue: reportAmountSchema,
  cashReceived: reportAmountSchema,
  outstanding: reportAmountSchema,
  actualCost: reportAmountSchema,
  contribution: reportAmountSchema,
  costBreakdown: reportCostBreakdownSchema,
  isProvisional: z.boolean(),
  unfinishedSteps: z.array(z.string().trim().min(1)),
  completedProfit: reportAmountSchema,
  marginPercentage: reportAmountSchema.nullable(),
});
export type JobProfitabilityReport = z.infer<typeof jobProfitabilityReportSchema>;

export const periodSummarySchema = z.object({
  period: reportPeriodSchema,
  timezone: z.literal('Asia/Kolkata'),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  startUtc: z.iso.datetime(),
  endUtc: z.iso.datetime(),
  asOf: z.iso.datetime(),
  invoicedRevenue: reportAmountSchema,
  cashReceived: reportAmountSchema,
  actualCost: reportAmountSchema,
  costBreakdown: reportCostBreakdownSchema,
});
export type PeriodSummary = z.infer<typeof periodSummarySchema>;

export const subsidyReportStatusSchema = z.enum(['PENDING_DOCS', 'SUBMITTED', 'APPROVED', 'DISBURSED', 'REJECTED']);
export const subsidyReportMilestoneSchema = subsidyMilestoneSchema.safeExtend({
  status: subsidyReportStatusSchema,
  pendingDocuments: z.array(z.string().trim().min(1)),
  responsibleOwner: z.object({ id: z.uuid(), name: z.string().trim().min(1) }).nullable(),
});
export type SubsidyReportMilestone = z.infer<typeof subsidyReportMilestoneSchema>;
export const subsidyReportSchema = z.object({
  asOf: z.iso.datetime(),
  groups: z.array(z.object({
    status: subsidyReportStatusSchema,
    count: z.number().int().nonnegative(),
    totalAmount: reportAmountSchema,
    milestones: z.array(subsidyReportMilestoneSchema),
  })),
});
export type SubsidyReport = z.infer<typeof subsidyReportSchema>;

// Pay aggregates can exceed the precision of one stored entry.
export const reportHoursSchema = z.string().regex(/^(0|[1-9]\d*)\.\d{3}$/);
export const technicianPaySummarySchema = paySummarySchema.extend({
  totalHours: reportHoursSchema,
  totalPay: reportAmountSchema.refine((value) => !value.startsWith('-')),
});
export const technicianPayReportSchema = periodSummarySchema.omit({
  invoicedRevenue: true, cashReceived: true, actualCost: true, costBreakdown: true,
}).extend({
  scope: z.enum(['INSTALLATION_ONLY', 'ALL_TIME']).default('ALL_TIME'),
  technicians: z.array(technicianPaySummarySchema),
  totalHours: reportHoursSchema,
  totalPay: reportAmountSchema.refine((value) => !value.startsWith('-')),
});
export type TechnicianPayReport = z.infer<typeof technicianPayReportSchema>;
export const reportExportQuerySchema = z.discriminatedUnion('report', [
  z.strictObject({ report: z.literal('overview'), period: reportPeriodSchema.default('today') }),
  z.strictObject({ report: z.literal('profitability'), jobId: z.uuid() }),
  z.strictObject({ report: z.literal('pay'), period: reportPeriodSchema.default('today') }),
]);
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;

// Portfolio work queues are current, independent of the financial period filter.
export const operationsQuerySchema = z.strictObject({
  jobsPage: z.coerce.number().int().min(1).max(10000).default(1),
  ticketsPage: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export const operationsReportSchema = z.object({
  asOf: z.iso.datetime(),
  jobs: z.object({ total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive(),
    items: z.array(z.object({ id: z.uuid(), orderId: z.uuid(), status: z.enum(['SCHEDULED','IN_PROGRESS']), scheduledStart: z.iso.datetime().nullable() })) }),
  tickets: z.object({ total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive(),
    items: z.array(z.object({ id: z.uuid(), ticketNumber: z.string(), jobId: z.uuid(), status: z.enum(['OPEN','ASSESSED','IN_PROGRESS','AWAITING_CUSTOMER_CONFIRMATION']) })) }),
});
export type OperationsQuery = z.infer<typeof operationsQuerySchema>;
