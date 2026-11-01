import { Injectable } from '@nestjs/common';
import type { OperationsQuery, SubsidyReportMilestone } from '@sunshine/contracts';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';
import { PrismaService } from '../platform/prisma.service';
import { ReportingSourceReader, type FinancialActivity, type JobFinancialSnapshot,
  type ReportCost, type ReportWindow, type ReportTimeEntry } from './reporting-readers';

export abstract class ReportingReader {
  readonly payScope?: 'INSTALLATION_ONLY' | 'ALL_TIME';
  abstract readOperations(query: OperationsQuery): Promise<unknown>;
  abstract readJob(jobId: string, asOf: Date): Promise<(JobFinancialSnapshot & { costs: ReportCost[] }) | null>;
  abstract readPeriod(window: ReportWindow): Promise<FinancialActivity & { costs: ReportCost[] }>;
  abstract readSubsidies(): Promise<SubsidyReportMilestone[]>;
  abstract readTimeEntries(window: ReportWindow): Promise<ReportTimeEntry[]>;
}

@Injectable()
export class PrismaReportingReader extends ReportingReader {
  override readonly payScope;
  constructor(private readonly prisma: PrismaService, private readonly source: ReportingSourceReader) { super(); this.payScope = source.payScope; }

  readOperations(query: OperationsQuery) {
    return this.read(async tx => {
      const jobsWhere = { status: { in: ['SCHEDULED', 'IN_PROGRESS'] as ('SCHEDULED' | 'IN_PROGRESS')[] } };
      const ticketsWhere = { status: { in: ['OPEN','ASSESSED','IN_PROGRESS','AWAITING_CUSTOMER_CONFIRMATION'] as ('OPEN' | 'ASSESSED' | 'IN_PROGRESS' | 'AWAITING_CUSTOMER_CONFIRMATION')[] } };
      const [jobs, jobsTotal, tickets, ticketsTotal] = await Promise.all([
        tx.job.findMany({ where: jobsWhere, orderBy: [{ scheduledStart: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }], skip: (query.jobsPage-1)*query.pageSize, take: query.pageSize,
          select: { id: true, orderId: true, status: true, scheduledStart: true } }),
        tx.job.count({ where: jobsWhere }),
        tx.serviceTicket.findMany({ where: ticketsWhere, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (query.ticketsPage-1)*query.pageSize, take: query.pageSize,
          select: { id: true, ticketNumber: true, jobId: true, status: true } }),
        tx.serviceTicket.count({ where: ticketsWhere }),
      ]);
      return { asOf: new Date().toISOString(),
        jobs: { total: jobsTotal, page: query.jobsPage, pageSize: query.pageSize, items: jobs.map(row => ({ ...row, scheduledStart: row.scheduledStart?.toISOString() ?? null })) },
        tickets: { total: ticketsTotal, page: query.ticketsPage, pageSize: query.pageSize, items: tickets } };
    });
  }

  readJob(jobId: string, asOf: Date) {
    return this.read(async (tx) => {
      const job = await this.source.readJob(tx, jobId, asOf);
      if (!job) return null;
      const rows = await tx.costEntry.findMany({
        where: { jobId, occurredAt: { lte: asOf }, postedAt: { lte: asOf } }, select: { amount: true, costType: true },
      });
      return { ...job, costs: rows.map((row) => ({ ...row, amount: row.amount.toFixed(2) })) };
    });
  }

  readPeriod(window: ReportWindow) {
    return this.read(async (tx) => {
      const activity = await this.source.readPeriod(tx, window);
      const rows = await tx.costEntry.findMany({
        where: { occurredAt: { gte: window.start, lt: window.end, lte: window.asOf }, postedAt: { lte: window.asOf } },
        select: { amount: true, costType: true },
      });
      return { ...activity, costs: rows.map((row) => ({ ...row, amount: row.amount.toFixed(2) })) };
    });
  }

  readTimeEntries(window: ReportWindow): Promise<ReportTimeEntry[]> {
    return this.read((tx) => this.source.readTimeEntries(tx, window));
  }

  readSubsidies(): Promise<SubsidyReportMilestone[]> {
    return this.read(async (tx) => {
      const rows = await tx.subsidyMilestone.findMany({
        orderBy: [{ jobId: 'asc' }, { id: 'asc' }],
        select: { id: true, jobId: true, stage: true, status: true, submissionDate: true,
          approvalDate: true, amount: true, evidenceFileId: true, pendingDocuments: true,
          responsibleOwner: { select: { id: true, displayName: true } } },
      });
      return rows.map((row) => ({ ...row,
        status: row.status === 'PENDING' ? 'PENDING_DOCS' : row.status === 'RECEIVED' ? 'DISBURSED' : row.status,
        amount: row.amount.toFixed(2), submissionDate: row.submissionDate?.toISOString() ?? null,
        approvalDate: row.approvalDate?.toISOString() ?? null,
        responsibleOwner: row.responsibleOwner ? { id: row.responsibleOwner.id, name: row.responsibleOwner.displayName } : null,
      }));
    });
  }

  private async read<T>(query: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(query, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && ['P2021', 'P2022'].includes(String(error.code))) {
        throw new ApiError(503, 'REPORTING_SCHEMA_UNAVAILABLE', 'Reports await coordinated database migrations');
      }
      throw error;
    }
  }
}
