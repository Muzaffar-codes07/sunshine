import { Injectable } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service';
import { ApiError } from '../platform/api-error';
import type { Prisma } from '../generated/prisma/client';

export interface SavedWarranty {
  unitId: string;
  startDate: Date;
  expiryDate: Date;
  policyName: string;
  policyRevision: string;
  scope: string;
  active: boolean;
}

export abstract class WarrantyReader {
  abstract findByUnitId(unitId: string, tx?: Prisma.TransactionClient): Promise<SavedWarranty | null>;
}

@Injectable()
export class PrismaWarrantyReader extends WarrantyReader {
  constructor(private readonly prisma: PrismaService) { super(); }

  async findByUnitId(unitId: string): Promise<SavedWarranty | null> {
    try {
      // Include void warranties: filtering active=true would lose the refusal reason.
      return await this.prisma.warranty.findUnique({
        where: { unitId },
        select: { unitId: true, startDate: true, expiryDate: true, policyName: true,
          policyRevision: true, scope: true, active: true },
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error &&
        (error.code === 'P2021' || error.code === 'P2022')) {
        throw new ApiError(503, 'WARRANTY_SCHEMA_UNAVAILABLE', 'Warranty storage is awaiting its coordinated migration');
      }
      throw error;
    }
  }
}
