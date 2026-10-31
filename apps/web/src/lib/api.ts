import { apiErrorSchema } from '@sunshine/contracts';
import type { ZodType } from 'zod';

export async function apiGet<T>(path: string, schema: ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { credentials: 'same-origin', signal });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(body);
    throw new Error(error.success ? error.data.error.message : `Request failed (${response.status})`);
  }
  return schema.parse(body);
}
