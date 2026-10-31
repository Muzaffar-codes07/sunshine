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
    // Time has no persisted approved rate yet. Do not turn an absent labour posting into zero-cost final profit.
    if (job.status === 'COMPLETED') unfinishedSteps.push('Installation labour costing awaits approved frozen rates');
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

  async readTimeEntries(_tx: Prisma.TransactionClient, _window: ReportWindow): Promise<never> {
    throw new ApiError(503, 'REPORTING_TIME_SOURCE_UNAVAILABLE', 'Pay reports await persisted approved time entries and frozen rates');
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
