import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';
import { orderSchema, type ConfirmOrder, type Order, type StaffIdentity } from '@sunshine/contracts';
import { InvoicesService, invoiceView } from '../finance/invoices.service';
import { ApiError, refusal } from '../platform/api-error';
import { constraintError, ORDER_ALREADY_CONFIRMED } from '../platform/constraint-errors';
import { IdempotencyService } from '../platform/idempotency';
import { PrismaService } from '../platform/prisma.service';
import { QuotesService } from '../quotes/quotes.service';
import type { Prisma } from '../generated/prisma/client';
import { ORDER_JOB_CREATOR, type OrderJobCreator } from './order-job.port';

const orderInclude = {
  packing: { include: { quoteLine: { select: { description: true, position: true } } } },
  invoices: {
    where: { kind: 'SALE' },
    include: { lines: { orderBy: { position: 'asc' } }, payments: { orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }] } },
  },
} satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/**
 * Order confirmation (R7–R8): the latest accepted quote becomes one order, its packing requirements and one sales
 * invoice, plus D3's job when wired, in one idempotent transaction. One order per enquiry, so no quote revision
 * can later become a second sale.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly quotes: QuotesService,
    private readonly invoices: InvoicesService,
    @Optional() @Inject(ORDER_JOB_CREATOR) private readonly jobs?: OrderJobCreator,
  ) {}

  async confirm(command: ConfirmOrder, key: string, actor: StaffIdentity) {
    try {
      return await this.idempotency.run(
        { actorId: actor.id, key, action: 'ORDER_CONFIRM', payload: command },
        async (tx) => ({ data: await this.confirmIn(tx, command.quoteId, actor) }),
      );
    } catch (error) {
      // Two confirmations with different keys race to the unique order keys; the loser gets the business refusal.
      throw constraintError(error) ?? error;
    }
  }

  async get(id: string) {
    const row = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!row) throw notFound();
    return { data: orderView(row) };
  }

  async getForEnquiry(enquiryId: string) {
    const row = await this.prisma.order.findUnique({ where: { enquiryId }, include: orderInclude });
    if (!row) throw notFound();
    return { data: orderView(row) };
  }

  private async confirmIn(tx: Prisma.TransactionClient, quoteId: string, actor: StaffIdentity): Promise<Order> {
    // Share-locks the enquiry and requires the latest accepted revision, so no successor can race this.
    const quote = await this.quotes.requireAcceptedQuote(tx, quoteId);
    const existing = await tx.order.findUnique({ where: { enquiryId: quote.enquiryId }, select: { id: true } });
    if (existing) throw orderAlreadyConfirmed();
    // Release is gated on a recorded payment, which a ₹0 invoice can never receive. How free installations are
    // settled is an owner policy we don't have, so refuse rather than invent one (Codex review on #29).
    if (/^0(\.0+)?$/.test(quote.totalPrice)) {
      throw refusal({
        code: 'ORDER_TOTAL_ZERO', reason: 'The accepted quote totals ₹0.00, so no payment can release the job.', source: 'ORDER',
        nextAction: 'Revise the quote with the package and installation prices, or ask the owner how a free installation is settled.',
      });
    }
    const components = quote.lines.filter((line) => line.kind === 'COMPONENT');
    const order = await tx.order.create({
      data: {
        quoteId: quote.id, enquiryId: quote.enquiryId, customerId: quote.customerId, confirmedById: actor.id,
        packing: { create: components.map((line) => ({ quoteLineId: line.id, productId: line.productId!, quantity: line.quantity })) },
      },
    });
    await this.invoices.ensureSalesInvoice(tx, order, quote);
    if (this.jobs) {
      const { jobId } = await this.jobs.ensureJob(tx, {
        orderId: order.id, enquiryId: order.enquiryId, customerId: order.customerId, quoteId: quote.id,
        capacityKw: quote.packageSnapshot.capacityKw, systemType: quote.packageSnapshot.systemType,
      });
      await tx.order.update({ where: { id: order.id }, data: { jobId } });
    }
    return orderView(await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude }));
  }
}

function orderAlreadyConfirmed() {
  return refusal(ORDER_ALREADY_CONFIRMED);
}

function notFound() {
  return new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found');
}

function orderView(row: OrderRow): Order {
  const [invoice] = row.invoices;
  if (!invoice) throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'ORDER_DATA_INVALID', 'This order has no sales invoice');
  return orderSchema.parse({
    id: row.id, number: row.number, displayNumber: `ORD-${String(row.number).padStart(6, '0')}`,
    quoteId: row.quoteId, enquiryId: row.enquiryId, customerId: row.customerId, jobId: row.jobId,
    confirmedById: row.confirmedById, confirmedAt: row.confirmedAt.toISOString(),
    packing: [...row.packing]
      .sort((a, b) => a.quoteLine.position - b.quoteLine.position)
      .map((item) => ({
        id: item.id, quoteLineId: item.quoteLineId, productId: item.productId,
        description: item.quoteLine.description, quantity: item.quantity.toFixed(3),
      })),
    invoice: invoiceView(invoice),
    released: invoice.paidAmount.greaterThan(0),
  });
}
