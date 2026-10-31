import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ticketAssessmentSnapshotSchema } from '@sunshine/contracts';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { RepairBillingService } from './repair-billing.service';
import { ReplacementStockWriter, replacementInputSchema, replacementStockResultSchema,
  continuedWarrantySchema, replacementResultSchema, replacementSnapshotSchema,
  type ReplacementInput, type ReplacementResult } from './replacement.types';

@Injectable()
export class ReplacementService {
  constructor(private readonly stock: ReplacementStockWriter, private readonly billing: RepairBillingService) {}

  /** Internal helper: caller authorizes actor/targets, owns command key/audit,
   * one rollback-on-error transaction and bounded concurrency retries. Never
   * catch a helper failure and commit the transaction's earlier effects. */
  async executeReplacement(tx: Prisma.TransactionClient, input: ReplacementInput): Promise<ReplacementResult> {
    const data = new ZodValidationPipe(replacementInputSchema).transform(input);
    if (new Date(data.assessmentDate) > new Date()) throw new ApiError(400, 'INVALID_INPUT', 'Assessment cannot be in the future');
    const requestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    try {
      const ticket = await tx.serviceTicket.findUnique({ where: { id: data.ticketId } });
      if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'No ticket was found');
      if (ticket.replacementSnapshot !== null) {
        const saved = replacementSnapshotSchema.safeParse(ticket.replacementSnapshot);
        const result = saved.success ? saved.data.result : null;
        if (!result || result.ticketId !== ticket.id || result.jobId !== ticket.jobId || result.customerId !== ticket.customerId ||
          result.oldUnit.id !== ticket.unitId || result.oldUnit.id !== ticket.replacedUnitId || result.newUnit.id !== ticket.newUnitId ||
          result.oldUnit.jobId !== ticket.jobId || result.newUnit.jobId !== ticket.jobId ||
          result.oldUnit.customerId !== ticket.customerId || result.newUnit.customerId !== ticket.customerId ||
          result.newUnit.replacesUnitId !== result.oldUnit.id || result.billing.ticketId !== ticket.id ||
          result.billing.jobId !== ticket.jobId || result.billing.customerId !== ticket.customerId) {
          throw new ApiError(503, 'INVALID_REPLACEMENT_RECORD', 'Saved replacement needs review');
        }
        if (saved.success && saved.data.requestHash !== requestHash) throw new ApiError(409, 'REPLACEMENT_CONFLICT', 'Ticket already has a different replacement');
        return result;
      }
      if (!['ASSESSED', 'IN_PROGRESS'].includes(ticket.status)) {
        throw new ApiError(409, 'INVALID_TICKET_TRANSITION', 'Replacement requires an assessed, unresolved ticket');
      }
      if (ticket.unitId !== data.oldUnitId || ticket.replacedUnitId !== null || ticket.newUnitId !== null || ticket.billingSnapshot !== null) {
        throw new ApiError(409, 'REPLACEMENT_CONFLICT', 'Replacement must target the original unit before final repair billing');
      }
      const assessment = ticketAssessmentSnapshotSchema.safeParse(ticket.assessmentSnapshot);
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(data.assessmentDate));
      if (!assessment.success || assessment.data.unitId !== data.oldUnitId || assessment.data.asOfDate !== date) {
        throw new ApiError(409, 'ASSESSMENT_REQUIRED', 'Replacement requires the saved assessment for this unit and IST date');
      }
      // Reserve two version increments: this helper and the nested billing helper.
      if (ticket.version >= 2147483645) throw new ApiError(409, 'STALE_VERSION', 'Ticket version limit reached');
      const locked = await tx.serviceTicket.updateMany({
        where: { id: ticket.id, version: ticket.version, status: ticket.status },
        data: { status: 'IN_PROGRESS', version: { increment: 1 } },
      });
      if (locked.count !== 1) throw new ApiError(409, 'STALE_VERSION', 'Ticket changed; retry the transaction');

      const original = await tx.warranty.findUnique({ where: { unitId: data.oldUnitId } });
      if (!original) throw new ApiError(409, 'ORIGINAL_WARRANTY_REQUIRED', 'Explicit replacement policy is required for a unit without warranty');
      const calendar = (value: Date) => value instanceof Date && Number.isFinite(value.getTime()) &&
        value.toISOString().slice(10) === 'T00:00:00.000Z' ? value.toISOString().slice(0, 10) : null;
      const warranty = continuedWarrantySchema.safeParse({ startDate: calendar(original.startDate), expiryDate: calendar(original.expiryDate),
        policyName: original.policyName, policyRevision: original.policyRevision, scope: original.scope,
        durationMonths: original.durationMonths, active: original.active });
      if (!warranty.success || original.unitId !== data.oldUnitId || original.version >= 2147483647) {
        throw new ApiError(503, 'INVALID_WARRANTY_RECORD', 'Original warranty needs review');
      }
      // Lock policy/version against edits before copying; coverage facts stay unchanged.
      const policyLock = await tx.warranty.updateMany({ where: { unitId: original.unitId, version: original.version },
        data: { version: { increment: 1 } } });
      if (policyLock.count !== 1) throw new ApiError(409, 'WARRANTY_CONFLICT', 'Original warranty changed; retry the transaction');
      if (await tx.warranty.findUnique({ where: { unitId: data.newUnitId } })) {
        throw new ApiError(409, 'WARRANTY_CONFLICT', 'Replacement unit already has warranty history');
      }
      const swapped = replacementStockResultSchema.safeParse(await this.stock.replace(tx, {
        ...data, jobId: ticket.jobId, customerId: ticket.customerId,
      }));
      if (!swapped.success) throw new ApiError(503, 'INVALID_REPLACEMENT_STOCK', 'Replacement stock result needs review');
      const { oldUnit, newUnit, repairItems } = swapped.data;
      if (oldUnit.id !== data.oldUnitId || newUnit.id !== data.newUnitId || newUnit.replacesUnitId !== data.oldUnitId ||
          [oldUnit, newUnit].some((unit) => unit.jobId !== ticket.jobId || unit.customerId !== ticket.customerId) ||
          oldUnit.serial.toUpperCase() !== assessment.data.serial.trim().toUpperCase()) {
        throw new ApiError(409, 'REPLACEMENT_LINK_CONFLICT', 'Replacement units must match the assessed installation');
      }
      await tx.warranty.create({ data: { unitId: data.newUnitId,
        ...warranty.data, startDate: original.startDate, expiryDate: original.expiryDate } });
      const billing = await this.billing.executeRepairBilling(tx, ticket.id, repairItems);
      const result = replacementResultSchema.parse({ ticketId: ticket.id, jobId: ticket.jobId, customerId: ticket.customerId,
        assessmentDate: data.assessmentDate, oldUnit, newUnit, warranty: warranty.data, billing });
      await tx.serviceTicket.update({ where: { id: ticket.id }, data: {
        replacedUnitId: oldUnit.id, newUnitId: newUnit.id,
        replacementSnapshot: { revision: 1, requestHash, result },
      } });
      return result;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if (error.code === 'P2021' || error.code === 'P2022') throw new ApiError(503, 'SERVICE_SCHEMA_UNAVAILABLE', 'Replacement storage is awaiting its coordinated migration');
        if (error.code === 'P2002') throw new ApiError(409, 'REPLACEMENT_CONFLICT', 'Replacement or warranty was claimed concurrently; retry the transaction');
      }
      throw error;
    }
  }
}
