import { z } from 'zod';
import { decimalString, reasonSchema, versionSchema } from './commands';
import { enquirySourceSchema, enquiryStatusSchema, systemTypeSchema } from './sales';

// Staff enquiry queue (D2, R1–R2). All commands carry the version the user last saw;
// a stale version is refused with 409 STALE_VERSION instead of silently overwriting.

const optionalUuid = (label: string) => z.uuid({ error: `${label} must be a valid ID` });

const pageNumber = (label: string, max: number, fallback: number) =>
  z.coerce.number<string | number>({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`).min(1, `${label} must be at least 1`).max(max, `${label} must be at most ${max}`)
    .default(fallback);

export const enquiryListQuerySchema = z.object({
  status: enquiryStatusSchema.optional(),
  ownerId: optionalUuid('Owner').optional(),
  page: pageNumber('Page', 10_000, 1),
  pageSize: pageNumber('Page size', 100, 25),
}, { error: 'Unknown filter' }).strict();
export type EnquiryListQuery = z.output<typeof enquiryListQuerySchema>;

export const enquirySummarySchema = z.object({
  id: z.uuid(),
  status: enquiryStatusSchema,
  source: enquirySourceSchema,
  contactName: z.string(),
  phone: z.string(),
  siteCity: z.string(),
  requestedCapacityKw: z.number().int(),
  systemType: systemTypeSchema.nullable(),
  subsidyInterest: z.boolean(),
  ownerId: z.uuid().nullable(),
  nextFollowUpAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  version: z.number().int(),
});
export type EnquirySummary = z.infer<typeof enquirySummarySchema>;

export const enquiryListResponseSchema = z.object({
  data: z.object({
    items: z.array(enquirySummarySchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  }),
});
export type EnquiryListResponse = z.infer<typeof enquiryListResponseSchema>;

export const enquiryDetailSchema = enquirySummarySchema.extend({
  contactEmail: z.string().nullable(),
  siteAddressLine: z.string(),
  sitePincode: z.string(),
  message: z.string().nullable(),
  shadowFreeRoofAreaSqm: z.string().nullable(),
  monthlyBillInr: z.string().nullable(),
  gridConnectionSuitable: z.boolean().nullable(),
  closedReason: z.string().nullable(),
  customer: z.object({ id: z.uuid(), name: z.string(), phone: z.string(), email: z.string().nullable() }),
  updatedAt: z.iso.datetime(),
});
export type EnquiryDetail = z.infer<typeof enquiryDetailSchema>;
export const enquiryDetailResponseSchema = z.object({ data: enquiryDetailSchema });

export const markEnquiryContactedSchema = z.object({ version: versionSchema }).strict();
export type MarkEnquiryContacted = z.output<typeof markEnquiryContactedSchema>;

/** Qualification call (PDF: shadow-free roof space, monthly bill, grid connection). */
export const qualifyEnquirySchema = z.object({
  version: versionSchema,
  shadowFreeRoofAreaSqm: decimalString('the shadow-free roof area', 100_000),
  monthlyBillInr: decimalString('the monthly bill', 10_000_000),
  gridConnectionSuitable: z.boolean({ error: 'Choose whether the grid connection is suitable' }),
  outcome: z.enum(['QUALIFIED', 'DISQUALIFIED'], { error: 'Choose qualified or disqualified' }),
  reason: reasonSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.outcome === 'DISQUALIFIED' && !value.reason) {
    ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason when disqualifying an enquiry' });
  }
});
export type QualifyEnquiry = z.output<typeof qualifyEnquirySchema>;
export type QualifyEnquiryInput = z.input<typeof qualifyEnquirySchema>;

export const assignEnquirySchema = z.object({
  version: versionSchema,
  ownerId: optionalUuid('Owner').nullable(),
  nextFollowUpAt: z.iso.datetime({ offset: true, error: 'Enter a valid follow-up date and time' }).nullable(),
}).strict();
export type AssignEnquiry = z.output<typeof assignEnquirySchema>;

export const archiveEnquirySchema = z.object({ version: versionSchema, reason: reasonSchema }).strict();
export type ArchiveEnquiry = z.output<typeof archiveEnquirySchema>;
