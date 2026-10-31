import { Injectable } from '@nestjs/common';
import { createCostEntryInputSchema, type CreateCostEntryInput } from '@sunshine/contracts';
import type { CostEntry, Prisma } from '../generated/prisma/client';

@Injectable()
export class CostWriterService {
  /**
   * Append a source cost within the caller's transaction; never update a posted row.
   * Callers namespace uniqueSourceId by source kind and ID (e.g. TIME_ENTRY:<uuid>).
   * The first posting for (uniqueSourceId, costType) wins, including its payload.
   * The caller owns commit/rollback and any transaction-conflict retries.
   */
  async postCost(tx: Prisma.TransactionClient, input: CreateCostEntryInput): Promise<CostEntry> {
    const data = createCostEntryInputSchema.parse(input);

    // PostgreSQL INSERT ... ON CONFLICT DO NOTHING avoids both a check/create
    // race and recovering from a unique violation inside an aborted transaction.
    await tx.costEntry.createMany({ data: [data], skipDuplicates: true });

    return tx.costEntry.findUniqueOrThrow({
      where: {
        uniqueSourceId_costType: {
          uniqueSourceId: data.uniqueSourceId,
          costType: data.costType,
        },
      },
    });
  }
}
