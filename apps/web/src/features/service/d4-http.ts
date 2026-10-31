import { apiErrorSchema } from '@sunshine/contracts';
import { ApiRequestError } from '../../lib/api';
export { ApiRequestError as D4RequestError } from '../../lib/api';

export async function requireSuccess(response: Response): Promise<void> {
  if (response.ok) return;
  const body: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    const error = parsed.data.error;
    throw new ApiRequestError(error.message, response.status, error.code, error.fieldErrors, error.requestId, error.reasons ?? []);
  }
  throw new ApiRequestError(`Request failed (${response.status}).`, response.status, 'UNKNOWN_ERROR');
}

export async function d4Fetch(path: string, options: RequestInit = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { ...options, credentials: 'same-origin', cache: 'no-store' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiRequestError('Cannot reach the server. Check your connection.', 0, 'NETWORK_ERROR');
  }
  await requireSuccess(response);
  return response;
}

export function describeD4Error(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return error instanceof Error ? error.message : 'The request failed.';
  const hint = error.status === 401 ? 'Sign in again to continue.'
    : error.status === 403 ? 'Your account does not have access to this action.'
      : error.status === 503 ? 'This feature is temporarily unavailable. Try again later.' : '';
  return [error.message, hint, ...error.reasons.map((reason) => `${reason.reason} Next: ${reason.nextAction}`)].filter(Boolean).join(' ');
}
