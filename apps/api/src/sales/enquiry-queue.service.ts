import { HttpStatus, Injectable } from '@nestjs/common';
import {
  enquiryDetailResponseSchema, enquiryListResponseSchema,
  type ArchiveEnquiry, type AssignEnquiry, type EnquiryListQuery, type MarkEnquiryContacted, type QualifyEnquiry,
} from '@sunshine/contracts';
import { ApiError } from '../platform/api-error';
import { PrismaService } from '../platform/prisma.service';
import type { EnquiryStatus, Prisma } from '../generated/prisma/client';

const OPEN: EnquiryStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED'];
const OWNER_ROLES = ['SALES', 'ADMIN'] as const;

const detailInclude = { customer: { select: { id: true, name: true, phone: true, email: true } } } satisfies Prisma.EnquiryInclude;
type EnquiryRow = Prisma.EnquiryGetPayload<{ include: typeof detailInclude }>;

/** Staff-side enquiry queue: listing, qualification, ownership and closing (R1–R2). */
@Injectable()
export class EnquiryQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: EnquiryListQuery) {
    const where: Prisma.EnquiryWhereInput = { status: query.status, ownerId: query.ownerId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.enquiry.findMany({
        where,
        include: detailInclude,
        // Due follow-ups first, then the oldest untouched enquiries, so nothing waits unseen.
        orderBy: [{ nextFollowUpAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.enquiry.count({ where }),
    ]);
    return enquiryListResponseSchema.parse({
      data: { items: rows.map(toSummary), page: query.page, pageSize: query.pageSize, total },
    });
  }

  async get(id: string) {
    const row = await this.prisma.enquiry.findUnique({ where: { id }, include: detailInclude });
    if (!row) throw notFound();
    return enquiryDetailResponseSchema.parse({ data: toDetail(row) });
  }

  markContacted(id: string, command: MarkEnquiryContacted) {
    return this.transition(id, command.version, ['NEW'], { status: 'CONTACTED' }, 'Only a new enquiry can be marked as contacted.');
  }

  qualify(id: string, command: QualifyEnquiry) {
    return this.transition(id, command.version, OPEN, {
      status: command.outcome,
      shadowFreeRoofAreaSqm: command.shadowFreeRoofAreaSqm,
      monthlyBillInr: command.monthlyBillInr,
      gridConnectionSuitable: command.gridConnectionSuitable,
      closedReason: command.outcome === 'DISQUALIFIED' ? command.reason : null,
    }, 'Only an open enquiry can be qualified.');
  }

  async assign(id: string, command: AssignEnquiry) {
    if (command.ownerId) {
      const owner = await this.prisma.user.findFirst({
        where: { id: command.ownerId, active: true, role: { in: [...OWNER_ROLES] } },
        select: { id: true },
      });
      if (!owner) {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', {
          ownerId: ['Choose an active sales or admin staff member'],
        });
      }
    }
    return this.transition(id, command.version, OPEN, {
      ownerId: command.ownerId,
      nextFollowUpAt: command.nextFollowUpAt ? new Date(command.nextFollowUpAt) : null,
    }, 'A closed enquiry cannot be reassigned.');
  }

  archive(id: string, command: ArchiveEnquiry) {
    return this.transition(id, command.version, [...OPEN, 'DISQUALIFIED'], {
      status: 'ARCHIVED', closedReason: command.reason, nextFollowUpAt: null,
    }, 'This enquiry is already archived.');
  }

  /**
   * Applies a change only if the enquiry is still at the version the user saw and in an allowed status.
   * The check and the write are one UPDATE, so two staff members cannot both succeed on the same version.
   */
  private async transition(
    id: string, version: number, from: EnquiryStatus[], data: Prisma.EnquiryUncheckedUpdateManyInput, invalidMessage: string,
  ) {
    const { count } = await this.prisma.enquiry.updateMany({
      where: { id, version, status: { in: from } },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      const current = await this.prisma.enquiry.findUnique({ where: { id }, select: { version: true } });
      if (!current) throw notFound();
      if (current.version !== version) {
        throw new ApiError(HttpStatus.CONFLICT, 'STALE_VERSION', 'This enquiry was changed by someone else. Reload it and try again.');
      }
      throw new ApiError(HttpStatus.CONFLICT, 'INVALID_TRANSITION', invalidMessage);
    }
    return this.get(id);
  }
}

function notFound() {
  return new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Enquiry not found');
}

function toSummary(row: EnquiryRow) {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    contactName: row.contactName,
    phone: row.customer.phone,
    siteCity: row.siteCity,
    requestedCapacityKw: row.requestedCapacityKw,
    systemType: row.systemType,
    subsidyInterest: row.subsidyInterest,
    ownerId: row.ownerId,
    nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
  };
}

function toDetail(row: EnquiryRow) {
  return {
    ...toSummary(row),
    contactEmail: row.contactEmail,
    siteAddressLine: row.siteAddressLine,
    sitePincode: row.sitePincode,
    message: row.message,
    shadowFreeRoofAreaSqm: row.shadowFreeRoofAreaSqm?.toFixed(2) ?? null,
    monthlyBillInr: row.monthlyBillInr?.toFixed(2) ?? null,
    gridConnectionSuitable: row.gridConnectionSuitable,
    closedReason: row.closedReason,
    customer: row.customer,
    updatedAt: row.updatedAt.toISOString(),
  };
}
