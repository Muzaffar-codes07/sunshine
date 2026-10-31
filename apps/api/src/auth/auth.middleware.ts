import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../platform/api-error';
import { AuthRuntime } from './auth.runtime';
import './auth.types';

export function assertTrustedMutationOrigin(request: Request, origins: readonly string[]): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const path = request.originalUrl.split('?')[0] ?? '';
  const publicEnquiry = request.method === 'POST' && /^\/api\/v1\/enquiries\/?$/i.test(path);
  if (publicEnquiry && !request.session?.staffUserId) return;
  const origin = request.headers.origin;
  if (origin !== undefined) {
    if (typeof origin === 'string' && origins.includes(origin)) return;
  } else {
    const referer = request.headers.referer;
    if (typeof referer === 'string') {
      try {
        const url = new URL(referer);
        if (!url.username && !url.password && origins.includes(url.origin)) return;
      } catch { /* Invalid or absent provenance fails closed. */ }
    }
  }
  throw new ApiError(403, 'CSRF_REJECTED', 'This action must come from the configured Sunshine app');
}
@Injectable()
export class AuthSessionMiddleware implements NestMiddleware {
  constructor(private readonly runtime: AuthRuntime) {}
  use(request: Request, response: Response, next: NextFunction) { this.runtime.middleware(request, response, next); }
}
@Injectable()
export class AuthOriginMiddleware implements NestMiddleware {
  constructor(private readonly runtime: AuthRuntime) {}
  use(request: Request, _response: Response, next: NextFunction) {
    try { assertTrustedMutationOrigin(request, this.runtime.origins); next(); } catch (error) { next(error); }
  }
}
