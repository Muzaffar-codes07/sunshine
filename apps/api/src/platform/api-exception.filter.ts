import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { ApiError } from './api-error';

const DEFAULT_CODES: Record<number, string> = {
  400: 'INVALID_INPUT',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = randomUUID();
    const message = exception instanceof HttpException ? exception.message : 'An unexpected server error occurred';
    if (status >= 500 && status !== 503) this.logger.error(`Request ${requestId} failed`, exception instanceof Error ? exception.stack : undefined);
    response.status(status).json({ error: {
      code: exception instanceof ApiError ? exception.code : DEFAULT_CODES[status] ?? 'REQUEST_FAILED',
      message,
      fieldErrors: exception instanceof ApiError ? exception.fieldErrors : {},
      requestId,
    } });
  }
}
