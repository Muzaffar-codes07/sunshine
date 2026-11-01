import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';

export type ServiceInvoiceInput = {
  uniqueSourceId: string; ticketId: string; jobId: string; customerId: string;
  lines: { sourceId: string; type: 'PART' | 'LABOUR'; description: string;
    quantity: string; unitPrice: string; totalPrice: string }[];
  subtotal: string;
};

/** D2 implements this port through InvoicesService.ensureServiceInvoice(tx, input).
 * One official posted invoice per TICKET:<id>:REPAIR; same facts replay, changed
 * facts conflict. Preserve line-rounded subtotal, calculate tax separately and
 * return that subtotal. Do not commit, receive payments or perform network IO.
 */
export abstract class ServiceInvoiceWriter {
  abstract ensureServiceInvoice(tx: Prisma.TransactionClient, input: ServiceInvoiceInput):
    Promise<{ invoiceId: string; subtotal: string }>;
}

@Injectable()
export class UnavailableServiceInvoiceWriter extends ServiceInvoiceWriter {
  async ensureServiceInvoice(): Promise<never> {
    throw new ApiError(503, 'SERVICE_INVOICE_UNAVAILABLE', 'D2 service invoice integration is unavailable');
  }
}
