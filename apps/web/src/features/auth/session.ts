import { useQuery } from '@tanstack/react-query';
import { staffSessionResponseSchema } from '@sunshine/contracts';
import { apiGet, ApiRequestError } from '../../lib/api';

export const sessionKey = ['staff-session'] as const;

export function useStaffSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: async ({ signal }) => {
      try { return (await apiGet('/auth/me', staffSessionResponseSchema, signal)).data; }
      catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
