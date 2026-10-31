import { HttpException, HttpStatus } from '@nestjs/common';
import type { RefusalReason } from '@sunshine/contracts';

export type FieldErrors = Record<string, string[]>;

/** Error with a stable machine code, per-field messages and refusal reasons, rendered by ApiExceptionFilter. */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: FieldErrors = {},
    readonly reasons: RefusalReason[] = [],
  ) {
    super(message, status);
  }
}

/**
 * 409 for a command that cannot run yet, with the shared reason contract (TRD decision M3). One reason keeps its
 * own code; several (a readiness check with more than one gap) use NOT_READY and list every reason.
 */
export function refusal(...reasons: [RefusalReason, ...RefusalReason[]]): ApiError {
  const [first] = reasons;
  return reasons.length === 1
    ? new ApiError(HttpStatus.CONFLICT, first.code, first.reason, {}, reasons)
    : new ApiError(HttpStatus.CONFLICT, 'NOT_READY', `${reasons.length} checks are not met yet.`, {}, reasons);
}
