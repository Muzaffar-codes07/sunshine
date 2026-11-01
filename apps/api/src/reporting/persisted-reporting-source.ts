import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { ApiError } from '../platform/api-error';
import type { Prisma } from '../generated/prisma/client';
import { ReportingAccess, ReportingSourceReader, type ReportWindow } from './reporting-readers';

@Injectable()
export class StaffReportingAccess extends ReportingAccess {
  constructor(private readonly auth: AuthService) { super(); }
  async assertCanReadReports(request: Request) {
    const id = request.session?.staffUserId;
    const staff = id ? await this.auth.findActiveStaff(id) : null;
    if (!staff) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
    if (staff.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', 'Only administrators can read financial reports');
  }
}
const invalid = () => new ApiError(503, 'INVALID_REPORT_SOURCE', 'An invoice source needs review before financial reports can be shown');

/** Separate source queries within the repository's repeatable-read transaction avoid fan-out. */
@Injectable()
export class PersistedReportingSource extends ReportingSourceReader {
  override readonly payScope = 'INSTALLATION_ONLY' as const;
  async readJob(tx: Prisma.TransactionClient, jobId: string, asOf: Date) {
    jobId = jobId.toLowerCase();
    const job = await tx.job.findFirst({ where: { id: jobId, createdAt: { lte: asOf } },
      select: { id: true, orderId: true, status: true, completedAt: true, finishedAt: true } });
    if (!job) return null;
    const tickets = await tx.serviceTicket.findMany({ where: { jobId, createdAt: { lte: asOf } }, select: { id: true, closedAt: true } });
    const invoices = await tx.invoice.findMany({ where: { createdAt: { lte: asOf }, postedAt: { lte: asOf }, OR: [
      { orderId: job.orderId }, { sourceType: 'TICKET', sourceId: { in: tickets.map(row => row.id) } },
    ] } });
    await this.validate(tx, invoices, jobId);
    const payments = await tx.payment.findMany({ where: { invoiceId: { in: invoices.map(row => row.id) },
      receivedAt: { lte: asOf }, createdAt: { lte: asOf } }, select: { amount: true } });
    const unfinishedSteps: string[] = [];
    if (job.status !== 'COMPLETED' || !job.completedAt || job.completedAt > asOf || !job.finishedAt || job.finishedAt > asOf) unfinishedSteps.push('Installation acceptance pending at cutoff');
    if (tickets.some(ticket => !ticket.closedAt || ticket.closedAt > asOf)) unfinishedSteps.push('Open service repairs at cutoff');
    if (tickets.length) unfinishedSteps.push('Service billing and cost finalization await production activation');
    if (job.status === 'COMPLETED') {
      const time = await tx.installationTimeRecord.findMany({ where: { jobId, createdAt: { lte: asOf } }, include: {
        labourApproval: { include: { costEntry: { include: { reversal: true } } } },
      } });
      if (!time.length || time.some(row => !row.labourApproval || row.labourApproval.approvedAt > asOf ||
        row.labourApproval.costEntry.postedAt > asOf ||
        (row.labourApproval.costEntry.reversal && row.labourApproval.costEntry.reversal.postedAt <= asOf))) {
        unfinishedSteps.push('Installation labour costing awaits approved frozen rates or a reconciled cost correction');
      }
    }
    return { jobId, isCompleted: unfinishedSteps.length === 0, unfinishedSteps,
      invoices: invoices.map(row => ({ amount: row.total.toFixed(2) })), payments: payments.map(row => ({ amount: row.amount.toFixed(2) })) };
  }

  async readPeriod(tx: Prisma.TransactionClient, window: ReportWindow) {
    const invoices = await tx.invoice.findMany({ where: { createdAt: { lte: window.asOf }, postedAt: { gte: window.start, lt: window.end, lte: window.asOf } } });
    const payments = await tx.payment.findMany({ where: { receivedAt: { gte: window.start, lt: window.end, lte: window.asOf },
      createdAt: { lte: window.asOf }, invoice: { createdAt: { lte: window.asOf }, postedAt: { lte: window.asOf } } }, include: { invoice: true } });
    await this.validate(tx, [...invoices, ...payments.map(row => row.invoice)]);
    return { invoices: invoices.map(row => ({ amount: row.total.toFixed(2) })), payments: payments.map(row => ({ amount: row.amount.toFixed(2) })) };
  }

  async readTimeEntries(tx: Prisma.TransactionClient, window: ReportWindow) {
    const rows = await tx.installationLabourApproval.findMany({ where: { approvedAt: { lte: window.asOf },
      timeRecord: { finishedAt: { gte: window.start, lt: window.end, lte: window.asOf }, createdAt: { lte: window.asOf } },
      costEntry: { postedAt: { lte: window.asOf } } },
      include: { timeRecord: { include: { technician: { select: { displayName: true } } } }, rateRevision: true, costEntry: true } });
    return rows.map(row => {
      if (row.rateRevision.technicianId !== row.timeRecord.technicianId || !row.hourlyRate.equals(row.rateRevision.hourlyRate) ||
        row.costEntry.uniqueSourceId !== `TIME_RECORD:${row.timeRecordId}` || row.costEntry.costType !== 'INSTALLATION_LABOUR' ||
        row.costEntry.jobId !== row.timeRecord.jobId || !row.costEntry.amount.equals(row.amount) ||
        row.costEntry.occurredAt.getTime() !== row.timeRecord.finishedAt.getTime() ||
        row.elapsedMs !== BigInt(row.timeRecord.finishedAt.getTime())-BigInt(row.timeRecord.startedAt.getTime())) {
        throw new ApiError(503, 'INVALID_REPORT_SOURCE', 'Approved labour source needs review');
      }
      return { id: row.timeRecordId, technicianId: row.timeRecord.technicianId, technicianName: row.timeRecord.technician.displayName,
        status: 'APPROVED' as const, hours: row.hours.toFixed(3), frozenHourlyRate: row.hourlyRate.toFixed(2), elapsedMs: row.elapsedMs.toString(),
        frozenAmount: row.amount.toFixed(2), occurredAt: row.timeRecord.finishedAt, approvedAt: row.approvedAt };
    });
  }

  private async validate(tx: Prisma.TransactionClient, invoices: { sourceType: string; sourceId: string; kind: string; orderId: string | null; customerId: string }[], jobId?: string) {
    const orders = await tx.order.findMany({ where: { id: { in: invoices.filter(row => row.sourceType === 'ORDER').map(row => row.sourceId) } }, select: { id: true, customerId: true, jobId: true } });
    const tickets = await tx.serviceTicket.findMany({ where: { id: { in: invoices.filter(row => row.sourceType === 'TICKET').map(row => row.sourceId) } }, select: { id: true, customerId: true, jobId: true } });
    const jobs = await tx.job.findMany({ where: { id: { in: tickets.map(row => row.jobId) } }, select: { id: true, order: { select: { customerId: true } } } });
    for (const invoice of invoices) {
      if (invoice.sourceType === 'ORDER') {
        const order = orders.find(row => row.id === invoice.sourceId);
        if (invoice.kind !== 'SALE' || !order || invoice.orderId !== order.id || invoice.customerId !== order.customerId || (jobId && order.jobId !== jobId)) throw invalid();
      } else if (invoice.sourceType === 'TICKET') {
        const ticket = tickets.find(row => row.id === invoice.sourceId);
        if (invoice.kind !== 'REPAIR' || !ticket || jobs.find(job => job.id === ticket.jobId)?.order.customerId !== ticket.customerId || invoice.customerId !== ticket.customerId || (jobId && ticket.jobId !== jobId)) throw invalid();
        if (invoice.orderId) {
          const order = await tx.order.findUnique({ where: { id: invoice.orderId }, select: { jobId: true } });
          if (!order || order.jobId !== ticket.jobId) throw invalid();
        }
      } else throw invalid();
    }
  }
}
