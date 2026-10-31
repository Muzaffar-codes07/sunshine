import { Injectable } from '@nestjs/common';
import { jobProfitabilityReportSchema, reportPeriodSchema, periodSummarySchema,
  profitabilityQuerySchema, subsidyReportMilestoneSchema, subsidyReportSchema, subsidyReportStatusSchema,
  type ReportPeriod } from '@sunshine/contracts';
import { ApiError } from '../platform/api-error';
import { ReportingReader } from './reporting.repository';
import type { PostedAmount, ReportCost } from './reporting-readers';

// Exact cents throughout; rounding is only needed for percentage display.
function cents(amount: string): bigint {
  if (typeof amount !== 'string' || !/^-?(0|[1-9]\d*)(\.\d{1,2})?$/.test(amount)) {
    throw new ApiError(503, 'INVALID_REPORT_RECORD', 'Stored report amount is invalid');
  }
  const negative = amount.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? amount.slice(1) : amount).split('.');
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n);
}
function money(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
function sum(rows: PostedAmount[]): bigint { return rows.reduce((total, row) => total + cents(row.amount), 0n); }
function costs(rows: ReportCost[]) {
  const totals = { MATERIAL_DISPATCH: 0n, INSTALLATION_LABOUR: 0n, SERVICE_LABOUR: 0n, REPAIR_PARTS: 0n };
  for (const row of rows) {
    if (!Object.hasOwn(totals, row.costType)) throw new ApiError(503, 'INVALID_REPORT_RECORD', 'Stored cost type is invalid');
    totals[row.costType] += cents(row.amount);
  }
  return { actualCost: money(Object.values(totals).reduce((a, b) => a + b, 0n)), costBreakdown: {
    material: money(totals.MATERIAL_DISPATCH), installationLabour: money(totals.INSTALLATION_LABOUR),
    serviceLabour: money(totals.SERVICE_LABOUR), repairParts: money(totals.REPAIR_PARTS),
  } };
}
function validDate(date: Date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new ApiError(400, 'INVALID_INPUT', 'Invalid report date');
}
export function reportWindow(period: ReportPeriod, asOf: Date) {
  if (!reportPeriodSchema.safeParse(period).success) throw new ApiError(400, 'INVALID_INPUT', 'Invalid report period');
  validDate(asOf);
  const offset = 330 * 60_000;
  const local = new Date(asOf.getTime() + offset);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  if (period === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  if (period === 'month') start.setUTCDate(1);
  const end = new Date(start);
  if (period === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + (period === 'week' ? 7 : 1));
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10),
    start: new Date(start.getTime() - offset), end: new Date(end.getTime() - offset), asOf };
}

@Injectable()
export class ReportingService {
  constructor(private readonly reader: ReportingReader) {}

  async getJobProfitability(jobId: string, asOf = new Date()) {
    if (!profitabilityQuerySchema.safeParse({ jobId }).success) throw new ApiError(400, 'INVALID_INPUT', 'Invalid job ID');
    validDate(asOf);
    const snapshot = await this.reader.readJob(jobId, asOf);
    if (!snapshot) throw new ApiError(404, 'JOB_NOT_FOUND', 'Job was not found');
    if (snapshot.jobId !== jobId || typeof snapshot.isCompleted !== 'boolean'
      || !Array.isArray(snapshot.unfinishedSteps) || snapshot.unfinishedSteps.some((step) => typeof step !== 'string' || !step.trim())
      || (snapshot.isCompleted && snapshot.unfinishedSteps.length > 0)
      || (!snapshot.isCompleted && snapshot.unfinishedSteps.length === 0)
      || !Array.isArray(snapshot.invoices) || !Array.isArray(snapshot.payments) || !Array.isArray(snapshot.costs)) {
      throw new ApiError(503, 'INVALID_REPORT_RECORD', 'Job completion snapshot is invalid');
    }
    const invoiced = sum(snapshot.invoices), received = sum(snapshot.payments);
    const cost = costs(snapshot.costs);
    const contribution = invoiced - cents(cost.actualCost);
    const outstanding = invoiced - received;
    // Half away from zero to two percentage places; no percentage for <=0 revenue.
    const scaled = contribution < 0n ? -contribution : contribution;
    const percentage = invoiced > 0n ? (scaled * 10000n + invoiced / 2n) / invoiced : null;
    return jobProfitabilityReportSchema.parse({ jobId, asOf: asOf.toISOString(), isCompleted: snapshot.isCompleted,
      isProvisional: !snapshot.isCompleted, unfinishedSteps: snapshot.unfinishedSteps,
      invoicedRevenue: money(invoiced), cashReceived: money(received), outstanding: money(outstanding > 0n ? outstanding : 0n),
      ...cost, contribution: money(contribution), completedProfit: money(snapshot.isCompleted ? contribution : 0n),
      marginPercentage: percentage === null ? null : money(contribution < 0n ? -percentage : percentage),
    });
  }

  async getPeriodSummary(period: ReportPeriod, asOf = new Date()) {
    const window = reportWindow(period, asOf);
    const activity = await this.reader.readPeriod(window);
    if (!activity || !Array.isArray(activity.invoices) || !Array.isArray(activity.payments) || !Array.isArray(activity.costs)) {
      throw new ApiError(503, 'INVALID_REPORT_RECORD', 'Period activity snapshot is invalid');
    }
    return periodSummarySchema.parse({ period, timezone: 'Asia/Kolkata', asOf: asOf.toISOString(),
      startDate: window.startDate, endDate: window.endDate, startUtc: window.start.toISOString(), endUtc: window.end.toISOString(),
      invoicedRevenue: money(sum(activity.invoices)), cashReceived: money(sum(activity.payments)), ...costs(activity.costs),
    });
  }

  async getSubsidyMilestones() {
    const rows = (await this.reader.readSubsidies()).map((row) => {
      const result = subsidyReportMilestoneSchema.safeParse(row);
      if (!result.success) throw new ApiError(503, 'INVALID_REPORT_RECORD', 'Stored subsidy milestone is invalid');
      return result.data;
    });
    return subsidyReportSchema.parse({ asOf: new Date().toISOString(), groups: subsidyReportStatusSchema.options.map((status) => {
      const milestones = rows.filter((row) => row.status === status);
      return { status, count: milestones.length, totalAmount: money(sum(milestones)), milestones };
    }) });
  }
}
