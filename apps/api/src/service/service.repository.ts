import { Injectable } from '@nestjs/common';
import type { Prisma, ServiceTicket as TicketRow } from '../generated/prisma/client';
import { PrismaService } from '../platform/prisma.service';
import { ApiError } from '../platform/api-error';
import type { TicketListQuery } from '@sunshine/contracts';

export type { TicketRow };
export type NewTicket = Pick<TicketRow, 'ticketNumber' | 'customerId' | 'unitId' | 'jobId' | 'faultDescription'>;
export type TicketPatch = Pick<Prisma.ServiceTicketUpdateManyMutationInput,
  'status' | 'assessmentSnapshot' | 'resolutionDetails' | 'resolvedAt' | 'confirmedBy' |
  'confirmationChannel' | 'confirmedAt' | 'confirmationNotes' | 'closedAt'>;

export abstract class TicketRepository {
  abstract create(input: NewTicket): Promise<TicketRow>;
  abstract findById(id: string): Promise<TicketRow | null>;
  abstract list(query: TicketListQuery): Promise<{ rows: TicketRow[]; total: number }>;
  /** Compare-and-set must atomically save all facts and increment the version. */
  abstract transition(current: TicketRow, patch: TicketPatch): Promise<TicketRow>;
}

@Injectable()
export class PrismaTicketRepository extends TicketRepository {
  constructor(private readonly prisma: PrismaService) { super(); }

  async create(input: NewTicket): Promise<TicketRow> {
    return this.storage(() => this.prisma.serviceTicket.create({ data: { ...input, status: 'OPEN' } }));
  }

  async findById(id: string): Promise<TicketRow | null> {
    return this.storage(() => this.prisma.serviceTicket.findUnique({ where: { id } }));
  }

  async list(query: TicketListQuery): Promise<{ rows: TicketRow[]; total: number }> {
    return this.storage(async () => {
      const where: Prisma.ServiceTicketWhereInput = {
        ...(query.unitId ? { unitId: query.unitId } : {}),
        ...(query.status ? { status: query.status } : {}),
      };
      const [rows, total] = await Promise.all([
        this.prisma.serviceTicket.findMany({
          where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        }),
        this.prisma.serviceTicket.count({ where }),
      ]);
      return { rows, total };
    });
  }

  async transition(current: TicketRow, patch: TicketPatch): Promise<TicketRow> {
    return this.storage(() => this.prisma.$transaction(async (tx) => {
      const result = await tx.serviceTicket.updateMany({
        where: { id: current.id, version: current.version, status: current.status },
        data: { ...patch, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new ApiError(409, 'STALE_VERSION', 'Ticket changed; reload before retrying');
      // Hold the write lock until this exact result has been read and committed.
      return tx.serviceTicket.findUniqueOrThrow({ where: { id: current.id } });
    }));
  }

  private async storage<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        if (error.code === 'P2021' || error.code === 'P2022') {
          throw new ApiError(503, 'SERVICE_SCHEMA_UNAVAILABLE', 'Ticket storage is awaiting its coordinated migration');
        }
        if (error.code === 'P2003') throw new ApiError(409, 'TICKET_LINK_CONFLICT', 'Ticket installation links changed; reload before retrying');
      }
      throw error;
    }
  }
}
