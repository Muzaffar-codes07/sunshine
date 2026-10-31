import { apiErrorSchema, type RefusalReason } from '@sunshine/contracts';
import type { ZodType } from 'zod';

/** Structured failure from the API (or from reaching it). Carries what the UI needs to point at the problem. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string[]>;
  readonly requestId: string | undefined;
  /** Why a 409 refusal happened and what to do next; empty for other errors. */
  readonly reasons: RefusalReason[];

  constructor(message: string, status: number, code: string, fieldErrors: Record<string, string[]> = {}, requestId?: string, reasons: RefusalReason[] = []) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.requestId = requestId;
    this.reasons = reasons;
  }
}

type RequestOptions = { body?: unknown; signal?: AbortSignal; idempotencyKey?: string };

async function request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      signal: options.signal,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiRequestError('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK_ERROR');
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { message, code, fieldErrors, requestId, reasons } = parsed.data.error;
      throw new ApiRequestError(message, response.status, code, fieldErrors, requestId, reasons ?? []);
    }
    throw new ApiRequestError(`Request failed (${response.status})`, response.status, 'UNKNOWN_ERROR');
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiRequestError('The server sent a response this app does not understand.', response.status, 'CONTRACT_MISMATCH');
  }
  return result.data;
}

export const apiGet = <T,>(path: string, schema: ZodType<T>, signal?: AbortSignal) => request('GET', path, schema, { signal });
export const apiPost = <T,>(path: string, schema: ZodType<T>, body?: unknown, options: Omit<RequestOptions, 'body'> = {}) =>
  request('POST', path, schema, { ...options, body: body ?? {} });
export const apiPatch = <T,>(path: string, schema: ZodType<T>, body: unknown, options: Omit<RequestOptions, 'body'> = {}) =>
  request('PATCH', path, schema, { ...options, body });

/** Key for a command the user submits once; reuse the same key when retrying that same submit. */
export const newIdempotencyKey = () => crypto.randomUUID();