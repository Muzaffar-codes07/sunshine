import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  productListResponseSchema,
  stockAsOfResponseSchema,
  stockIntegrityResponseSchema,
  stockLevelListResponseSchema,
  stockLocationListResponseSchema,
  stockMovementListResponseSchema,
  stockReceiptResponseSchema,
  stockValueResponseSchema,
  unitLookupResponseSchema,
  type ReceiveStockRequest,
} from '@sunshine/contracts';
import { apiGet, apiPost, ApiRequestError, newIdempotencyKey } from '../../lib/api';

export const warehouseKeys = {
  all: ['warehouse'] as const,
  locations: ['warehouse', 'locations'] as const,
  levels: (params?: Record<string, string | number>) => ['warehouse', 'stock-levels', params] as const,
  asOf: (params?: Record<string, string | number>) => ['warehouse', 'stock-as-of', params] as const,
  movements: (params?: Record<string, string | number>) => ['warehouse', 'movements', params] as const,
  integrity: ['warehouse', 'integrity'] as const,
  value: (params?: Record<string, string | number>) => ['warehouse', 'value', params] as const,
  unitLookup: (serial: string) => ['warehouse', 'units', serial] as const,
  products: ['warehouse', 'products'] as const,
};

export const useStockLocations = () =>
  useQuery({
    queryKey: warehouseKeys.locations,
    queryFn: ({ signal }) => apiGet('/stock/locations', stockLocationListResponseSchema, signal),
  });

export const useStockLevels = (params: {
  locationId?: string;
  productId?: string;
  page?: number;
  pageSize?: number;
}) =>
  useQuery({
    queryKey: warehouseKeys.levels(params),
    queryFn: ({ signal }) => {
      const search = new URLSearchParams();
      if (params.locationId) search.set('locationId', params.locationId);
      if (params.productId) search.set('productId', params.productId);
      if (params.page) search.set('page', String(params.page));
      if (params.pageSize) search.set('pageSize', String(params.pageSize));
      const query = search.toString();
      return apiGet(`/stock${query ? `?${query}` : ''}`, stockLevelListResponseSchema, signal);
    },
  });

export const useStockAsOf = (params: {
  at?: string;
  locationId?: string;
  productId?: string;
  page?: number;
  pageSize?: number;
}) =>
  useQuery({
    queryKey: warehouseKeys.asOf(params),
    enabled: Boolean(params.at),
    queryFn: ({ signal }) => {
      const search = new URLSearchParams();
      if (params.at) search.set('at', params.at);
      if (params.locationId) search.set('locationId', params.locationId);
      if (params.productId) search.set('productId', params.productId);
      if (params.page) search.set('page', String(params.page));
      if (params.pageSize) search.set('pageSize', String(params.pageSize));
      return apiGet(`/stock/as-of?${search.toString()}`, stockAsOfResponseSchema, signal);
    },
  });

export const useStockMovements = (params: {
  locationId?: string;
  productId?: string;
  kind?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) =>
  useQuery({
    queryKey: warehouseKeys.movements(params),
    queryFn: ({ signal }) => {
      const search = new URLSearchParams();
      if (params.locationId) search.set('locationId', params.locationId);
      if (params.productId) search.set('productId', params.productId);
      if (params.kind) search.set('kind', params.kind);
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      if (params.page) search.set('page', String(params.page));
      if (params.pageSize) search.set('pageSize', String(params.pageSize));
      const query = search.toString();
      return apiGet(`/stock/movements${query ? `?${query}` : ''}`, stockMovementListResponseSchema, signal);
    },
  });

export const useStockIntegrity = () =>
  useQuery({
    queryKey: warehouseKeys.integrity,
    queryFn: ({ signal }) => apiGet('/stock/integrity', stockIntegrityResponseSchema, signal),
  });

export const useStockValue = (params: {
  productId?: string;
  page?: number;
  pageSize?: number;
} = {}) =>
  useQuery({
    queryKey: warehouseKeys.value(params),
    queryFn: ({ signal }) => {
      const search = new URLSearchParams();
      if (params.productId) search.set('productId', params.productId);
      if (params.page) search.set('page', String(params.page));
      if (params.pageSize) search.set('pageSize', String(params.pageSize));
      const query = search.toString();
      return apiGet(`/stock/value${query ? `?${query}` : ''}`, stockValueResponseSchema, signal);
    },
  });

export const useUnitLookup = (serial: string) =>
  useQuery({
    queryKey: warehouseKeys.unitLookup(serial),
    enabled: Boolean(serial.trim()),
    queryFn: ({ signal }) => {
      const search = new URLSearchParams({ serial: serial.trim() });
      return apiGet(`/units?${search.toString()}`, unitLookupResponseSchema, signal);
    },
  });

export const useCatalogueProducts = () =>
  useQuery({
    queryKey: warehouseKeys.products,
    queryFn: ({ signal }) => apiGet('/products?active=true&pageSize=100', productListResponseSchema, signal),
  });

export function useReceiveStock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ReceiveStockRequest) =>
      apiPost('/stock/receipts', stockReceiptResponseSchema, body, {
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['warehouse', 'stock-levels'] }),
        client.invalidateQueries({ queryKey: ['warehouse', 'movements'] }),
        client.invalidateQueries({ queryKey: ['warehouse', 'integrity'] }),
        client.invalidateQueries({ queryKey: ['warehouse', 'value'] }),
      ]);
    },
  });
}

export type Problem = { message: string; fields: Record<string, string[]> };

export function describeProblem(error: unknown): Problem {
  if (error instanceof ApiRequestError) {
    const [reason] = error.reasons;
    if (reason) return { message: `${reason.reason} ${reason.nextAction}`, fields: {} };
    if (error.status === 400 && Object.keys(error.fieldErrors).length) {
      return { message: 'Check the highlighted fields and try again.', fields: error.fieldErrors };
    }
    return { message: error.message, fields: {} };
  }
  return { message: error instanceof Error ? error.message : 'Something went wrong. Try again.', fields: {} };
}
