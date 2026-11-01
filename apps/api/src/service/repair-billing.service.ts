import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { moneySchema, ticketAssessmentSnapshotSchema } from '@sunshine/contracts';
import type { Prisma } from '../generated/prisma/client';
import { CostWriterService } from '../finance/cost-writer.service';
import { ServiceInvoiceWriter } from '../finance/service-invoice-writer';
import { ApiError } from '../platform/api-error';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { normalizeWarrantyScope } from '../warranty/warranty-scope';
import { RepairSourceReader, repairItemsSchema, repairSourceSchema, repairBillingResultSchema,
  repairBillingSnapshotSchema, type RepairItem, type RepairBillingResult } from './repair-billing.types';

// Integer scaled arithmetic: quantity millis * rate cents, half-up per line.
const scaled = (value: string, digits: number) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0'));
};
const money = (cents: bigint) => `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
const lineTotal = (quantity: string, rate: string) => money((scaled(quantity, 3) * scaled(rate, 2) + 500n) / 1000n);

@Injectable()
export class RepairBillingService {
  constructor(private readonly costs: CostWriterService, private readonly sources: RepairSourceReader,
    private readonly invoices: ServiceInvoiceWriter) {}

  /** Internal helper only. Caller authorizes the actor, owns the single transaction,
   * actor/key command record, audit, commit and bounded conflict retries. Any error
   * MUST abort the transaction, including adapter/validation errors after writes.
   */
  async executeRepairBilling(tx: Prisma.TransactionClient, ticketId: string, repairItems: RepairItem[]): Promise<RepairBillingResult> {
    const id = new ZodValidationPipe(z.uuid()).transform(ticketId).toLowerCase();
    const items = new ZodValidationPipe(repairItemsSchema).transform(repairItems)
      .map((item) => ({ ...item, sourceId: item.sourceId.toLowerCase() }))
      .sort((a, b) => `${a.type}:${a.sourceId}`.localeCompare(`${b.type}:${b.sourceId}`));
    const requestHash = createHash('sha256').update(JSON.stringify(items)).digest('hex');
    try {
      const ticket = await tx.serviceTicket.findUnique({ where: { id } });
      if (!ticket) throw new ApiError(404, 'TICKET_NOT_FOUND', 'No ticket was found');
      if (ticket.billingSnapshot !== null) {
        const saved = repairBillingSnapshotSchema.safeParse(ticket.billingSnapshot);
        if (!saved.success || saved.data.result.ticketId !== id || saved.data.result.jobId !== ticket.jobId ||
          saved.data.result.customerId !== ticket.customerId) {
          throw new ApiError(503, 'INVALID_REPAIR_BILLING_RECORD', 'Saved repair billing needs review');
        }
        if (saved.data.requestHash !== requestHash) throw new ApiError(409, 'REPAIR_BILLING_CONFLICT', 'Repair is already billed with different sources');
        return saved.data.result;
      }
      if (!['ASSESSED', 'IN_PROGRESS'].includes(ticket.status)) {
        throw new ApiError(409, 'INVALID_TICKET_TRANSITION', 'Repair billing requires an assessed, unresolved ticket');
      }
      const assessment = ticketAssessmentSnapshotSchema.safeParse(ticket.assessmentSnapshot);
      if (!assessment.success || assessment.data.unitId !== ticket.unitId) {
        throw new ApiError(409, 'ASSESSMENT_REQUIRED', 'Repair billing requires a saved coverage decision');
      }
      if (ticket.version >= 2147483646) throw new ApiError(409, 'STALE_VERSION', 'Ticket version limit reached');
      // Acquires ticket write lock; concurrent lifecycle/billing writes lose CAS.
      const locked = await tx.serviceTicket.updateMany({
        where: { id, status: ticket.status, version: ticket.version },
        data: { status: 'IN_PROGRESS', version: { increment: 1 } },
      });
      if (locked.count !== 1) throw new ApiError(409, 'STALE_VERSION', 'Ticket changed; retry the transaction');
      const records = z.array(repairSourceSchema).safeParse(await this.sources.read(tx, id, items));
      if (!records.success || records.data.length !== items.length) {
        throw new ApiError(503, 'INVALID_REPAIR_SOURCE', 'Repair source facts need review');
      }
      const lines = items.map((item) => {
        const matches = records.data.filter((row) => row.type === item.type && row.sourceId.toLowerCase() === item.sourceId);
        const source = matches[0];
        if (matches.length !== 1 || !source || source.ticketId !== id || source.jobId !== ticket.jobId || source.customerId !== ticket.customerId) {
          throw new ApiError(409, 'REPAIR_SOURCE_CONFLICT', 'Repair source belongs to a different ticket or installation');
        }
        // A covered component scope must never silently cover other work.
        if (normalizeWarrantyScope(source.scope) !== normalizeWarrantyScope(assessment.data.requestedScope)) {
          throw new ApiError(409, 'REPAIR_SCOPE_CONFLICT', 'Assess the actual repair scope before billing');
        }
        return { type: source.type, sourceId: item.sourceId, description: source.description, occurredAt: source.occurredAt,
          ...(source.type === 'PART' ? { ticketLineId: source.ticketLineId! } : {}),
          quantity: source.quantity, unitCost: source.unitCost, totalCost: lineTotal(source.quantity, source.unitCost),
          unitPrice: assessment.data.isCovered ? '0.00' : source.unitPrice,
          totalPrice: assessment.data.isCovered ? '0.00' : lineTotal(source.quantity, source.unitPrice),
          billableToCustomer: !assessment.data.isCovered };
      });
      const sum = (field: 'totalCost' | 'totalPrice') => money(lines.reduce((total, line) => total + scaled(line[field], 2), 0n));
      const candidate = repairBillingResultSchema.safeParse({ ticketId: id, jobId: ticket.jobId, customerId: ticket.customerId,
        lines, internalCost: sum('totalCost'), customerCharge: sum('totalPrice'), invoiceId: null });
      if (!candidate.success) throw new ApiError(409, 'REPAIR_AMOUNT_OVERFLOW', 'Repair amounts exceed supported precision');
      const partLineIds = lines.filter((line) => line.type === 'PART').map((line) => line.ticketLineId);
      if (new Set(partLineIds).size !== partLineIds.length) {
        throw new ApiError(409, 'REPAIR_LINE_CONFLICT', 'Consumed parts must have distinct allocation ticket lines');
      }
      for (const line of lines) {
        const costType = line.type === 'PART' ? 'REPAIR_PARTS' : 'SERVICE_LABOUR';
        const uniqueSourceId = `${line.type === 'PART' ? 'STOCK_MOVEMENT' : 'TIME_ENTRY'}:${line.sourceId}`;
        // Parts must already be posted by D3's consumption helper, under this key.
        // Reusing that entry prevents posting ticket totals as another expense.
        if (line.type === 'PART') {
          const posted = await tx.costEntry.findUnique({ where: { uniqueSourceId_costType: { uniqueSourceId, costType } } });
          if (!posted) throw new ApiError(409, 'REPAIR_PART_COST_REQUIRED', 'Consume and post the actual part before repair billing');
          const allocatedLine = await tx.ticketLine.findUnique({ where: { id: line.ticketLineId! } });
          const source = records.data.find((row) => row.type === 'PART' && row.sourceId.toLowerCase() === line.sourceId);
          if (!allocatedLine || !source || allocatedLine.ticketId !== id || allocatedLine.lineType !== 'PART' ||
              allocatedLine.productId !== source.productId ||
              !allocatedLine.quantity.equals(line.quantity) || !allocatedLine.unitCost.equals(line.unitCost) ||
              !allocatedLine.totalCost.equals(line.totalCost) || allocatedLine.billableToCustomer !== line.billableToCustomer) {
            throw new ApiError(409, 'REPAIR_LINE_CONFLICT', 'Allocation ticket line differs from its assessed repair source');
          }
        }
        const cost = await this.costs.postCost(tx, { uniqueSourceId, costType, jobId: ticket.jobId,
          amount: line.totalCost, description: line.description, occurredAt: line.occurredAt });
        if (cost.jobId !== ticket.jobId || cost.costType !== costType || cost.uniqueSourceId !== uniqueSourceId || cost.amount.toFixed(2) !== line.totalCost) {
          throw new ApiError(409, 'REPAIR_COST_CONFLICT', 'Posted repair cost differs from its frozen source');
        }
      }
      const result = candidate.data;
      if (!assessment.data.isCovered) {
        const invoice = await this.invoices.ensureServiceInvoice(tx, { uniqueSourceId: `TICKET:${id}:REPAIR`,
          ticketId: id, jobId: ticket.jobId, customerId: ticket.customerId, subtotal: result.customerCharge,
          lines: lines.map(({ sourceId, type, description, quantity, unitPrice, totalPrice }) => ({ sourceId, type, description, quantity, unitPrice, totalPrice })) });
        const checked = z.object({ invoiceId: z.uuid(), subtotal: moneySchema }).safeParse(invoice);
        if (!checked.success || scaled(checked.data.subtotal, 2) !== scaled(result.customerCharge, 2)) {
          throw new ApiError(503, 'INVALID_SERVICE_INVOICE', 'Service invoice result needs review');
        }
        result.invoiceId = checked.data.invoiceId;
      }
      // PART lines already anchor inventory allocations. Preserve those IDs;
      // creating them again would duplicate ticket costs even with correct ledger keys.
      const newLines = lines.filter((line) => line.type === 'LABOUR');
      if (newLines.length) await tx.ticketLine.createMany({ data: newLines.map((line) => ({ ticketId: id, lineType: line.type,
        description: line.description, quantity: line.quantity, unitCost: line.unitCost,
        totalCost: line.totalCost, billableToCustomer: line.billableToCustomer })) });
      await tx.serviceTicket.update({ where: { id }, data: {
        billingSnapshot: { revision: 1, requestHash, result },
      } });
      return result;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error.code === 'P2021' || error.code === 'P2022')) {
        throw new ApiError(503, 'SERVICE_SCHEMA_UNAVAILABLE', 'Repair storage is awaiting its coordinated migration');
      }
      throw error;
    }
  }
}
