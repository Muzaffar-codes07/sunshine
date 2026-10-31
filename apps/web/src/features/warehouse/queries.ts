import { useQuery } from '@tanstack/react-query';
import {
  allocationListResponseSchema, dispatchResponseSchema, jobListResponseSchema, jobResponseSchema, orderFulfilmentResponseSchema,
  productListResponseSchema, stockLevelListResponseSchema, stockLocationListResponseSchema, unitDetailResponseSchema,
} from '@sunshine/contracts';
import type { ZodType } from 'zod';
import { apiGet, ApiRequestError } from '../../lib/api';
import { useRetrySafeCommand } from '../../lib/command';

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

export { checkInput, describeFailure, noProblem, type Problem } from '../../lib/command';

/** A stock command: retry-safe, and refreshes everything the warehouse shows. */
export const useStockCommand = <T,>(schema: ZodType<T>, onDone?: (result: T) => void) => useRetrySafeCommand(schema, root, onDone);
