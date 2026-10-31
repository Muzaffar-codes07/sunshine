import { HttpStatus, Injectable } from '@nestjs/common';
import {
  surveyListResponseSchema, surveyResponseSchema,
  type ApproveSurvey, type RejectSurvey, type RescheduleSurvey, type ScheduleSurvey, type StaffIdentity, type SubmitSurvey,
} from '@sunshine/contracts';
import { ApiError, refusal } from '../platform/api-error';
import { SURVEY_ALREADY_OPEN } from '../platform/constraint-errors';
import { PrismaService } from '../platform/prisma.service';
import type { EnquiryStatus, Prisma, SurveyStatus } from '../generated/prisma/client';

const OPEN: SurveyStatus[] = ['SCHEDULED', 'SUBMITTED'];

const surveyInclude = {
  technician: { select: { id: true, displayName: true } },
  decidedBy: { select: { id: true, displayName: true } },
  enquiry: {
    select: { contactName: true, siteAddressLine: true, siteCity: true, sitePincode: true, customer: { select: { phone: true } } },
  },
} satisfies Prisma.SurveyInclude;
type SurveyRow = Prisma.SurveyGetPayload<{ include: typeof surveyInclude }>;

/**
 * Site survey revisions (R3–R4): sales schedules a technician, the technician records the roof facts, sales approves
 * or rejects. A decided revision is never edited; changing the facts later means scheduling the next revision.
 */
@Injectable()
export class SurveysService {
  constructor(private readonly prisma: PrismaService) {}

  async schedule(enquiryId: string, command: ScheduleSurvey) {
    await this.requireTechnician(command.technicianId);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        // Lock the enquiry so two schedulers cannot both pick the next revision number.
        const [enquiry] = await tx.$queryRaw<{ status: EnquiryStatus }[]>`
          SELECT status FROM enquiries WHERE id = ${enquiryId}::uuid FOR UPDATE`;
        if (!enquiry) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Enquiry not found');
        if (enquiry.status !== 'QUALIFIED') {
          throw new ApiError(HttpStatus.CONFLICT, 'INVALID_TRANSITION', 'Qualify the enquiry before scheduling a survey.');
        }
        const latest = await tx.survey.findFirst({
          where: { enquiryId }, orderBy: { revision: 'desc' }, select: { revision: true, status: true },
        });
        if (latest && OPEN.includes(latest.status)) throw surveyAlreadyOpen();
        const created = await tx.survey.create({
          data: {
            enquiryId, revision: (latest?.revision ?? 0) + 1,
            technicianId: command.technicianId, scheduledFor: new Date(command.scheduledFor),
          },
          select: { id: true },
        });
        return created.id;
      });
      return this.respond(id);
    } catch (error) {
      // Backstop for surveys_one_open_per_enquiry and the (enquiryId, revision) key.
      if (isUniqueViolation(error)) throw surveyAlreadyOpen();
      throw error;
    }
  }

  async listForEnquiry(enquiryId: string) {
    const enquiry = await this.prisma.enquiry.findUnique({ where: { id: enquiryId }, select: { id: true } });
    if (!enquiry) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Enquiry not found');
    const rows = await this.prisma.survey.findMany({ where: { enquiryId }, include: surveyInclude, orderBy: { revision: 'desc' } });
    return surveyListResponseSchema.parse({ data: { items: rows.map(toSurvey) } });
  }

  /** The technician's own schedule: surveys still to visit or to correct, soonest first. */
  async assigned(technician: StaffIdentity) {
    const rows = await this.prisma.survey.findMany({
      where: { technicianId: technician.id, status: { in: OPEN } },
      include: surveyInclude,
      orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    return surveyListResponseSchema.parse({ data: { items: rows.map(toSurvey) } });
  }

  get(id: string, actor: StaffIdentity) {
    return this.respond(id, visibleTo(actor));
  }

  async reschedule(id: string, command: RescheduleSurvey) {
    await this.requireTechnician(command.technicianId);
    return this.transition(id, command.version, ['SCHEDULED'], {
      technicianId: command.technicianId, scheduledFor: new Date(command.scheduledFor),
    }, 'Only a survey that has not been submitted can be rescheduled.');
  }

  /** A technician may submit only their own survey; resubmitting corrects it until sales decides. */
  submit(id: string, command: SubmitSurvey, actor: StaffIdentity) {
    return this.transition(id, command.version, OPEN, {
      status: 'SUBMITTED',
      roofDirection: command.roofDirection,
      roofTiltDeg: command.roofTiltDeg,
      cableDistanceM: command.cableDistanceM,
      usableRoofAreaSqm: command.usableRoofAreaSqm,
      notes: command.notes ?? null,
      submittedAt: new Date(),
    }, 'This survey has already been decided. Schedule a new revision to change it.', visibleTo(actor));
  }

  approve(id: string, command: ApproveSurvey, actor: StaffIdentity) {
    return this.transition(id, command.version, ['SUBMITTED'], {
      status: 'APPROVED', decidedById: actor.id, decidedAt: new Date(),
    }, 'Only a submitted survey can be approved.');
  }

  reject(id: string, command: RejectSurvey, actor: StaffIdentity) {
    return this.transition(id, command.version, ['SUBMITTED'], {
      status: 'REJECTED', decidedById: actor.id, decidedAt: new Date(), decisionReason: command.reason,
    }, 'Only a submitted survey can be rejected.');
  }

  /**
   * For quote creation (X4), inside the caller's transaction: the survey must be APPROVED and still the enquiry's
   * latest revision. Takes a share lock on the enquiry, so a new revision cannot open while the quote is written.
   */
  async requireApprovedSurvey(tx: Prisma.TransactionClient, surveyId: string) {
    const survey = await tx.survey.findUnique({ where: { id: surveyId }, select: { id: true, enquiryId: true, revision: true, status: true } });
    if (!survey) throw notFound();
    await tx.$queryRaw`SELECT id FROM enquiries WHERE id = ${survey.enquiryId}::uuid FOR SHARE`;
    const latest = await tx.survey.findFirst({ where: { enquiryId: survey.enquiryId }, orderBy: { revision: 'desc' }, select: { id: true } });
    if (latest?.id !== survey.id) {
      throw refusal({
        code: 'SURVEY_NOT_APPROVED', reason: 'A newer survey revision exists for this enquiry.', source: 'SURVEY',
        nextAction: 'Quote from the latest revision once it is approved.',
      });
    }
    if (survey.status !== 'APPROVED') {
      throw refusal({
        code: 'SURVEY_NOT_APPROVED', reason: 'The site survey is not approved yet.', source: 'SURVEY',
        nextAction: 'Approve the submitted survey, then create the quote.',
      });
    }
    return survey;
  }

  private async requireTechnician(technicianId: string) {
    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, active: true, role: 'TECHNICIAN' }, select: { id: true },
    });
    if (!technician) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', {
        technicianId: ['Choose an active technician'],
      });
    }
  }

  /** Same single-UPDATE version and status check as the enquiry queue; `scope` hides other technicians' surveys. */
  private async transition(
    id: string, version: number, from: SurveyStatus[], data: Prisma.SurveyUncheckedUpdateManyInput, invalidMessage: string,
    scope: Prisma.SurveyWhereInput = {},
  ) {
    const { count } = await this.prisma.survey.updateMany({
      where: { ...scope, id, version, status: { in: from } },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      const current = await this.prisma.survey.findFirst({ where: { ...scope, id }, select: { version: true } });
      if (!current) throw notFound();
      if (current.version !== version) {
        throw new ApiError(HttpStatus.CONFLICT, 'STALE_VERSION', 'This survey was changed by someone else. Reload it and try again.');
      }
      throw new ApiError(HttpStatus.CONFLICT, 'INVALID_TRANSITION', invalidMessage);
    }
    return this.respond(id);
  }

  private async respond(id: string, scope: Prisma.SurveyWhereInput = {}) {
    const row = await this.prisma.survey.findFirst({ where: { ...scope, id }, include: surveyInclude });
    if (!row) throw notFound();
    return surveyResponseSchema.parse({ data: toSurvey(row) });
  }
}

/** Technicians see only surveys assigned to them; anyone else gets a 404, not a hint that the survey exists. */
function visibleTo(actor: StaffIdentity): Prisma.SurveyWhereInput {
  return actor.role === 'TECHNICIAN' ? { technicianId: actor.id } : {};
}

function notFound() {
  return new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Survey not found');
}

function surveyAlreadyOpen() {
  return refusal(SURVEY_ALREADY_OPEN);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

function toSurvey(row: SurveyRow) {
  return {
    id: row.id,
    enquiryId: row.enquiryId,
    revision: row.revision,
    status: row.status,
    technician: row.technician,
    scheduledFor: row.scheduledFor.toISOString(),
    site: {
      contactName: row.enquiry.contactName,
      phone: row.enquiry.customer.phone,
      addressLine: row.enquiry.siteAddressLine,
      city: row.enquiry.siteCity,
      pincode: row.enquiry.sitePincode,
    },
    roofDirection: row.roofDirection,
    roofTiltDeg: row.roofTiltDeg?.toFixed(1) ?? null,
    cableDistanceM: row.cableDistanceM?.toFixed(2) ?? null,
    usableRoofAreaSqm: row.usableRoofAreaSqm?.toFixed(2) ?? null,
    notes: row.notes,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionReason: row.decisionReason,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
