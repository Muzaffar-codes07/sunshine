import { HttpStatus, Injectable } from '@nestjs/common';
import { jobResponseSchema, type CompleteInstallationRequest, type RefusalReason, type StaffIdentity, type StartInstallationRequest } from '@sunshine/contracts';
import { InvoicesService } from '../finance/invoices.service';
import { FilesService } from '../files/files.service';
import { ApiError, refusal } from '../platform/api-error';
import { IdempotencyService } from '../platform/idempotency';
import { PrismaService } from '../platform/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { jobInclude, jobView } from './jobs.service';

const BASE_CHECKS = ['MOUNTING', 'PANELS', 'WIRING', 'EARTHING', 'POWER_GENERATION'];
const notFound = () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Job not found');
const stale = () => new ApiError(HttpStatus.CONFLICT, 'STALE_VERSION', 'This job was changed by someone else. Reload it and try again.');
const notReady = (code: string, reason: string, nextAction: string): RefusalReason => ({ code, reason, source: 'JOBS', nextAction });
const inFuture = (field: string) => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', { [field]: ['This time has not happened yet'] });
const refuseAll = (reasons: RefusalReason[]) => { if (reasons.length) throw refusal(reasons[0]!, ...reasons.slice(1)); };

/** Start and completion. Evidence is checked on the server, and every step of a completion commits together or not at all. */
@Injectable()
export class InstallationService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService, private readonly files: FilesService, private readonly invoices: InvoicesService) {}

  async start(actor: StaffIdentity, key: string, id: string, input: StartInstallationRequest) {
    const startedAt = new Date(input.startedAt);
    if (startedAt.getTime() > Date.now()) throw inFuture('startedAt');
    return this.idempotency.run({ actorId: actor.id, key, action: 'JOB_START', payload: { id, ...input } }, async (tx) => {
      const job = await this.jobFor(tx, id, actor);
      const claimed = await tx.job.updateMany({
        where: { id, version: input.expectedVersion, status: 'SCHEDULED' },
        data: { status: 'IN_PROGRESS', startedAt, startedById: actor.id, version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        if (job.status === 'SCHEDULED') throw stale();
        throw refusal(notReady('JOB_ALREADY_STARTED', 'This job has already started.', 'Reload the job.'));
      }
      const reasons: RefusalReason[] = [];
      if (job.assignments.length === 0) reasons.push(notReady('JOB_NOT_SCHEDULED', 'This job has no technician assigned.', 'Schedule the crew first.'));
      if (!(await this.invoices.getOrderPaymentFacts(tx, job.orderId)).released) {
        reasons.push(notReady('ORDER_NOT_RELEASED', 'No payment has been recorded for this order.', 'Record the customer payment first.'));
      }
      if ((await tx.allocation.count({ where: { jobId: id, status: { not: 'RELEASED' } } })) === 0) {
        reasons.push(notReady('JOB_MATERIAL_NOT_ALLOCATED', 'No equipment is allocated to this job.', 'Allocate the order\'s stock first.'));
      }
      if (startedAt < job.order.confirmedAt) reasons.push(notReady('INSTALLATION_TIME_INVALID', 'Work can\'t start before the order was confirmed.', 'Enter the actual start time.'));
      refuseAll(reasons);
      return this.view(tx, id);
    });
  }

  /** Reads every file's bytes first, outside the transaction, so a missing or altered file refuses before anything is locked. */
  async complete(actor: StaffIdentity, key: string, id: string, input: CompleteInstallationRequest) {
    const finishedAt = new Date(input.finishedAt);
    if (finishedAt.getTime() > Date.now()) throw inFuture('finishedAt');
    await this.jobFor(this.prisma, id, actor);
    const fileIds = [...input.photoFileIds, input.signatureFileId];
    for (const fileId of fileIds) await this.files.download(fileId, actor);
    return this.idempotency.run({ actorId: actor.id, key, action: 'JOB_COMPLETE', payload: { id, ...input } }, async (tx) => {
      const claimed = await tx.job.updateMany({ where: { id, version: input.expectedVersion, status: 'IN_PROGRESS' }, data: { version: { increment: 1 } } });
      const job = await this.jobFor(tx, id, actor);
      if (claimed.count !== 1) {
        if (job.status === 'IN_PROGRESS') throw stale();
        throw refusal(job.status === 'COMPLETED'
          ? notReady('JOB_ALREADY_COMPLETED', 'This job is completed, so its evidence is final.', 'Reload the job.')
          : notReady('JOB_NOT_STARTED', 'This job has not started.', 'Start the job first.'));
      }
      refuseAll(this.evidenceGaps(job, input));
      // Sorted, because attaching locks each file row.
      const attached = new Map<string, Awaited<ReturnType<FilesService['attach']>>>();
      for (const fileId of [...fileIds].sort()) attached.set(fileId, await this.files.attach(tx, fileId, { contextType: 'JOB', contextId: id }, actor));
      if (input.photoFileIds.some((fileId) => !attached.get(fileId)!.mediaType.startsWith('image/'))) {
        throw refusal(notReady('INSTALLATION_PHOTO_INVALID', 'Every roof photo must be an image.', 'Upload the photo as a JPEG, PNG or WebP.'));
      }
      await tx.jobPhoto.createMany({ data: input.photoFileIds.map((fileId, index) => ({ jobId: id, fileId, position: index + 1 })) });
      // Sorted by technician, because each insert locks its technician to check for overlaps.
      const records = [...input.timeRecords].sort((a, b) => a.technicianId.localeCompare(b.technicianId) || Date.parse(a.startedAt) - Date.parse(b.startedAt));
      await tx.installationTimeRecord.createMany({ data: records.map((record) => ({
        jobId: id, technicianId: record.technicianId, startedAt: new Date(record.startedAt), finishedAt: new Date(record.finishedAt), recordedById: actor.id,
      })) });
      await tx.job.update({ where: { id }, data: {
        status: 'COMPLETED', finishedAt, completedAt: new Date(), completedById: actor.id, installedCapacityKw: input.installedCapacityKw,
        signatureFileId: input.signatureFileId, signerName: input.signerName, completedChecks: input.completedChecks,
      } });
      return this.view(tx, id);
    });
  }

  /** A technician gets the same 404 for a job they aren't on as for one that doesn't exist. */
  private async jobFor(client: Prisma.TransactionClient, id: string, actor: StaffIdentity) {
    const job = await client.job.findUnique({ where: { id }, include: {
      order: { select: { confirmedAt: true, quote: { select: { packageSnapshot: true } } } },
      assignments: { where: { removedAt: null }, select: { technicianId: true } },
    } });
    if (!job || (actor.role === 'TECHNICIAN' && !job.assignments.some((row) => row.technicianId === actor.id))) throw notFound();
    return job;
  }

  /** Lists everything missing at once, so the crew can fix it in one go. */
  private evidenceGaps(job: Awaited<ReturnType<InstallationService['jobFor']>>, input: CompleteInstallationRequest) {
    const reasons: RefusalReason[] = [];
    const sold = job.order.quote.packageSnapshot as { capacityKw?: unknown; systemType?: unknown };
    if (sold.capacityKw !== input.installedCapacityKw) {
      reasons.push(notReady('INSTALLATION_CAPACITY_MISMATCH', `The accepted quote is for ${String(sold.capacityKw)} kW, not ${input.installedCapacityKw} kW.`, 'Confirm the installed size. A different size needs a revised quote.'));
    }
    const required = sold.systemType === 'OFF_GRID' ? [...BASE_CHECKS, 'BATTERY'] : BASE_CHECKS;
    const missing = required.filter((check) => !input.completedChecks.includes(check as never));
    if (missing.length) reasons.push(notReady('INSTALLATION_CHECKS_MISSING', `These checks aren't done: ${missing.join(', ')}.`, 'Finish every check, then complete the job.'));
    const extra = input.completedChecks.filter((check) => !required.includes(check));
    if (extra.length) reasons.push(notReady('INSTALLATION_CHECK_NOT_APPLICABLE', `This system has no ${extra.join(', ')} check.`, 'Remove it, then complete the job.'));
    if (job.startedAt?.getTime() !== Date.parse(input.startedAt)) {
      reasons.push(notReady('INSTALLATION_TIME_INVALID', 'The start time doesn\'t match when this job was started.', 'Reload the job and send its saved start time.'));
    }
    const crew = new Set(job.assignments.map((row) => row.technicianId));
    if (input.timeRecords.some((record) => !crew.has(record.technicianId))) {
      reasons.push(notReady('INSTALLATION_TIME_INVALID', 'A time record names someone who isn\'t on this job.', 'Record time only for the assigned crew.'));
    }
    return reasons;
  }

  private async view(tx: Prisma.TransactionClient, id: string) {
    return jobResponseSchema.parse({ data: jobView(await tx.job.findUniqueOrThrow({ where: { id }, include: jobInclude })) });
  }
}
