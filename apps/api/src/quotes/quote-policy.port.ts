import type { QuotePolicySnapshot } from '@sunshine/contracts';
import type { Prisma } from '../generated/prisma/client';

/** D4 supplies a database-only reader. Null means explicitly unconfigured; never infer new terms at delivery. */
export const QUOTE_WARRANTY_POLICY_READER = Symbol('QUOTE_WARRANTY_POLICY_READER');
export interface QuoteWarrantyPolicyReader {
  getWarrantyPolicySnapshot(tx: Prisma.TransactionClient, productId: string): Promise<QuotePolicySnapshot | null>;
}
