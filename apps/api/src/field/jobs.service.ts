import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { jobListResponseSchema, jobResponseSchema, jobViewSchema, type JobListQuery, type ScheduleJobRequest, type StaffIdentity } from '@sunshine/contracts';
import type { z } from 'zod';
import { ApiError, refusal } from '../platform/api-error';
import { PrismaService } from '../platform/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { ConfirmedOrderFacts, OrderJobCreator } from '../orders/order-job.port';

export const jobInclude = {
  order: { select: { customerId: true } },
  assignments: { where: { removedAt: null }, select: { technicianId: true }, orderBy: { technicianId: 'asc' } },
  photos: { select: { fileId: true }, orderBy: { position: 'asc' } },
  timeRecords: { select: { id: true, technicianId: true, startedAt: true, finishedAt: true }, orderBy: [{ startedAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.JobInclude;
type JobRow = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

@Injectable()
export class JobsService implements OrderJobCreator {
  constructor(private readonly prisma: PrismaService) {}

  /** Runs in the confirming transaction, so a later failure removes the job with the order. Repeat calls return the same job. */
  async ensureJob(tx: Prisma.TransactionClient, facts: ConfirmedOrderFacts): Promise<{ jobId: string }> {
    const order = await tx.order.findUnique({
      where: { id: facts.orderId },
      select: { enquiryId: true, customerId: true, quoteId: true, quote: { select: { status: true, packageSnapshot: true } } },
    });
    const accepted = order?.quote.packageSnapshot as { capacityKw?: unknown; systemType?: unknown } | null | undefined;
    if (!order || order.quote.status !== 'ACCEPTED' || order.quoteId !== facts.quoteId || order.enquiryId !== facts.enquiryId || order.customerId !== facts.customerId
      || accepted?.capacityKw !== facts.capacityKw || accepted?.systemType !== facts.systemType) {
      throw refusal({
        code: 'JOB_SOURCE_INVALID', reason: "These details don't match a confirmed order with an accepted quote.", source: 'JOBS',
        nextAction: 'Reload the order and try again.',
      });
    }
    await tx.job.createMany({ skipDuplicates: true, data: [{ id: randomUUID(), orderId: facts.orderId }] });
    const job = await tx.job.findUniqueOrThrow({ where: { orderId: facts.orderId }, select: { id: true } });
    return { jobId: job.id };
  }

  /** Staff who see every job. Technicians use assigned() and can open only jobs they are on. */
  async list(query: JobListQuery) {
    const [total, rows] = await Promise.all([
      this.prisma.job.count(),
      this.prisma.job.findMany({ include: jobInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ]);
    return jobListResponseSchema.parse({ data: { items: rows.map(jobView), total, page: query.page, pageSize: query.pageSize } });
  }

  /** The technician's own work, soonest first; jobs without a date come last. */
  async assigned(technician: StaffIdentity) {
    const rows = await this.prisma.job.findMany({
      where: { status: { not: 'COMPLETED' }, assignments: { some: { technicianId: technician.id, removedAt: null } } },
      include: jobInclude, orderBy: [{ scheduledStart: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }], take: 100,
    });
    return { data: rows.map(jobView) };
  }

  /** A technician gets the same 404 for a job they aren't on as for one that doesn't exist. */
  async get(id: string, actor: StaffIdentity) {
    const scope = actor.role === 'TECHNICIAN' ? { assignments: { some: { technicianId: actor.id, removedAt: null } } } : {};
    const row = await this.prisma.job.findFirst({ where: { id, ...scope }, include: jobInclude });
    if (!row) throw notFound();
    return jobResponseSchema.parse({ data: jobView(row) });
  }

  /** Sets the times and the crew together. Removed technicians stay as history; only a job that hasn't started can change. */
  async schedule(id: string, command: ScheduleJobRequest, actor: StaffIdentity) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.job.updateMany({
        where: { id, version: command.expectedVersion, status: 'SCHEDULED' },
        data: { scheduledStart: new Date(command.scheduledStart), scheduledFinish: new Date(command.scheduledFinish), version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        const current = await tx.job.findUnique({ where: { id }, select: { status: true } });
        if (!current) throw notFound();
        if (current.status !== 'SCHEDULED') {
          throw refusal({ code: 'JOB_ALREADY_STARTED', reason: 'This job has started, so its schedule and crew are fixed.', source: 'JOBS', nextAction: 'Reload the job.' });
        }
        throw new ApiError(HttpStatus.CONFLICT, 'STALE_VERSION', 'This job was changed by someone else. Reload it and try again.');
      }
      const technicians = await tx.user.findMany({ where: { id: { in: command.technicianIds }, active: true, role: 'TECHNICIAN' }, select: { id: true } });
      if (technicians.length !== command.technicianIds.length) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', { technicianIds: ['Choose active technicians'] });
      }
      const current = await tx.jobAssignment.findMany({ where: { jobId: id, removedAt: null }, select: { technicianId: true } });
      const onJob = new Set(current.map((row) => row.technicianId));
      await tx.jobAssignment.updateMany({ where: { jobId: id, removedAt: null, technicianId: { notIn: command.technicianIds } }, data: { removedAt: new Date() } });
      await tx.jobAssignment.createMany({ data: command.technicianIds.filter((technicianId) => !onJob.has(technicianId)).map((technicianId) => ({
        id: randomUUID(), jobId: id, technicianId, assignedById: actor.id,
      })) });
      return jobResponseSchema.parse({ data: jobView(await tx.job.findUniqueOrThrow({ where: { id }, include: jobInclude })) });
    });
  }
}

function notFound() {
  return new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Job not found');
}

export function jobView(row: JobRow): z.infer<typeof jobViewSchema> {
  return jobViewSchema.parse({
    id: row.id, orderId: row.orderId, customerId: row.order.customerId, status: row.status, version: row.version,
    scheduledStart: row.scheduledStart?.toISOString() ?? null, scheduledFinish: row.scheduledFinish?.toISOString() ?? null,
    technicianIds: row.assignments.map((assignment) => assignment.technicianId),
    startedAt: row.startedAt?.toISOString() ?? null, finishedAt: row.finishedAt?.toISOString() ?? null, installedCapacityKw: row.installedCapacityKw,
    photoFileIds: row.photos.map((photo) => photo.fileId), signatureFileId: row.signatureFileId, signerName: row.signerName, completedChecks: row.completedChecks,
    timeRecords: row.timeRecords.map((record) => ({ ...record, startedAt: record.startedAt.toISOString(), finishedAt: record.finishedAt.toISOString() })),
  });
}
