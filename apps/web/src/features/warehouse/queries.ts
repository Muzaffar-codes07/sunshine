import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allocationListResponseSchema, dispatchResponseSchema, jobListResponseSchema, jobResponseSchema, orderFulfilmentResponseSchema,
  productListResponseSchema, stockLevelListResponseSchema, stockLocationListResponseSchema, unitDetailResponseSchema,
} from '@sunshine/contracts';
import type { ZodType } from 'zod';
import { apiGet, apiPost, ApiRequestError, newIdempotencyKey } from '../../lib/api';

const root = ['warehouse'] as const;
export const warehouseKeys = {
  levels: (page: number) => [...root, 'levels', page] as const,
  locations: [...root, 'locations'] as const,
  products: [...root, 'products'] as const,
  jobs: (page: number) => [...root, 'jobs', page] as const,
  fulfilment: (id: string) => [...root, 'order', id, 'fulfilment'] as const,
  job: (id: string) => [...root, 'job', id] as const,
  allocations: (id: string) => [...root, 'order', id, 'allocations'] as const,
  dispatch: (id: string) => [...root, 'order', id, 'dispatch'] as const,
  unit: (id: string) => [...root, 'unit', id] as const,
};

export const useStockLevels = (page: number) => useQuery({ queryKey: warehouseKeys.levels(page), queryFn: ({ signal }) => apiGet(`/stock?pageSize=25&page=${page}`, stockLevelListResponseSchema, signal) });
export const useLocations = () => useQuery({ queryKey: warehouseKeys.locations, staleTime: 60_000, queryFn: ({ signal }) => apiGet('/stock/locations', stockLocationListResponseSchema, signal) });
export const useHardware = () => useQuery({ queryKey: warehouseKeys.products, staleTime: 60_000, queryFn: ({ signal }) => apiGet('/products?kind=HARDWARE&pageSize=100', productListResponseSchema, signal) });
export const useJobs = (page: number) => useQuery({ queryKey: warehouseKeys.jobs(page), queryFn: ({ signal }) => apiGet(`/jobs?pageSize=25&page=${page}`, jobListResponseSchema, signal) });
export const useFulfilment = (id: string) => useQuery({ queryKey: warehouseKeys.fulfilment(id), queryFn: ({ signal }) => apiGet(`/orders/${id}/fulfilment`, orderFulfilmentResponseSchema, signal) });
export const useJob = (id: string | null | undefined) => useQuery({ queryKey: warehouseKeys.job(id ?? ''), enabled: !!id, queryFn: ({ signal }) => apiGet(`/jobs/${id}`, jobResponseSchema, signal) });
export const useAllocations = (id: string) => useQuery({ queryKey: warehouseKeys.allocations(id), queryFn: ({ signal }) => apiGet(`/orders/${id}/allocations`, allocationListResponseSchema, signal) });
export const useUnit = (id: string | null) => useQuery({ queryKey: warehouseKeys.unit(id ?? ''), enabled: !!id, staleTime: 60_000, queryFn: ({ signal }) => apiGet(`/units/${id}`, unitDetailResponseSchema, signal) });
/** A draft is optional, so "none yet" is an answer here and not an error. */
export const useDispatch = (id: string) => useQuery({
  queryKey: warehouseKeys.dispatch(id),
  queryFn: async ({ signal }) => {
    try { return await apiGet(`/orders/${id}/dispatch`, dispatchResponseSchema, signal); }
    catch (error) { if (error instanceof ApiRequestError && error.status === 404) return null; throw error; }
  },
});

export type Problem = { messages: string[]; fields: Record<string, string> };
export const noProblem: Problem = { messages: [], fields: {} };

/** Lists every reason a command was refused, so the warehouse can fix them all in one go. */
export function describeFailure(error: unknown): Problem {
  if (!(error instanceof ApiRequestError)) return { messages: [error instanceof Error ? error.message : 'Something went wrong. Try again.'], fields: {} };
  if (error.reasons.length) return { messages: error.reasons.map((reason) => `${reason.reason} ${reason.nextAction}`), fields: {} };
  const fields = Object.fromEntries(Object.entries(error.fieldErrors).map(([name, messages]) => [name.split('.').pop()!, messages[0] ?? 'Check this field']));
  return { messages: [Object.keys(fields).length ? 'Check the highlighted fields and try again.' : error.message], fields };
}

/** Checks input against the shared contract. Errors land on the field they name, in plain words where `messages` has them. */
export function checkInput<T>(schema: ZodType<T>, input: unknown, messages: Record<string, string> = {}): { data: T } | { problem: Problem } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { data: parsed.data };
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const name = [...issue.path].reverse().find((part) => typeof part === 'string');
    const field = String(name ?? 'form');
    fields[field] ??= messages[field] ?? issue.message;
  }
  return { problem: { messages: ['Check the highlighted fields and try again.'], fields } };
}

type Intent = { path: string; body: unknown; key: string };

/**
 * Posts a stock command. If the response is lost, the same key and body are kept for the retry,
 * so the warehouse can never receive, reserve or scan the same thing twice.
 */
export function useStockCommand<T>(schema: ZodType<T>, onDone?: (result: T) => void) {
  const client = useQueryClient();
  const intent = useRef<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [problem, setProblem] = useState<Problem>(noProblem);

  async function send(saved: Intent) {
    setBusy(true); setProblem(noProblem);
    try {
      const result = await apiPost(saved.path, schema, saved.body, { idempotencyKey: saved.key });
      intent.current = null; setUncertain(false);
      onDone?.(result);
      await client.invalidateQueries({ queryKey: root });
    } catch (error) {
      const definitive = error instanceof ApiRequestError && error.status >= 400 && error.status < 500;
      if (definitive) intent.current = null;
      setUncertain(!definitive); setProblem(describeFailure(error));
    } finally { setBusy(false); }
  }

  return {
    busy, uncertain, problem, setProblem,
    run(path: string, body: unknown) {
      if (busy || uncertain) return;
      const saved = { path, body, key: newIdempotencyKey() };
      intent.current = saved; void send(saved);
    },
    retry() { if (intent.current && !busy) void send(intent.current); },
  };
}
