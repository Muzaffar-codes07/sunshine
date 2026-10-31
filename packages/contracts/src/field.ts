import { z } from 'zod';

const version = z.number().int().positive();
const timestamp = z.iso.datetime({ offset: true });
// PostgreSQL returns UUIDs in lower case, so request IDs are made to match before they're compared.
const canonicalId = z.uuid().transform((value) => value.toLowerCase());
const uniqueIds = z.array(canonicalId).refine((ids) => new Set(ids).size === ids.length, 'Duplicate IDs are not allowed');
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
  technicianId: canonicalId, startedAt: timestamp, finishedAt: timestamp,
}).strict().refine(ordered, { path: ['finishedAt'], message: 'Finish must be after start' });
export const completeInstallationRequestSchema = z.object({
  expectedVersion: version, startedAt: timestamp, finishedAt: timestamp,
  installedCapacityKw: z.number().int().min(1).max(5),
  photoFileIds: uniqueIds.pipe(z.array(z.uuid()).min(1).max(20)),
  signatureFileId: canonicalId, signerName: z.string().trim().min(2).max(120),
  completedChecks: z.array(installationCheckSchema).min(1).max(6)
    .refine((codes) => new Set(codes).size === codes.length, 'Duplicate checklist codes are not allowed'),
  timeRecords: z.array(installationTimeRecordInputSchema).min(1).max(100),
}).strict().refine(ordered, { path: ['finishedAt'], message: 'Finish must be after start' })
  .refine((value) => !value.photoFileIds.includes(value.signatureFileId), {
    path: ['signatureFileId'], message: 'A roof photograph is not signature evidence',
  }).superRefine((value, ctx) => {
    const start = Date.parse(value.startedAt), finish = Date.parse(value.finishedAt);
    const byTechnician = new Map<string, { start: number; finish: number; index: number }[]>();
    value.timeRecords.forEach((entry, index) => {
      const interval = { start: Date.parse(entry.startedAt), finish: Date.parse(entry.finishedAt), index };
      if (interval.start < start || interval.finish > finish) {
        ctx.addIssue({ code: 'custom', path: ['timeRecords', index], message: 'Time record must fall within the installation interval' });
      }
      const entries = byTechnician.get(entry.technicianId) ?? [];
      entries.push(interval); byTechnician.set(entry.technicianId, entries);
    });
    for (const entries of byTechnician.values()) {
      entries.sort((a, b) => a.start - b.start);
      let previousFinish = -Infinity;
      for (const entry of entries) {
        if (entry.start < previousFinish) ctx.addIssue({
          code: 'custom', path: ['timeRecords', entry.index], message: 'Time records for one technician must not overlap',
        });
        previousFinish = Math.max(previousFinish, entry.finish);
      }
    }
  });
// The service checks serverNow, assigned staff, matching accepted capacity/package,
// persisted private files, required checks and authorized actors inside its transaction.
// Clock/date policy is not evaluated by a transport schema at module import time.
export const jobViewSchema = z.object({
  id: z.uuid(), orderId: z.uuid(), customerId: z.uuid(), status: installationStatusSchema, version,
  scheduledStart: timestamp.nullable(), scheduledFinish: timestamp.nullable(),
  technicianIds: uniqueIds, startedAt: timestamp.nullable(), finishedAt: timestamp.nullable(),
  installedCapacityKw: z.number().int().min(1).max(5).nullable(),
  photoFileIds: uniqueIds, signatureFileId: z.uuid().nullable(), signerName: z.string().nullable(),
  completedChecks: z.array(installationCheckSchema),
  timeRecords: z.array(z.object({ id: z.uuid(), technicianId: z.uuid(), startedAt: timestamp, finishedAt: timestamp })),
});
export const jobResponseSchema = z.object({ data: jobViewSchema });
export const jobListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export const jobListResponseSchema = z.object({ data: z.object({
  items: z.array(jobViewSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.number().int().positive(),
}) });
export type JobListQuery = z.infer<typeof jobListQuerySchema>;
export type ScheduleJobRequest = z.infer<typeof scheduleJobRequestSchema>;
export type CompleteInstallationRequest = z.infer<typeof completeInstallationRequestSchema>;
export type InstallationTimeRecordInput = z.infer<typeof installationTimeRecordInputSchema>;

export type StartInstallationRequest = z.infer<typeof startInstallationRequestSchema>;
export type JobView = z.infer<typeof jobViewSchema>;
