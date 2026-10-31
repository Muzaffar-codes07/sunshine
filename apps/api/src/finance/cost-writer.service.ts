import { Injectable } from '@nestjs/common';
import { createCostEntryInputSchema, type CreateCostEntryInput } from '@sunshine/contracts';
import type { CostEntry, Prisma } from '../generated/prisma/client';
import { ApiError } from '../platform/api-error';

@Injectable()
export class CostWriterService {
  /**
   * Append a source cost within the caller's transaction; never update a posted row.
   * Callers namespace uniqueSourceId by source kind and ID (e.g. TIME_ENTRY:<uuid>).
   * Identical retries return the original row; changed immutable facts conflict.
   * The caller owns commit/rollback and any transaction-conflict retries.
   */
  async postCost(tx: Prisma.TransactionClient, input: CreateCostEntryInput): Promise<CostEntry> {
    const parsed = createCostEntryInputSchema.parse(input);
    const data = { ...parsed, occurredAt: new Date(parsed.occurredAt), reversalOfId: parsed.reversalOfId ?? null };
    if (data.reversalOfId) await this.assertReversal(tx, { ...data, reversalOfId: data.reversalOfId });

    // PostgreSQL INSERT ... ON CONFLICT DO NOTHING avoids both a check/create
    // race and recovering from a unique violation inside an aborted transaction.
    await tx.costEntry.createMany({ data: [data], skipDuplicates: true });

    const saved = await tx.costEntry.findUniqueOrThrow({
      where: {
        uniqueSourceId_costType: {
          uniqueSourceId: data.uniqueSourceId,
          costType: data.costType,
        },
      },
    });
    if (saved.jobId !== data.jobId || !saved.amount.equals(data.amount) ||
      saved.occurredAt.getTime() !== data.occurredAt.getTime() || saved.description !== data.description ||
      saved.reversalOfId !== data.reversalOfId) {
      throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'This cost source was already posted with different facts');
    }
    return saved;
  }

  private async assertReversal(tx: Prisma.TransactionClient, data: {
    reversalOfId: string; jobId: string; costType: string; amount: string; occurredAt: Date;
  }): Promise<void> {
    const original = await tx.costEntry.findUnique({ where: { id: data.reversalOfId } });
    if (!original || original.reversalOfId !== null || original.jobId !== data.jobId ||
      original.costType !== data.costType || !original.amount.negated().equals(data.amount) ||
      data.occurredAt < original.occurredAt) {
      throw new ApiError(409, 'INVALID_COST_REVERSAL', 'A reversal must negate one original cost on its job and type at or after its occurrence');
    }
  }
}
