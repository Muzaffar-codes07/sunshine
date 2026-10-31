import type { Prisma } from '../generated/prisma/client';

/**
 * D3's idempotent job helper (TRD: "D2 calls it inside order confirmation"). FieldModule provides ORDER_JOB_CREATOR.
 */
export const ORDER_JOB_CREATOR = Symbol('ORDER_JOB_CREATOR');

export interface ConfirmedOrderFacts {
  orderId: string;
  enquiryId: string;
  customerId: string;
  quoteId: string;
  capacityKw: number;
  systemType: 'ON_GRID' | 'OFF_GRID';
}

export interface OrderJobCreator {
  /** Must use `tx`, be idempotent per orderId, and never commit on its own. */
  ensureJob(tx: Prisma.TransactionClient, order: ConfirmedOrderFacts): Promise<{ jobId: string }>;
}
