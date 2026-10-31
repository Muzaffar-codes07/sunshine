import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from './api-error';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

/**
 * Fixed-window per-IP limit for unauthenticated public forms (TRD section 8).
 * In-memory is enough for one local application process; it resets on restart.
 */
@Injectable()
export class PublicFormRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { windowStart: number; count: number }>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= WINDOW_MS) {
      this.hits.set(key, { windowStart: now, count: 1 });
      this.prune(now);
      return true;
    }
    if (entry.count >= MAX_REQUESTS) {
      throw new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Too many submissions. Please wait a minute and try again.');
    }
    entry.count += 1;
    return true;
  }

  private prune(now: number) {
    if (this.hits.size < 1_000) return;
    for (const [key, entry] of this.hits) {
      if (now - entry.windowStart >= WINDOW_MS) this.hits.delete(key);
    }
  }
}
