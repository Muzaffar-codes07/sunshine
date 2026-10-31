import { Injectable } from '@nestjs/common';
import type { FileContext, StaffIdentity } from '@sunshine/contracts';
import type { FileRecordAuthorizer } from '../files/file-authorization.port';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';

/** D3's accepted JOB policy. Reads and locks only in the caller's transaction. */
@Injectable()
export class JobFileAccessService implements FileRecordAuthorizer {
  async assertAccess(tx: Prisma.TransactionClient, actor: StaffIdentity, context: FileContext,
    action: 'UPLOAD' | 'DOWNLOAD' | 'ATTACH'): Promise<void> {
    // D4's ticket domain is not wired. A JOB grant must never authorize a TICKET.
    if (context.contextType !== 'JOB') {
      throw new ApiError(503, 'FILE_AUTHORIZATION_UNAVAILABLE', 'Ticket file access is not configured');
    }
    // Scheduling and field transitions claim this row first. Keep assignment/status stable
    // until the authorized file operation commits; callers must acquire Job before File.
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "jobs" WHERE "id"=${context.contextId}::uuid FOR SHARE`;
    if (!rows.length) throw unavailable();
    const job = await tx.job.findUniqueOrThrow({ where: { id: rows[0]!.id }, select: {
      id: true, status: true, orderId: true,
      order: { select: { id: true, jobId: true, customerId: true, enquiryId: true,
        quote: { select: { status: true, customerId: true, enquiryId: true } },
        enquiry: { select: { id: true, customerId: true } },
      } },
      assignments: { where: { technicianId: actor.id, removedAt: null }, select: { id: true } },
    } });
    const order = job.order;
    if (order.id !== job.orderId || order.jobId !== job.id || order.quote.status !== 'ACCEPTED'
      || order.quote.enquiryId !== order.enquiryId || order.enquiry.id !== order.enquiryId
      || order.quote.customerId !== order.customerId || order.enquiry.customerId !== order.customerId) throw unavailable();
    const allowed = actor.role === 'ADMIN'
      || (actor.role === 'SALES' && action === 'DOWNLOAD')
      || (actor.role === 'TECHNICIAN' && job.assignments.length > 0);
    if (!allowed) throw new ApiError(403, 'FORBIDDEN', 'You cannot access files for this job');
    if (action !== 'DOWNLOAD' && job.status === 'COMPLETED') {
      throw new ApiError(403, 'FORBIDDEN', 'Evidence on a completed job cannot be changed');
    }
  }
}

function unavailable() { return new ApiError(404, 'NOT_FOUND', 'Job not found'); }
