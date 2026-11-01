import { Injectable } from '@nestjs/common';
import { installationTimeListSchema, installationTimeResponseSchema, technicianRateResponseSchema, technicianRatesListSchema,
  type ApproveInstallationTime, type CreateTechnicianRate, type InstallationTimeQuery, type TechnicianRatesQuery } from '@sunshine/contracts';
import { CostWriterService } from '../finance/cost-writer.service';
import { Prisma } from '../generated/prisma/client';
import { ApiError, refusal } from '../platform/api-error';
import { IdempotencyService } from '../platform/idempotency';
import { PrismaService } from '../platform/prisma.service';

const include = { technician: { select: { displayName: true } }, job: { select: { status: true } }, labourApproval: true } as const;
type TimeRow = Prisma.InstallationTimeRecordGetPayload<{ include: typeof include }>;
const timeView = (row: TimeRow) => ({ id: row.id, jobId: row.jobId, technicianId: row.technicianId, technicianName: row.technician.displayName,
  startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt.toISOString(), jobStatus: row.job.status,
  approval: row.labourApproval ? { ...row.labourApproval, elapsedMs: row.labourApproval.elapsedMs.toString(),
    hours: row.labourApproval.hours.toFixed(3), hourlyRate: row.labourApproval.hourlyRate.toFixed(2), amount: row.labourApproval.amount.toFixed(2),
    approvedAt: row.labourApproval.approvedAt.toISOString() } : null });
const blocked = (code: string, reason: string) => refusal({ code, reason, source: 'LABOUR', nextAction: 'Review the saved time record and approved rate before retrying.' });

@Injectable()
export class LabourService {
  constructor(private readonly prisma: PrismaService, private readonly commands: IdempotencyService, private readonly costs: CostWriterService) {}
  async rates(query: TechnicianRatesQuery) {
    return this.prisma.$transaction(async tx => {
      const where = { technicianId: query.technicianId };
      const [rows, total] = await Promise.all([tx.technicianRateRevision.findMany({ where, orderBy: [{ createdAt: 'desc' },{ id: 'asc' }],
        skip: (query.page-1)*query.pageSize, take: query.pageSize }), tx.technicianRateRevision.count({ where })]);
      return technicianRatesListSchema.parse({ data: { items: rows.map(row => ({ ...row, hourlyRate: row.hourlyRate.toFixed(2), createdAt: row.createdAt.toISOString() })), total, page: query.page, pageSize: query.pageSize } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async createRate(actorId: string, key: string, input: CreateTechnicianRate) {
    const data = { ...input, technicianId: input.technicianId.toLowerCase(), hourlyRate: new Prisma.Decimal(input.hourlyRate).toFixed(2) };
    return this.commands.run({ actorId, key, action: 'TECHNICIAN_RATE_CREATE', payload: data }, async tx => {
      const technician = await tx.user.findUnique({ where: { id: data.technicianId } });
      if (!technician || technician.role !== 'TECHNICIAN') throw blocked('RATE_TECHNICIAN_INVALID', 'Select a saved technician.');
      const row = await tx.technicianRateRevision.create({ data: { ...data, createdById: actorId } });
      return technicianRateResponseSchema.parse({ data: { ...row, hourlyRate: row.hourlyRate.toFixed(2), createdAt: row.createdAt.toISOString() } });
    });
  }
  async list(query: InstallationTimeQuery) {
    return this.prisma.$transaction(async tx => {
      const where: Prisma.InstallationTimeRecordWhereInput = { ...(query.jobId ? { jobId: query.jobId } : {}),
        ...(query.status === 'PENDING' ? { labourApproval: null } : query.status === 'APPROVED' ? { labourApproval: { isNot: null } } : {}) };
      const [rows, total] = await Promise.all([tx.installationTimeRecord.findMany({ where, include,
        orderBy: [{ finishedAt: 'desc' }, { id: 'asc' }], skip: (query.page-1)*query.pageSize, take: query.pageSize }), tx.installationTimeRecord.count({ where })]);
      return installationTimeListSchema.parse({ data: { items: rows.map(timeView), total, page: query.page, pageSize: query.pageSize } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async get(id: string) {
    const row = await this.prisma.installationTimeRecord.findUnique({ where: { id: id.toLowerCase() }, include });
    if (!row) throw new ApiError(404, 'TIME_RECORD_NOT_FOUND', 'Time record not found');
    return installationTimeResponseSchema.parse({ data: timeView(row) });
  }
  async approve(actorId: string, key: string, id: string, input: ApproveInstallationTime) {
    id = id.toLowerCase();
    const payload = { id, ...input, rateRevisionId: input.rateRevisionId.toLowerCase() };
    return this.commands.run({ actorId, key, action: 'INSTALLATION_TIME_APPROVE', payload }, async tx => {
      const reference = await tx.installationTimeRecord.findUnique({ where: { id }, select: { jobId: true } });
      if (!reference) throw new ApiError(404, 'TIME_RECORD_NOT_FOUND', 'Time record not found');
      // Command → job → time record. Completion uses the same job lock; rate revisions and evidence are immutable.
      await tx.$queryRaw`SELECT id FROM jobs WHERE id=${reference.jobId}::uuid FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM installation_time_records WHERE id=${id}::uuid FOR UPDATE`;
      const row = await tx.installationTimeRecord.findUniqueOrThrow({ where: { id }, include });
      if (row.labourApproval) {
        if (row.labourApproval.rateRevisionId !== payload.rateRevisionId || row.labourApproval.note !== input.note) {
          throw blocked('TIME_ALREADY_APPROVED', 'This time has already been approved with different frozen facts.');
        }
        return installationTimeResponseSchema.parse({ data: timeView(row) });
      }
      if (row.job.status !== 'COMPLETED') throw blocked('JOB_NOT_COMPLETED', 'Approve installation time only after customer acceptance is recorded.');
      const rate = await tx.technicianRateRevision.findUnique({ where: { id: payload.rateRevisionId } });
      if (!rate || rate.technicianId !== row.technicianId) throw blocked('RATE_TECHNICIAN_INVALID', 'The selected rate belongs to a different technician or does not exist.');
      const elapsedMs = BigInt(row.finishedAt.getTime()) - BigInt(row.startedAt.getTime());
      if (elapsedMs <= 0n || row.finishedAt.getTime() > Date.now()) throw blocked('TIME_INTERVAL_INVALID', 'The recorded work interval is invalid or in the future.');
      const rateCents = BigInt(rate.hourlyRate.toFixed(2).replace('.', ''));
      const cents = (elapsedMs*rateCents + 1800000n)/3600000n;
      const amount = `${cents/100n}.${String(cents%100n).padStart(2,'0')}`;
      const millis = (elapsedMs+1800n)/3600n;
      const hours = `${millis/1000n}.${String(millis%1000n).padStart(3,'0')}`;
      if (!/^\d{1,12}\.\d{2}$/.test(amount)) throw blocked('LABOUR_AMOUNT_OVERFLOW', 'The approved cost exceeds the supported precision.');
      const posted = await this.costs.postCost(tx, { uniqueSourceId: `TIME_RECORD:${id}`, jobId: row.jobId, costType: 'INSTALLATION_LABOUR',
        amount, occurredAt: row.finishedAt.toISOString(), description: `Installation labour for time record ${id}` });
      await tx.installationLabourApproval.create({ data: { timeRecordId: id, rateRevisionId: rate.id, costEntryId: posted.id,
        elapsedMs, hours, hourlyRate: rate.hourlyRate, amount, approvedById: actorId, approvedAt: new Date(), note: input.note } });
      return installationTimeResponseSchema.parse({ data: timeView(await tx.installationTimeRecord.findUniqueOrThrow({ where: { id }, include })) });
    });
  }
}
