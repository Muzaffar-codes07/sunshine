import { HttpStatus, Injectable } from '@nestjs/common';
import {
  invoiceSchema, orderPaymentFactsSchema, ticketAssessmentSnapshotSchema,
  type Invoice, type OrderPaymentFacts, type Quote, type RecordPayment, type StaffIdentity,
} from '@sunshine/contracts';
import { repairInvoiceSource, repairChargeDescription } from './repair-invoice-source';
import type { ServiceInvoiceInput } from './service-invoice-writer';
import { ApiError, refusal } from '../platform/api-error';
import { PrismaService } from '../platform/prisma.service';
import { Prisma, type PaymentKind } from '../generated/prisma/client';

export const TAX_NOTE = 'Tax not configured: pre-tax management example';
// Allow for clock drift between the staff device and the server, but not post-dated receipts.
const FUTURE_TOLERANCE_MS = 5 * 60_000;

const invoiceInclude = {
  lines: { orderBy: { position: 'asc' } },
  payments: { orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.InvoiceInclude;
type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

const blocked = (code: string, reason: string, nextAction: string) => refusal({ code, reason, source: 'FINANCE', nextAction });

/**
 * D2's single writer for invoices and receipts (TRD section 2). Helpers take the caller's transaction and never
 * commit on their own; posting is idempotent through the unique (sourceType, sourceId, kind) source.
 */
@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Posts the order's sales invoice once: the quote's PACKAGE and SERVICE charges, never the zero-priced components. */
  async ensureSalesInvoice(tx: Prisma.TransactionClient, order: { id: string; customerId: string }, quote: Quote): Promise<Invoice> {
    const existing = await tx.invoice.findUnique({
      where: { sourceType_sourceId_kind: { sourceType: 'ORDER', sourceId: order.id, kind: 'SALE' } }, include: invoiceInclude,
    });
    if (existing) return invoiceView(existing);
    const charges = quote.lines.filter((line) => line.kind !== 'COMPONENT');
    const subtotal = charges.reduce((sum, line) => sum.add(line.lineTotal), new Prisma.Decimal(0));
    if (!subtotal.equals(quote.totalPrice)) {
      throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'QUOTE_DATA_INVALID', 'The accepted quote total does not match its charges');
    }
    const row = await tx.invoice.create({
      data: {
        sourceType: 'ORDER', sourceId: order.id, kind: 'SALE', orderId: order.id, customerId: order.customerId,
        subtotal, taxAmount: 0, taxNote: TAX_NOTE, total: subtotal,
        lines: { create: charges.map((line, index) => ({
          position: index + 1, description: line.description, quantity: line.quantity,
          unitPrice: line.unitPrice, lineTotal: line.lineTotal, quoteLineId: line.id,
        })) },
      },
      include: invoiceInclude,
    });
    return invoiceView(row);
  }

  /** D4's repair port. Serializes one ticket source and never commits independently. */
  async ensureServiceInvoice(tx: Prisma.TransactionClient, input: ServiceInvoiceInput): Promise<{ invoiceId: string; subtotal: string }> {
    const snapshot = repairInvoiceSource(input), source = snapshot.source;
    const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM service_tickets WHERE id = ${source.ticketId}::uuid FOR UPDATE`;
    if (!locked) throw new ApiError(HttpStatus.NOT_FOUND, 'TICKET_NOT_FOUND', 'No ticket was found');
    const ticket = await tx.serviceTicket.findUniqueOrThrow({
      where: { id: source.ticketId }, include: { job: { include: { order: true } } },
    });
    if (ticket.jobId !== source.jobId || ticket.customerId !== source.customerId ||
        ticket.job.order.customerId !== source.customerId || ticket.job.order.jobId !== source.jobId) {
      throw blocked('REPAIR_SOURCE_CONFLICT', 'The repair invoice does not match the ticket installation.',
        'Review the ticket, customer and original installation before billing.');
    }
    const charges = source.lines.map((line, index) => ({
      position: index + 1, description: repairChargeDescription(line.description),
      quantity: line.quantity, unitPrice: line.unitPrice, lineTotal: line.totalPrice,
    }));
    const key = { sourceType: 'TICKET' as const, sourceId: source.ticketId, kind: 'REPAIR' as const };
    const existing = await tx.invoice.findUnique({ where: { sourceType_sourceId_kind: key }, include: invoiceInclude });
    if (existing) {
      const saved = existing.sourceSnapshot as { revision?: unknown; hash?: unknown; source?: unknown } | null;
      let original: ReturnType<typeof repairInvoiceSource>;
      try {
        if (saved?.revision !== 1) throw Error('Missing source snapshot');
        original = repairInvoiceSource(saved.source);
        if (original.hash !== saved.hash) throw Error('Invalid source snapshot');
      } catch {
        throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'REPAIR_INVOICE_RECORD_INVALID', 'The saved repair invoice needs review');
      }
      if (original.hash !== snapshot.hash) {
        throw blocked('REPAIR_INVOICE_CONFLICT', 'This ticket already has an invoice with different repair facts.',
          'Open the posted invoice; corrections require explicit reversal or new work.');
      }
      const savedCharges = existing.lines.map(line => ({
        position: line.position, description: line.description, quantity: line.quantity.toFixed(3),
        unitPrice: line.unitPrice.toFixed(2), lineTotal: line.lineTotal.toFixed(2),
      }));
      if (existing.customerId !== source.customerId || existing.orderId !== null ||
          !existing.subtotal.equals(source.subtotal) || !existing.total.equals(source.subtotal) ||
          !existing.taxAmount.isZero() || existing.taxNote !== TAX_NOTE ||
          existing.lines.some(line => line.quoteLineId !== null) ||
          JSON.stringify(savedCharges) !== JSON.stringify(charges)) {
        throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'REPAIR_INVOICE_RECORD_INVALID', 'The saved repair invoice needs review');
      }
      return { invoiceId: existing.id, subtotal: existing.subtotal.toFixed(2) };
    }
    const assessment = ticketAssessmentSnapshotSchema.safeParse(ticket.assessmentSnapshot);
    if (!['ASSESSED', 'IN_PROGRESS'].includes(ticket.status) || !assessment.success ||
        assessment.data.unitId.toLowerCase() !== ticket.unitId || assessment.data.isCovered) {
      throw blocked('REPAIR_INVOICE_NOT_CHARGEABLE', 'This ticket has no unresolved chargeable repair assessment.',
        'Save the actual coverage decision and repair sources before invoicing; covered work has no customer invoice.');
    }
    const row = await tx.invoice.create({
      data: {
        ...key, customerId: source.customerId, subtotal: source.subtotal, taxAmount: 0, taxNote: TAX_NOTE,
        total: source.subtotal, status: source.subtotal === '0.00' ? 'PAID' : 'POSTED',
        sourceSnapshot: snapshot, lines: { create: charges },
      },
    });
    return { invoiceId: row.id, subtotal: row.subtotal.toFixed(2) };
  }

  /**
   * Records money already received against an invoice. Locks the invoice row, so two receipts can't both fit
   * in the same balance; refuses overpayment; derives advance / partial / final from the running total.
   */
  async recordPayment(tx: Prisma.TransactionClient, invoiceId: string, receipt: RecordPayment, actor: StaffIdentity): Promise<Invoice> {
    const receivedAt = new Date(receipt.receivedAt);
    if (receivedAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', {
        receivedAt: ['The money cannot have been received in the future'],
      });
    }
    const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`;
    if (!locked) throw notFound();
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const amount = new Prisma.Decimal(receipt.amountInr);
    const balance = invoice.total.sub(invoice.paidAmount);
    if (balance.isZero()) {
      throw blocked('INVOICE_ALREADY_PAID', 'This invoice is already fully paid.', 'Check the receipts already recorded; record a refund separately if money was returned.');
    }
    if (amount.greaterThan(balance)) {
      throw blocked('PAYMENT_EXCEEDS_BALANCE', `The amount is more than the outstanding balance of ${balance.toFixed(2)}.`,
        'Record the amount actually received, up to the outstanding balance.');
    }
    const paidAmount = invoice.paidAmount.add(amount);
    const fullyPaid = paidAmount.equals(invoice.total);
    const kind: PaymentKind = fullyPaid ? 'FINAL' : invoice.paidAmount.isZero() ? 'ADVANCE' : 'PARTIAL';
    await tx.payment.create({ data: {
      invoiceId, amount, method: receipt.method, reference: receipt.reference, kind, receivedAt, recordedById: actor.id,
    } });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { paidAmount, status: fullyPaid ? 'PAID' : 'PART_PAID', version: { increment: 1 } },
    });
    return invoiceView(await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: invoiceInclude }));
  }

  async get(id: string) {
    const row = await this.prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!row) throw notFound();
    return { data: invoiceView(row) };
  }

  /** For D3 readiness checks and D4 reports, in the caller's transaction. Released once any payment is recorded. */
  async getOrderPaymentFacts(tx: Prisma.TransactionClient, orderId: string): Promise<OrderPaymentFacts> {
    const invoice = await tx.invoice.findUnique({ where: { sourceType_sourceId_kind: { sourceType: 'ORDER', sourceId: orderId, kind: 'SALE' } } });
    if (!invoice) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'No sales invoice for this order');
    return orderPaymentFactsSchema.parse({
      orderId, invoiceId: invoice.id, status: invoice.status, total: invoice.total.toFixed(2),
      paidAmount: invoice.paidAmount.toFixed(2), balance: invoice.total.sub(invoice.paidAmount).toFixed(2),
      released: invoice.paidAmount.greaterThan(0),
    });
  }
}

function notFound() {
  return new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Invoice not found');
}

export function invoiceView(row: InvoiceRow): Invoice {
  return invoiceSchema.parse({
    id: row.id, number: row.number, displayNumber: `INV-${String(row.number).padStart(6, '0')}`,
    sourceType: row.sourceType, sourceId: row.sourceId, kind: row.kind, orderId: row.orderId, customerId: row.customerId,
    status: row.status, subtotal: row.subtotal.toFixed(2), taxAmount: row.taxAmount.toFixed(2), taxNote: row.taxNote,
    total: row.total.toFixed(2), paidAmount: row.paidAmount.toFixed(2), balance: row.total.sub(row.paidAmount).toFixed(2),
    version: row.version, postedAt: row.postedAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id, position: line.position, description: line.description, quantity: line.quantity.toFixed(3),
      unitPrice: line.unitPrice.toFixed(2), lineTotal: line.lineTotal.toFixed(2), quoteLineId: line.quoteLineId,
    })),
    payments: row.payments.map((payment) => ({
      id: payment.id, invoiceId: payment.invoiceId, amount: payment.amount.toFixed(2), method: payment.method,
      reference: payment.reference, kind: payment.kind, receivedAt: payment.receivedAt.toISOString(),
      recordedById: payment.recordedById, createdAt: payment.createdAt.toISOString(),
    })),
  });
}
