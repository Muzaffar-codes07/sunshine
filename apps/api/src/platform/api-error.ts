import { HttpException } from '@nestjs/common';

export type FieldErrors = Record<string, string[]>;

/** Error with a stable machine code and per-field messages, rendered by ApiExceptionFilter. */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: FieldErrors = {},
  ) {
    super(message, status);
  }
}
