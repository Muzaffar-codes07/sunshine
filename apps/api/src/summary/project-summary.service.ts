import { HttpStatus, Injectable } from '@nestjs/common';
import { projectSummaryResponseSchema, type ProjectSummary } from '@sunshine/contracts';
import { ApiError } from '../platform/api-error';
import { PrismaService } from '../platform/prisma.service';

type Step = ProjectSummary['nextStep'];
const step = (code: Step['code'], text: string): Step => ({ code, text });
const pad = (prefix: string, number: number) => `${prefix}-${String(number).padStart(6, '0')}`;

/**
 * Read-only D2 summary of one enquiry: latest survey, latest quote, order and invoice, plus the stage and the
 * next thing staff should do. It reads in one snapshot transaction and never writes.
 */
@Injectable()
export class ProjectSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async get(enquiryId: string) {
    const [enquiry, survey, quote, order] = await this.prisma.$transaction([
      this.prisma.enquiry.findUnique({ where: { id: enquiryId } }),
      this.prisma.survey.findFirst({
        where: { enquiryId }, orderBy: { revision: 'desc' }, include: { technician: { select: { displayName: true } } },
      }),
      this.prisma.quote.findFirst({ where: { enquiryId }, orderBy: { revision: 'desc' } }),
      this.prisma.order.findUnique({ where: { enquiryId }, include: { invoices: { where: { kind: 'SALE' } } } }),
    ]);
    if (!enquiry) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Enquiry not found');
    const invoice = order?.invoices[0] ?? null;

    const summary: Omit<ProjectSummary, 'stage' | 'nextStep'> = {
      enquiry: {
        id: enquiry.id, status: enquiry.status, contactName: enquiry.contactName, siteCity: enquiry.siteCity,
        requestedCapacityKw: enquiry.requestedCapacityKw, ownerId: enquiry.ownerId, nextFollowUpAt: enquiry.nextFollowUpAt?.toISOString() ?? null,
      },
      survey: survey && {
        id: survey.id, revision: survey.revision, status: survey.status, scheduledFor: survey.scheduledFor.toISOString(),
        technicianName: survey.technician.displayName,
      },
      quote: quote && { id: quote.id, revision: quote.revision, status: quote.status, totalPrice: quote.totalPrice.toFixed(2) },
      order: order && { id: order.id, displayNumber: pad('ORD', order.number), jobId: order.jobId, released: !!invoice?.paidAmount.greaterThan(0) },
      invoice: invoice && {
        id: invoice.id, displayNumber: pad('INV', invoice.number), status: invoice.status, total: invoice.total.toFixed(2),
        paidAmount: invoice.paidAmount.toFixed(2), balance: invoice.total.sub(invoice.paidAmount).toFixed(2),
      },
    };
    return projectSummaryResponseSchema.parse({ data: { ...summary, ...progress(summary) } });
  }
}

/** The furthest stage reached and the one next step, checked from the money end backwards. */
function progress(s: Omit<ProjectSummary, 'stage' | 'nextStep'>): Pick<ProjectSummary, 'stage' | 'nextStep'> {
  if (s.invoice) {
    if (s.invoice.status === 'PAID') return { stage: 'PAID', nextStep: step('NONE', 'Fully paid; installation and service continue in the job.') };
    if (s.invoice.status === 'PART_PAID') return { stage: 'ORDER', nextStep: step('COLLECT_BALANCE', `Collect the balance of ₹${s.invoice.balance}.`) };
    return { stage: 'ORDER', nextStep: step('RECORD_ADVANCE', 'Record the advance payment to release the job for packing.') };
  }
  if (s.enquiry.status === 'DISQUALIFIED' || s.enquiry.status === 'ARCHIVED') {
    return { stage: 'CLOSED', nextStep: step('NONE', 'Closed; kept as history.') };
  }
  if (s.enquiry.status !== 'QUALIFIED') {
    return { stage: 'ENQUIRY', nextStep: step('QUALIFY_ENQUIRY', 'Call the customer and record roof area, monthly bill and grid suitability.') };
  }
  const surveyApproved = s.survey?.status === 'APPROVED';
  if (s.quote && surveyApproved) {
    switch (s.quote.status) {
      case 'DRAFT': return { stage: 'QUOTE', nextStep: step('SEND_QUOTE', 'Send the quote to the customer and record how.') };
      case 'SENT': return { stage: 'QUOTE', nextStep: step('RECORD_QUOTE_DECISION', "Record the customer's acceptance or rejection.") };
      case 'REJECTED': return { stage: 'QUOTE', nextStep: step('REVISE_QUOTE', 'Revise the quote with changed terms, or archive the enquiry.') };
      case 'ACCEPTED': return { stage: 'QUOTE', nextStep: step('CONFIRM_ORDER', 'Confirm the order from the accepted quote.') };
    }
  }
  switch (s.survey?.status) {
    case undefined: return { stage: 'SURVEY', nextStep: step('SCHEDULE_SURVEY', 'Book a technician for the site survey.') };
    case 'SCHEDULED': return { stage: 'SURVEY', nextStep: step('RECORD_SURVEY', `${s.survey.technicianName} records the roof measurements.`) };
    case 'SUBMITTED': return { stage: 'SURVEY', nextStep: step('DECIDE_SURVEY', 'Approve or reject the submitted survey.') };
    case 'REJECTED': return { stage: 'SURVEY', nextStep: step('RESCHEDULE_SURVEY', 'Schedule a new survey revision.') };
    default: return { stage: 'QUOTE', nextStep: step('CREATE_QUOTE', 'Create the quote from the approved survey and a package.') };
  }
}
