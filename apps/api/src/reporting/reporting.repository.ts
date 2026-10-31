import { Injectable } from '@nestjs/common';
import type { SubsidyReportMilestone } from '@sunshine/contracts';
import { Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';
import { PrismaService } from '../platform/prisma.service';
import { ReportingSourceReader, type FinancialActivity, type JobFinancialSnapshot,
  type ReportCost, type ReportWindow, type ReportTimeEntry } from './reporting-readers';

export abstract class ReportingReader {
  abstract readJob(jobId: string, asOf: Date): Promise<(JobFinancialSnapshot & { costs: ReportCost[] }) | null>;
  abstract readPeriod(window: ReportWindow): Promise<FinancialActivity & { costs: ReportCost[] }>;
  abstract readSubsidies(): Promise<SubsidyReportMilestone[]>;
  abstract readTimeEntries(window: ReportWindow): Promise<ReportTimeEntry[]>;
}

@Injectable()
export class PrismaReportingReader extends ReportingReader {
  constructor(private readonly prisma: PrismaService, private readonly source: ReportingSourceReader) { super(); }

  readJob(jobId: string, asOf: Date) {
    return this.read(async (tx) => {
      const job = await this.source.readJob(tx, jobId, asOf);
      if (!job) return null;
      const rows = await tx.costEntry.findMany({
        where: { jobId, postedAt: { lte: asOf } }, select: { amount: true, costType: true },
      });
      return { ...job, costs: rows.map((row) => ({ ...row, amount: row.amount.toFixed(2) })) };
    });
  }

  readPeriod(window: ReportWindow) {
    return this.read(async (tx) => {
      const activity = await this.source.readPeriod(tx, window);
      const rows = await tx.costEntry.findMany({
        where: { postedAt: { gte: window.start, lt: window.end, lte: window.asOf } },
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
