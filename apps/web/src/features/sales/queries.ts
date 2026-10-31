import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  enquiryDetailResponseSchema, enquiryListResponseSchema, projectSummaryResponseSchema, staffDirectoryResponseSchema,
  surveyListResponseSchema, type StaffRole,
} from '@sunshine/contracts';
import type { ZodType } from 'zod';
import { apiGet, apiPost, ApiRequestError } from '../../lib/api';

export const salesKeys = {
  queue: ['enquiries'] as const,
  enquiry: (id: string) => ['enquiry', id] as const,
  staff: (role?: StaffRole) => ['staff', role ?? 'ALL'] as const,
  assigned: ['surveys', 'assigned'] as const,
};

export const useEnquiries = (status: string, page: number) => useQuery({
  queryKey: [...salesKeys.queue, status, page],
  queryFn: ({ signal }) => apiGet(`/enquiries?${new URLSearchParams({ ...(status && { status }), page: String(page) })}`, enquiryListResponseSchema, signal),
});
export const useEnquiry = (id: string) => useQuery({
  queryKey: salesKeys.enquiry(id), queryFn: ({ signal }) => apiGet(`/enquiries/${id}`, enquiryDetailResponseSchema, signal),
});
export const useProjectSummary = (id: string) => useQuery({
  queryKey: [...salesKeys.enquiry(id), 'summary'], queryFn: ({ signal }) => apiGet(`/enquiries/${id}/summary`, projectSummaryResponseSchema, signal),
});
export const useEnquirySurveys = (id: string) => useQuery({
  queryKey: [...salesKeys.enquiry(id), 'surveys'], queryFn: ({ signal }) => apiGet(`/enquiries/${id}/surveys`, surveyListResponseSchema, signal),
});
export const useAssignedSurveys = () => useQuery({
  queryKey: salesKeys.assigned, queryFn: ({ signal }) => apiGet('/surveys/assigned', surveyListResponseSchema, signal),
});
export const useStaff = (role?: StaffRole) => useQuery({
  queryKey: salesKeys.staff(role), staleTime: 60_000,
  queryFn: ({ signal }) => apiGet(`/staff${role ? `?role=${role}` : ''}`, staffDirectoryResponseSchema, signal),
});

/** Posts a version-checked command, then refreshes everything shown about that enquiry and the queue. */
export function useSalesCommand<T>(enquiryId: string | undefined, schema: ZodType<T>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => apiPost(path, schema, body),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: salesKeys.queue }),
        client.invalidateQueries({ queryKey: salesKeys.assigned }),
        enquiryId && client.invalidateQueries({ queryKey: salesKeys.enquiry(enquiryId) }),
      ]);
    },
  });
}

export type Problem = { message: string; fields: Record<string, string[]> };

/** What to tell the user: a refusal's reason and next step, a stale-version hint, or the fields to fix. */
export function describeProblem(error: unknown): Problem {
  if (error instanceof ApiRequestError) {
    const [reason] = error.reasons;
    if (reason) return { message: `${reason.reason} ${reason.nextAction}`, fields: {} };
    if (error.status === 400 && Object.keys(error.fieldErrors).length) return { message: 'Check the highlighted fields and try again.', fields: error.fieldErrors };
    return { message: error.message, fields: {} };
  }
  return { message: error instanceof Error ? error.message : 'Something went wrong. Try again.', fields: {} };
}

/** Validates form input with the shared contract before sending, so the user sees field errors without a round trip. */
export function validate<T>(schema: ZodType<T>, input: unknown): { data: T } | { problem: Problem } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { data: parsed.data };
  const fields: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) (fields[String(issue.path[0] ?? 'form')] ??= []).push(issue.message);
  return { problem: { message: 'Check the highlighted fields and try again.', fields } };
}

/** `<input type="datetime-local">` value as an ISO instant, or '' when empty. */
export const localToIso = (value: FormDataEntryValue | null) => (typeof value === 'string' && value ? new Date(value).toISOString() : '');
export const formatWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const humanize = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
