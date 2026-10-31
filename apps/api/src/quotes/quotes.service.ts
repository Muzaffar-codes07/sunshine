import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  quoteSchema, quotePolicySnapshotSchema, type Quote, type CreateQuote, type ReviseQuote,
  type SendQuote, type AcceptQuote, type RejectQuote, type StaffIdentity, type ProductView,
} from '@sunshine/contracts';
import { CatalogService } from '../catalog/catalog.service';
import { SurveysService } from '../sales/surveys.service';
import { PrismaService } from '../platform/prisma.service';
import { ApiError, refusal } from '../platform/api-error';
import { Prisma } from '../generated/prisma/client';
import { QUOTE_WARRANTY_POLICY_READER, type QuoteWarrantyPolicyReader } from './quote-policy.port';

const quoteInclude = { lines: { orderBy: { position: 'asc' } } } satisfies Prisma.QuoteInclude;
type QuoteRow = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const blocked = (code: string, reason: string, nextAction: string) => refusal({ code, reason, source: 'QUOTE', nextAction });

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly surveys: SurveysService,
    @Optional() @Inject(QUOTE_WARRANTY_POLICY_READER) private readonly policies?: QuoteWarrantyPolicyReader,
  ) {}

  async create(enquiryId: string, command: CreateQuote, actor: StaffIdentity) {
    return this.prisma.$transaction(async tx => {
      await this.lockEnquiry(tx, enquiryId);
      const latest = await tx.quote.findFirst({ where: { enquiryId }, orderBy: { revision: 'desc' }, select: { id: true } });
      if (latest) throw blocked('QUOTE_ALREADY_EXISTS', 'This enquiry already has a quote revision.', 'Open the latest quote and use Revise to change its terms.');
      return { data: await this.snapshot(tx, enquiryId, command, actor, 1) };
    }, { timeout: 15000 });
  }

  async revise(id: string, command: ReviseQuote, actor: StaffIdentity) {
    return this.prisma.$transaction(async tx => {
      const current = await this.currentForCommand(tx, id, command.version);
      return { data: await this.snapshot(tx, current.enquiryId, command, actor, current.revision + 1, current.id, command.reason) };
    }, { timeout: 15000 });
  }

  async listForEnquiry(enquiryId: string) {
    if (!await this.prisma.enquiry.findUnique({ where: { id: enquiryId }, select: { id: true } })) throw new ApiError(404, 'NOT_FOUND', 'Enquiry not found');
    const rows = await this.prisma.quote.findMany({ where: { enquiryId }, include: quoteInclude, orderBy: { revision: 'desc' } });
    return { data: { items: rows.map((row, index) => quoteView(row, index === 0)) } };
  }

  async get(id: string) {
    const row = await this.prisma.quote.findUnique({ where: { id }, include: quoteInclude });
    if (!row) throw notFound();
    const latest = await this.prisma.quote.findFirst({ where: { enquiryId: row.enquiryId }, orderBy: { revision: 'desc' }, select: { id: true } });
    return { data: quoteView(row, latest?.id === id) };
  }

  send(id: string, command: SendQuote, actor: StaffIdentity) {
    return this.transition(id, command.version, 'DRAFT', {
      status: 'SENT', sentAt: new Date(), sentChannel: command.channel, sentById: actor.id,
    });
  }
  accept(id: string, command: AcceptQuote, actor: StaffIdentity) {
    return this.transition(id, command.version, 'SENT', {
      status: 'ACCEPTED', decidedAt: new Date(), decidedById: actor.id,
      acceptedByName: command.acceptedByName, decisionChannel: command.channel, decisionReference: command.reference ?? null,
    });
  }
  reject(id: string, command: RejectQuote, actor: StaffIdentity) {
    return this.transition(id, command.version, 'SENT', {
      status: 'REJECTED', decidedAt: new Date(), decidedById: actor.id, decisionReason: command.reason,
    });
  }

  /** C5 reads immutable terms in its transaction. The share lock prevents a successor while an order is written. */
  async requireAcceptedQuote(tx: Prisma.TransactionClient, id: string): Promise<Quote> {
    const found = await tx.quote.findUnique({ where: { id }, select: { enquiryId: true } });
    if (!found) throw notFound();
    await tx.$queryRawUnsafe('SELECT id FROM enquiries WHERE id = $1::uuid FOR SHARE', found.enquiryId);
    const row = await tx.quote.findUnique({ where: { id }, include: quoteInclude });
    if (!row) throw notFound();
    await this.requireLatest(tx, row);
    if (row.status !== 'ACCEPTED') throw blocked('QUOTE_NOT_ACCEPTED', 'The quote has not been accepted.', 'Record customer acceptance of the sent quote before confirming the order.');
    return quoteView(row, true);
  }

  private async lockEnquiry(tx: Prisma.TransactionClient, id: string) {
    const [row] = await tx.$queryRawUnsafe<{ id: string; status: string }[]>('SELECT id, status FROM enquiries WHERE id = $1::uuid FOR UPDATE', id);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Enquiry not found');
    if (row.status !== 'QUALIFIED') throw blocked('ENQUIRY_NOT_QUALIFIED', 'Only an open qualified enquiry can receive quote changes.', 'Qualify an open enquiry before quoting; keep closed enquiries as history.');
  }

  private async currentForCommand(tx: Prisma.TransactionClient, id: string, version: number) {
    const found = await tx.quote.findUnique({ where: { id }, select: { enquiryId: true } });
    if (!found) throw notFound();
    await this.lockEnquiry(tx, found.enquiryId);
    const row = await tx.quote.findUnique({ where: { id }, include: quoteInclude });
    if (!row) throw notFound();
    await this.requireLatest(tx, row);
    if (row.version !== version) throw blocked('STALE_VERSION', 'This quote was changed by someone else.', 'Reload the latest quote and review its current terms before retrying.');
    return row;
  }

  private async requireLatest(tx: Prisma.TransactionClient, row: Pick<QuoteRow, 'id' | 'enquiryId'>) {
    const latest = await tx.quote.findFirst({ where: { enquiryId: row.enquiryId }, orderBy: { revision: 'desc' }, select: { id: true } });
    if (latest?.id !== row.id) throw blocked('QUOTE_SUPERSEDED', 'A newer quote revision exists.', 'Open the latest revision; the earlier terms remain available as history.');
  }

  private async transition(id: string, version: number, from: 'DRAFT' | 'SENT', data: Prisma.QuoteUncheckedUpdateManyInput) {
    return this.prisma.$transaction(async tx => {
      const row = await this.currentForCommand(tx, id, version);
      if (row.status !== from) throw blocked('INVALID_TRANSITION', 'This quote cannot make that transition.', 'Review its current status; use Revise to prepare changed terms.');
      quoteView(row, true); // Reject incomplete or inconsistent snapshots before changing state.
      const result = await tx.quote.updateMany({ where: { id, version, status: from }, data: { ...data, version: { increment: 1 } } });
      if (result.count !== 1) throw blocked('STALE_VERSION', 'This quote was changed by someone else.', 'Reload the quote before retrying.');
      const updated = await tx.quote.findUniqueOrThrow({ where: { id }, include: quoteInclude });
      return { data: quoteView(updated, true) };
    });
  }

  private async snapshot(
    tx: Prisma.TransactionClient, enquiryId: string, command: CreateQuote, actor: StaffIdentity,
    revision: number, supersedesQuoteId?: string, revisionReason?: string,
  ): Promise<Quote> {
    const survey = await this.surveys.requireApprovedSurvey(tx, command.surveyId);
    if (survey.enquiryId !== enquiryId) throw new ApiError(400, 'INVALID_INPUT', 'Some fields need attention', { surveyId: ['Choose a survey belonging to this enquiry'] });
    const kit = await this.catalog.getPackageFacts(tx, command.packageId);
    if (!kit.active) throw blocked('PACKAGE_NOT_CURRENT', 'The selected package revision is no longer current.', 'Choose the current package and create a new quote revision.');
    const enquiry = await tx.enquiry.findUniqueOrThrow({ where: { id: enquiryId }, include: { customer: { select: { phone: true } } } });
    const lines: Prisma.QuoteLineUncheckedCreateWithoutQuoteInput[] = [{
      position: 1, kind: 'PACKAGE', description: kit.name, quantity: '1.000', unitPrice: kit.hardwarePrice, lineTotal: kit.hardwarePrice,
      productId: null, productSnapshot: Prisma.DbNull, policyStatus: 'NOT_APPLICABLE', warrantyPolicySnapshot: Prisma.DbNull,
    }];
    for (const item of kit.items) lines.push(await this.productLine(tx, 'COMPONENT', lines.length + 1, item.product, item.quantity, '0.00'));
    lines.push(await this.productLine(tx, 'SERVICE', lines.length + 1, kit.installationProduct, '1.000', kit.installationPrice));
    const row = await tx.quote.create({ data: {
      enquiryId, surveyId: survey.id, packageId: kit.id, customerId: enquiry.customerId, revision, supersedesQuoteId, revisionReason,
      customerSnapshot: { contactName: enquiry.contactName, phone: enquiry.customer.phone, addressLine: enquiry.siteAddressLine, city: enquiry.siteCity, pincode: enquiry.sitePincode },
      packageSnapshot: { code: kit.code, name: kit.name, capacityKw: kit.capacityKw, systemType: kit.systemType, revision: kit.revision },
      hardwarePrice: kit.hardwarePrice, installationPrice: kit.installationPrice, totalPrice: kit.totalPrice,
      createdById: actor.id, lines: { create: lines },
    }, include: quoteInclude });
    return quoteView(row, true);
  }

  private async productLine(
    tx: Prisma.TransactionClient, kind: 'COMPONENT' | 'SERVICE', position: number,
    product: ProductView, quantity: string, price: string,
  ): Promise<Prisma.QuoteLineUncheckedCreateWithoutQuoteInput> {
    const raw = this.policies ? await this.policies.getWarrantyPolicySnapshot(tx, product.id) : null;
    const parsed = raw === null ? null : quotePolicySnapshotSchema.safeParse(raw);
    if (parsed && !parsed.success) throw new ApiError(503, 'POLICY_DATA_INVALID', 'The product policy terms need review before quoting');
    const policy = parsed?.success ? parsed.data : null;
    return { position, kind, description: product.name, quantity, unitPrice: price, lineTotal: price, productId: product.id,
      productSnapshot: json(product), policyStatus: policy ? 'CONFIGURED' : 'UNCONFIGURED',
      warrantyPolicySnapshot: policy ? json(policy) : Prisma.DbNull };
  }
}

function notFound() { return new ApiError(404, 'QUOTE_NOT_FOUND', 'Quote not found'); }
function quoteView(row: QuoteRow, isLatest: boolean): Quote {
  const result = quoteSchema.safeParse({
    id: row.id, enquiryId: row.enquiryId, surveyId: row.surveyId, packageId: row.packageId, customerId: row.customerId,
    revision: row.revision, version: row.version, status: row.status, supersedesQuoteId: row.supersedesQuoteId, revisionReason: row.revisionReason, isLatest,
    customerSnapshot: row.customerSnapshot, packageSnapshot: row.packageSnapshot,
    hardwarePrice: row.hardwarePrice.toFixed(2), installationPrice: row.installationPrice.toFixed(2), totalPrice: row.totalPrice.toFixed(2),
    createdById: row.createdById, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null, sentById: row.sentById, sentChannel: row.sentChannel,
    decidedAt: row.decidedAt?.toISOString() ?? null, decidedById: row.decidedById,
    acceptedByName: row.acceptedByName, decisionChannel: row.decisionChannel, decisionReference: row.decisionReference, decisionReason: row.decisionReason,
    lines: row.lines.map(line => ({ id: line.id, position: line.position, kind: line.kind, description: line.description,
      quantity: line.quantity.toFixed(3), unitPrice: line.unitPrice.toFixed(2), lineTotal: line.lineTotal.toFixed(2),
      productId: line.productId, productSnapshot: line.productSnapshot, policyStatus: line.policyStatus, warrantyPolicySnapshot: line.warrantyPolicySnapshot })),
  });
  if (!result.success) throw new ApiError(503, 'QUOTE_DATA_INVALID', 'This quote has incomplete or inconsistent frozen terms');
  return result.data;
}
