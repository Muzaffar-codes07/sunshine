import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { refusal } from '../platform/api-error';
import type { Prisma } from '../generated/prisma/client';
import type { ConfirmedOrderFacts, OrderJobCreator } from '../orders/order-job.port';

@Injectable()
export class JobsService implements OrderJobCreator {
  /** Runs in the confirming transaction, so a later failure removes the job with the order. Repeat calls return the same job. */
  async ensureJob(tx: Prisma.TransactionClient, facts: ConfirmedOrderFacts): Promise<{ jobId: string }> {
    const order = await tx.order.findUnique({
      where: { id: facts.orderId },
      select: { enquiryId: true, customerId: true, quoteId: true, quote: { select: { status: true } } },
    });
    if (!order || order.quote.status !== 'ACCEPTED' || order.quoteId !== facts.quoteId || order.enquiryId !== facts.enquiryId || order.customerId !== facts.customerId) {
      throw refusal({
        code: 'JOB_SOURCE_INVALID', reason: "These details don't match a confirmed order with an accepted quote.", source: 'JOBS',
        nextAction: 'Reload the order and try again.',
      });
    }
    await tx.job.createMany({ skipDuplicates: true, data: [{ id: randomUUID(), orderId: facts.orderId }] });
    const job = await tx.job.findUniqueOrThrow({ where: { orderId: facts.orderId }, select: { id: true } });
    return { jobId: job.id };
  }
}
