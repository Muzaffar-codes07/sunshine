import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

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
      code: status === 503 ? 'SERVICE_UNAVAILABLE' : status === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED',
      message, fieldErrors: {}, requestId,
    } });
  }
}
