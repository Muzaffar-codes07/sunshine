import { useQuery } from '@tanstack/react-query';
import { jobListResponseSchema, jobResponseSchema, storedFileResponseSchema, type JobView } from '@sunshine/contracts';
import { z } from 'zod';
import { apiGet, apiUpload } from '../../lib/api';

export const fieldRoot = ['field'] as const;
const assignedResponseSchema = z.object({ data: z.array(jobResponseSchema.shape.data) });

const JOB_PAGE_LIMIT = 20;
/** A technician's own work; an ADMIN sees every job, across as many pages as that takes. */
export const useFieldJobs = (assignedOnly: boolean) => useQuery({
  queryKey: [...fieldRoot, 'jobs', assignedOnly],
  queryFn: async ({ signal }): Promise<JobView[]> => {
    if (assignedOnly) return (await apiGet('/jobs/assigned', assignedResponseSchema, signal)).data;
    const items: JobView[] = [];
    for (let page = 1; page <= JOB_PAGE_LIMIT; page += 1) {
      const { data } = await apiGet(`/jobs?pageSize=100&page=${page}`, jobListResponseSchema, signal);
      items.push(...data.items);
      if (items.length >= data.total || !data.items.length) break;
    }
    return items;
  },
});
export const useFieldJob = (id: string) => useQuery({ queryKey: [...fieldRoot, 'job', id], queryFn: ({ signal }) => apiGet(`/jobs/${id}`, jobResponseSchema, signal) });

export async function uploadJobFile(jobId: string, file: Blob, name: string) {
  const form = new FormData();
  form.append('contextType', 'JOB'); form.append('contextId', jobId); form.append('file', file, name);
  return (await apiUpload('/files', storedFileResponseSchema, form)).data;
}

export type Evidence = { photos: { id: string; name: string }[]; signatureId: string | null };
const storageKey = (jobId: string) => `job-evidence:${jobId}`;
const evidenceSchema = z.object({ photos: z.array(z.object({ id: z.uuid(), name: z.string() })), signatureId: z.uuid().nullable() });

/** A page refresh shouldn't make the crew upload again. Losing this only leaves an unused file bound to the job. */
export function loadEvidence(jobId: string): Evidence {
  try {
    const parsed = evidenceSchema.safeParse(JSON.parse(sessionStorage.getItem(storageKey(jobId)) ?? 'null'));
    if (parsed.success) return parsed.data;
  } catch { /* Storage can be blocked; start empty. */ }
  return { photos: [], signatureId: null };
}
export function saveEvidence(jobId: string, evidence: Evidence | null) {
  try {
    if (evidence) sessionStorage.setItem(storageKey(jobId), JSON.stringify(evidence));
    else sessionStorage.removeItem(storageKey(jobId));
  } catch { /* Only a convenience. */ }
}
