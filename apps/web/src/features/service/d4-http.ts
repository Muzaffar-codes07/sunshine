import { apiErrorSchema, type RefusalReason } from '@sunshine/contracts';
import type { ZodType } from 'zod';

// Feature-local until D1 incorporates refusal reasons in the shared API client.
export class D4RequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string,
    readonly fieldErrors: Record<string, string[]> = {}, readonly reasons: RefusalReason[] = [],
    readonly requestId?: string) {
    super(message);
    this.name = 'D4RequestError';
  }
}

export async function requireSuccess(response: Response): Promise<void> {
  if (response.ok) return;
  const body: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    const error = parsed.data.error;
    throw new D4RequestError(error.message, response.status, error.code, error.fieldErrors, error.reasons ?? [], error.requestId);
  }
  throw new D4RequestError(`Request failed (${response.status}).`, response.status, 'UNKNOWN_ERROR');
}

export async function d4Fetch(path: string, options: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { ...options, credentials: 'same-origin', cache: 'no-store' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new D4RequestError('Cannot reach the server. Check your connection.', 0, 'NETWORK_ERROR');
  }
  await requireSuccess(response);
  return response;
}

export async function d4Json<T>(path: string, schema: ZodType<T>, options: RequestInit = {}): Promise<T> {
  const response = await d4Fetch(path, { ...options, headers: { Accept: 'application/json', ...options.headers } });
  const body: unknown = await response.json().catch(() => null);
  const result = schema.safeParse(body);
  if (!result.success) throw new D4RequestError('The server response could not be verified.', response.status, 'CONTRACT_MISMATCH');
  return result.data;
}

export function describeD4Error(error: unknown): string {
  if (!(error instanceof D4RequestError)) return error instanceof Error ? error.message : 'The request failed.';
  const hint = error.status === 401 ? 'Sign in again to continue.'
    : error.status === 403 ? 'Your account does not have access to this action.'
      : error.status === 503 ? 'This feature is temporarily unavailable. Try again later.' : '';
  return [error.message, hint, ...error.reasons.map((reason) => `${reason.reason} Next: ${reason.nextAction}`)].filter(Boolean).join(' ');
}
