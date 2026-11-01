import { z } from 'zod';
import { versionSchema, reasonSchema } from './commands';
import { moneySchema, positiveQuantitySchema } from './shared';
import { productViewSchema, packageDetailSchema } from './catalogue';
import { systemTypeSchema } from './sales';

export const quoteStatusSchema = z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']);
export const quoteLineKindSchema = z.enum(['PACKAGE', 'COMPONENT', 'SERVICE']);
export const quoteSentChannelSchema = z.enum(['EMAIL', 'WHATSAPP', 'PRINT', 'OTHER']);
export const quoteDecisionChannelSchema = z.enum(['IN_PERSON', 'PHONE', 'EMAIL', 'WHATSAPP']);
export const quotePolicySnapshotSchema = z.object({
  policyName: z.string().trim().min(1).max(200), revision: z.string().trim().min(1).max(100),
  scope: z.string().trim().min(1).max(2000), durationMonths: z.number().int().min(1).max(1200),
}).strict();
export type QuotePolicySnapshot = z.infer<typeof quotePolicySnapshotSchema>;

export const createQuoteSchema = z.object({ surveyId: z.uuid(), packageId: z.uuid() }).strict();
export type CreateQuote = z.output<typeof createQuoteSchema>;
export const reviseQuoteSchema = createQuoteSchema.extend({ version: versionSchema, reason: reasonSchema }).strict();
export type ReviseQuote = z.output<typeof reviseQuoteSchema>;
export const sendQuoteSchema = z.object({ version: versionSchema, channel: quoteSentChannelSchema }).strict();
export type SendQuote = z.output<typeof sendQuoteSchema>;
export const acceptQuoteSchema = z.object({
  version: versionSchema, acceptedByName: z.string().trim().min(2).max(120),
  channel: quoteDecisionChannelSchema,
  reference: z.string().trim().min(1).max(500).optional(),
}).strict();
export type AcceptQuote = z.output<typeof acceptQuoteSchema>;
export const rejectQuoteSchema = z.object({ version: versionSchema, reason: reasonSchema }).strict();
export type RejectQuote = z.output<typeof rejectQuoteSchema>;

const cents = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
};
const isZero = (value: string) => /^0(?:\.0{1,2})?$/.test(value);
const isOne = (value: string) => /^1(?:\.0{1,3})?$/.test(value);
export const quoteLineSchema = z.object({
  id: z.uuid(), position: z.number().int().positive(), kind: quoteLineKindSchema,
  description: z.string().min(1), quantity: positiveQuantitySchema, unitPrice: moneySchema, lineTotal: moneySchema,
  productId: z.uuid().nullable(), productSnapshot: productViewSchema.nullable(),
  policyStatus: z.enum(['CONFIGURED', 'UNCONFIGURED', 'NOT_APPLICABLE']),
  warrantyPolicySnapshot: quotePolicySnapshotSchema.nullable(),
}).superRefine((line, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (line.kind === 'PACKAGE') {
    if (line.productId !== null || line.productSnapshot !== null || !isOne(line.quantity)) issue('productId', 'A package charge has quantity one and no stock product');
    if (line.policyStatus !== 'NOT_APPLICABLE' || line.warrantyPolicySnapshot !== null) issue('policyStatus', 'Policy terms belong to product lines');
  } else {
    if (!line.productSnapshot || line.productId !== line.productSnapshot.id) issue('productId', 'The frozen product identity must match');
    if (line.kind === 'COMPONENT' && line.productSnapshot?.kind !== 'HARDWARE') issue('productSnapshot', 'A component line requires hardware');
    if (line.kind === 'SERVICE' && (line.productSnapshot?.kind !== 'SERVICE' || !isOne(line.quantity))) issue('productSnapshot', 'Installation is one service job');
    if (line.productSnapshot?.trackingMode === 'SERIALIZED' && !/^[1-9][0-9]*(?:\.0{1,3})?$/.test(line.quantity)) issue('quantity', 'Serialized requirements must be whole pieces');
    if (line.policyStatus === 'NOT_APPLICABLE' || (line.policyStatus === 'CONFIGURED') !== (line.warrantyPolicySnapshot !== null)) issue('policyStatus', 'Freeze full configured terms or explicitly unconfigured terms');
  }
  if (line.kind === 'COMPONENT') {
    if (!isZero(line.unitPrice) || !isZero(line.lineTotal)) issue('lineTotal', 'Included components do not charge the package price twice');
  } else if (line.unitPrice !== line.lineTotal && moneySchema.safeParse(line.unitPrice).success && moneySchema.safeParse(line.lineTotal).success && cents(line.unitPrice) !== cents(line.lineTotal)) {
    issue('lineTotal', 'A single package or installation charge equals its unit price');
  }
});
export type QuoteLine = z.infer<typeof quoteLineSchema>;

export const quoteSchema = z.object({
  id: z.uuid(), enquiryId: z.uuid(), surveyId: z.uuid(), packageId: z.uuid(), customerId: z.uuid(),
  revision: z.number().int().positive(), version: z.number().int().positive(), status: quoteStatusSchema,
  supersedesQuoteId: z.uuid().nullable(), revisionReason: z.string().nullable(), isLatest: z.boolean(),
  customerSnapshot: z.object({ contactName: z.string().min(1), phone: z.string().min(1),
    addressLine: z.string().min(1), city: z.string().min(1), pincode: z.string().min(1) }),
  packageSnapshot: z.object({ code: z.string().min(1), name: z.string().min(1), capacityKw: z.number().int().min(1).max(5),
    systemType: systemTypeSchema, revision: z.number().int().positive() }),
  hardwarePrice: moneySchema, installationPrice: moneySchema, totalPrice: moneySchema, lines: z.array(quoteLineSchema).min(3),
  createdById: z.uuid(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(), sentChannel: quoteSentChannelSchema.nullable(), sentById: z.uuid().nullable(),
  decidedAt: z.iso.datetime().nullable(), decidedById: z.uuid().nullable(),
  acceptedByName: z.string().nullable(), decisionChannel: quoteDecisionChannelSchema.nullable(),
  decisionReference: z.string().nullable(), decisionReason: z.string().nullable(),
}).superRefine((quote, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  const packages = quote.lines.filter(line => line.kind === 'PACKAGE');
  const services = quote.lines.filter(line => line.kind === 'SERVICE');
  if (packages.length !== 1 || services.length !== 1) issue('lines', 'A quote has exactly one package and one installation charge');
  const hardware = quote.lines.filter(line => line.kind === 'COMPONENT');
  if (!hardware.length || new Set(hardware.map(line => line.productId)).size !== hardware.length) issue('lines', 'Component requirements must be present and unique');
  if (new Set(quote.lines.map(line => line.position)).size !== quote.lines.length) issue('lines', 'Line positions must be unique');
  if ([quote.hardwarePrice, quote.installationPrice, quote.totalPrice].every(value => moneySchema.safeParse(value).success)) {
    if (cents(quote.hardwarePrice) + cents(quote.installationPrice) !== cents(quote.totalPrice)) issue('totalPrice', 'Hardware and installation must reconcile to the total');
    if (packages.length === 1 && moneySchema.safeParse(packages[0]!.lineTotal).success && cents(packages[0]!.lineTotal) !== cents(quote.hardwarePrice)) issue('lines', 'Package charge must match the hardware amount');
    if (services.length === 1 && moneySchema.safeParse(services[0]!.lineTotal).success && cents(services[0]!.lineTotal) !== cents(quote.installationPrice)) issue('lines', 'Service charge must match the installation amount');
  }
  if ((quote.status === 'DRAFT') !== (quote.sentAt === null) || (quote.sentAt === null) !== (quote.sentById === null) || (quote.sentAt === null) !== (quote.sentChannel === null)) issue('sentAt', 'Sent status and evidence must agree');
  const decided = quote.status === 'ACCEPTED' || quote.status === 'REJECTED';
  if (decided ? (quote.decidedAt === null || quote.decidedById === null) : (quote.decidedAt !== null || quote.decidedById !== null)) issue('decidedAt', 'A decision records its actor and server time');
  if (quote.status === 'ACCEPTED' && (!quote.acceptedByName || !quote.decisionChannel)) issue('acceptedByName', 'Record the customer acceptance name and channel');
  if (quote.status === 'REJECTED' && !quote.decisionReason) issue('decisionReason', 'A rejected quote records its reason');
  if (packages.length === 1 && services.length === 1) {
    const kit = packageDetailSchema.safeParse({ id: quote.packageId, ...quote.packageSnapshot, active: false,
      hardwarePrice: quote.hardwarePrice, installationPrice: quote.installationPrice, totalPrice: quote.totalPrice,
      installationProductId: services[0]!.productId, installationProduct: services[0]!.productSnapshot,
      items: hardware.map(line => ({ id: line.id, productId: line.productId, product: line.productSnapshot, position: line.position, quantity: line.quantity })),
    });
    if (!kit.success) issue('lines', 'The frozen component requirements must form a complete package');
  }
});
export type Quote = z.infer<typeof quoteSchema>;
export const quoteResponseSchema = z.object({ data: quoteSchema });
export const quoteListResponseSchema = z.object({ data: z.object({ items: z.array(quoteSchema) }) });
