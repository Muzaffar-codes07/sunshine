import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';

export type ReportWindow = { start: Date; end: Date; asOf: Date };
export type PostedAmount = { amount: string };
export type ReportCost = PostedAmount & {
  costType: 'MATERIAL_DISPATCH' | 'INSTALLATION_LABOUR' | 'SERVICE_LABOUR' | 'REPAIR_PARTS';
};
export type FinancialActivity = { invoices: PostedAmount[]; payments: PostedAmount[] };
export type JobFinancialSnapshot = FinancialActivity & {
  jobId: string; isCompleted: boolean; unfinishedSteps: string[];
};

export type ReportTimeEntry = {
  id: string; technicianId: string; technicianName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  hours: string; frozenHourlyRate: string; occurredAt: Date; approvedAt: Date | null;
  elapsedMs?: string; frozenAmount?: string;
};

/** Integrate only with persisted Job/Order/Invoice/Payment models.
 * All reads MUST use tx. Include sales AND ticket invoices for the job, only
 * posted invoices and recorded receipts/refunds, signed reversals once each.
 * Lifetime events are <= asOf; period events are >= start, < end, <= asOf.
 * Invoice posting and payment occurrence dates are independent. Never join
 * invoice/payment/cost detail rows into a multiplicative aggregate.
 * Job completion/unfinished steps must reflect the same snapshot/cutoff.
 */
export abstract class ReportingSourceReader {
  readonly payScope: 'INSTALLATION_ONLY' | 'ALL_TIME' = 'ALL_TIME';
  abstract readJob(tx: Prisma.TransactionClient, jobId: string, asOf: Date): Promise<JobFinancialSnapshot | null>;
  abstract readPeriod(tx: Prisma.TransactionClient, window: ReportWindow): Promise<FinancialActivity>;
  /** Persisted installation AND service time, once per entry, without detail joins.
   * Use tx; work >= start, < end, <= asOf; approved status and approvedAt <= asOf.
   * Read the frozen entry rate, never the technician's current rate. */
  abstract readTimeEntries(tx: Prisma.TransactionClient, window: ReportWindow): Promise<ReportTimeEntry[]>;
}

@Injectable()
export class UnavailableReportingSourceReader extends ReportingSourceReader {
  async readJob(_tx: Prisma.TransactionClient, _jobId: string, _asOf: Date): Promise<never> { return this.unavailable(); }
  async readPeriod(_tx: Prisma.TransactionClient, _window: ReportWindow): Promise<never> { return this.unavailable(); }
  async readTimeEntries(_tx: Prisma.TransactionClient, _window: ReportWindow): Promise<never> {
    throw new ApiError(503, 'REPORTING_TIME_SOURCE_UNAVAILABLE', 'Pay reports await persisted approved time entries and frozen rates');
  }
  private unavailable(): never {
    throw new ApiError(503, 'REPORTING_SOURCE_UNAVAILABLE', 'Reports await Job, Invoice and Payment integration');
  }
}

/** D2 implementation must verify the staff session and ADMIN permission.
 * Untrusted headers/request.user are not authorization evidence. */
export abstract class ReportingAccess {
  abstract assertCanReadReports(request: Request): Promise<void>;
}

@Injectable()
export class UnavailableReportingAccess extends ReportingAccess {
  async assertCanReadReports(_request: Request): Promise<void> {
    throw new ApiError(503, 'REPORTING_AUTH_UNAVAILABLE', 'Reports await director authorization integration');
  }
}
