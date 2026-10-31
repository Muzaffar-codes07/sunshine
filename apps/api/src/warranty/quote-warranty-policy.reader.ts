import { Injectable } from '@nestjs/common';
import type { QuotePolicySnapshot } from '@sunshine/contracts';
import type { Prisma } from '../generated/prisma/client';
import type { QuoteWarrantyPolicyReader } from '../quotes/quote-policy.port';

/** Reads inside the quote's transaction. Null means no terms are configured for this product. */
@Injectable()
export class PrismaQuoteWarrantyPolicyReader implements QuoteWarrantyPolicyReader {
  async getWarrantyPolicySnapshot(tx: Prisma.TransactionClient, productId: string): Promise<QuotePolicySnapshot | null> {
    return tx.productWarrantyPolicy.findUnique({ where: { productId }, select: { policyName: true, revision: true, scope: true, durationMonths: true } });
  }
}
