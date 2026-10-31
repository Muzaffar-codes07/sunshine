import { HttpStatus, Injectable, Module } from '@nestjs/common';
import type { FileContext, StaffIdentity } from '@sunshine/contracts';
import { FILE_RECORD_AUTHORIZER, type FileRecordAuthorizer } from '../files/file-authorization.port';
import { ApiError } from '../platform/api-error';
import type { Prisma } from '../generated/prisma/client';

const denied = () => new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You cannot access files for this job');

/**
 * Who can reach a job's files, agreed on #39. Downloads: ADMIN, SALES and technicians on the job. Uploads and attachments:
 * ADMIN and technicians on the job, until it is COMPLETED. Ticket files stay closed until D4 supplies its own rules.
 */
@Injectable()
export class JobFileAccess implements FileRecordAuthorizer {
  async assertAccess(tx: Prisma.TransactionClient, actor: StaffIdentity, context: FileContext, action: 'UPLOAD' | 'DOWNLOAD' | 'ATTACH') {
    if (context.contextType !== 'JOB') throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'FILE_AUTHORIZATION_UNAVAILABLE', 'Record file access is not configured');
    const reading = action === 'DOWNLOAD';
    if (!(actor.role === 'ADMIN' || actor.role === 'TECHNICIAN' || (reading && actor.role === 'SALES'))) throw denied();
    // A write holds the job row, so completion can't pass between this check and the write committing.
    if (!reading) await tx.$queryRaw`SELECT "id" FROM "jobs" WHERE "id" = ${context.contextId}::uuid FOR SHARE`;
    const job = await tx.job.findUnique({ where: { id: context.contextId }, select: {
      id: true, status: true,
      order: { select: { jobId: true, customerId: true, enquiryId: true, quote: { select: { customerId: true, enquiryId: true } }, enquiry: { select: { customerId: true } } } },
      assignments: { where: { technicianId: actor.id, removedAt: null }, select: { id: true }, take: 1 },
    } });
    if (!job) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Job not found');
    const { order } = job;
    if (order.jobId !== job.id || order.quote.customerId !== order.customerId || order.quote.enquiryId !== order.enquiryId || order.enquiry.customerId !== order.customerId) {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'JOB_RECORD_INVALID', 'This job needs review before its files can be used');
    }
    if (actor.role === 'TECHNICIAN' && job.assignments.length === 0) throw denied();
    if (!reading && job.status === 'COMPLETED') {
      throw new ApiError(HttpStatus.CONFLICT, 'JOB_ALREADY_COMPLETED', 'This job is completed, so its evidence is final');
    }
  }
}

/** Reads only, and separate from FieldModule, so Files can use it without a module cycle. */
@Module({ providers: [{ provide: FILE_RECORD_AUTHORIZER, useClass: JobFileAccess }], exports: [FILE_RECORD_AUTHORIZER] })
export class JobFileAccessModule {}
