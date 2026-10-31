import { z } from 'zod';

const version = z.number().int().positive();
const timestamp = z.iso.datetime({ offset: true });
const uniqueIds = z.array(z.uuid()).refine((ids) => new Set(ids).size === ids.length, 'Duplicate IDs are not allowed');
const ordered = (value: { startedAt: string; finishedAt: string }) => Date.parse(value.startedAt) < Date.parse(value.finishedAt);
export const installationStatusSchema = z.enum(['SCHEDULED', 'IN_PROGRESS', 'AWAITING_ACCEPTANCE', 'COMPLETED']);
export const installationCheckSchema = z.enum(['MOUNTING', 'PANELS', 'WIRING', 'EARTHING', 'POWER_GENERATION', 'BATTERY']);
export const scheduleJobRequestSchema = z.object({
  expectedVersion: version, scheduledStart: timestamp, scheduledFinish: timestamp,
  technicianIds: uniqueIds.pipe(z.array(z.uuid()).min(1).max(15)),
}).strict().refine((value) => Date.parse(value.scheduledStart) < Date.parse(value.scheduledFinish), {
  path: ['scheduledFinish'], message: 'Scheduled finish must be after start',
});
export const startInstallationRequestSchema = z.object({ expectedVersion: version, startedAt: timestamp }).strict();
export const installationTimeRecordInputSchema = z.object({
  technicianId: z.uuid(), startedAt: timestamp, finishedAt: timestamp,
}).strict().refine(ordered, { path: ['finishedAt'], message: 'Finish must be after start' });
export const completeInstallationRequestSchema = z.object({
  expectedVersion: version, startedAt: timestamp, finishedAt: timestamp,
  installedCapacityKw: z.number().finite().min(1).max(5),
  photoFileIds: uniqueIds.pipe(z.array(z.uuid()).min(1).max(20)),
  signatureFileId: z.uuid(), signerName: z.string().trim().min(2).max(120),
  completedChecks: z.array(installationCheckSchema).min(1).max(6)
    .refine((codes) => new Set(codes).size === codes.length, 'Duplicate checklist codes are not allowed'),
  timeRecords: z.array(installationTimeRecordInputSchema).min(1).max(15),
}).strict().refine(ordered, { path: ['finishedAt'], message: 'Finish must be after start' })
  .refine((value) => !value.photoFileIds.includes(value.signatureFileId), {
    path: ['signatureFileId'], message: 'A roof photograph is not signature evidence',
  });
// The service checks serverNow, assigned staff, matching accepted capacity/package,
// persisted private files, required checks and authorized actors inside its transaction.
// Clock/date policy is not evaluated by a transport schema at module import time.
export const jobViewSchema = z.object({
  id: z.uuid(), orderId: z.uuid(), customerId: z.uuid(), status: installationStatusSchema, version,
  scheduledStart: timestamp.nullable(), scheduledFinish: timestamp.nullable(),
  technicianIds: uniqueIds, startedAt: timestamp.nullable(), finishedAt: timestamp.nullable(),
  installedCapacityKw: z.number().finite().min(1).max(5).nullable(),
  photoFileIds: uniqueIds, signatureFileId: z.uuid().nullable(),
});
export type ScheduleJobRequest = z.infer<typeof scheduleJobRequestSchema>;
export type CompleteInstallationRequest = z.infer<typeof completeInstallationRequestSchema>;
export type InstallationTimeRecordInput = z.infer<typeof installationTimeRecordInputSchema>;

export type StartInstallationRequest = z.infer<typeof startInstallationRequestSchema>;
export type JobView = z.infer<typeof jobViewSchema>;
