import { z } from 'zod';
import { decimalString, reasonSchema, versionSchema } from './commands';

// Site survey (D2, R3–R4). One record per revision: SCHEDULED → SUBMITTED → APPROVED | REJECTED.
// A decided revision is never edited. Changing the facts later means scheduling a new revision, so the earlier
// approval stays as evidence. A quote needs the enquiry's latest revision to be APPROVED.

export const surveyStatusSchema = z.enum(['SCHEDULED', 'SUBMITTED', 'APPROVED', 'REJECTED']);
export type SurveyStatus = z.infer<typeof surveyStatusSchema>;

export const roofDirectionSchema = z.enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], { error: 'Choose the roof direction' });
export type RoofDirection = z.infer<typeof roofDirectionSchema>;

const technicianId = z.uuid({ error: 'Choose a technician' });
const scheduledFor = z.iso.datetime({ offset: true, error: 'Enter a valid survey date and time' });

export const scheduleSurveySchema = z.object({ technicianId, scheduledFor }).strict();
export type ScheduleSurvey = z.output<typeof scheduleSurveySchema>;

export const rescheduleSurveySchema = z.object({ version: versionSchema, technicianId, scheduledFor }).strict();
export type RescheduleSurvey = z.output<typeof rescheduleSurveySchema>;

/** The technician's site measurements (PDF: roof direction, tilt and cable distance). */
export const submitSurveySchema = z.object({
  version: versionSchema,
  roofDirection: roofDirectionSchema,
  roofTiltDeg: decimalString('the roof tilt', 90, 1),
  cableDistanceM: decimalString('the cable distance', 1_000),
  usableRoofAreaSqm: decimalString('the usable roof area', 100_000),
  notes: z.string({ error: 'Notes must be text' }).trim().max(2_000, 'Notes must be at most 2000 characters')
    .transform((value) => value || undefined).optional(),
}).strict();
export type SubmitSurvey = z.output<typeof submitSurveySchema>;
export type SubmitSurveyInput = z.input<typeof submitSurveySchema>;

export const approveSurveySchema = z.object({ version: versionSchema }).strict();
export type ApproveSurvey = z.output<typeof approveSurveySchema>;

export const rejectSurveySchema = z.object({ version: versionSchema, reason: reasonSchema }).strict();
export type RejectSurvey = z.output<typeof rejectSurveySchema>;

const staffRef = z.object({ id: z.uuid(), displayName: z.string() });

export const surveySchema = z.object({
  id: z.uuid(),
  enquiryId: z.uuid(),
  revision: z.number().int().min(1),
  status: surveyStatusSchema,
  technician: staffRef,
  scheduledFor: z.iso.datetime(),
  // Where the technician goes, as recorded on the enquiry.
  site: z.object({
    contactName: z.string(), phone: z.string(), addressLine: z.string(), city: z.string(), pincode: z.string(),
  }),
  roofDirection: roofDirectionSchema.nullable(),
  roofTiltDeg: z.string().nullable(),
  cableDistanceM: z.string().nullable(),
  usableRoofAreaSqm: z.string().nullable(),
  notes: z.string().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  decidedBy: staffRef.nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionReason: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Survey = z.infer<typeof surveySchema>;

export const surveyResponseSchema = z.object({ data: surveySchema });
export const surveyListResponseSchema = z.object({ data: z.object({ items: z.array(surveySchema) }) });
export type SurveyListResponse = z.infer<typeof surveyListResponseSchema>;
