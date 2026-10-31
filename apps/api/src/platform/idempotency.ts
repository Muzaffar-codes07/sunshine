import { createParamDecorator, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { IDEMPOTENCY_KEY_HEADER, idempotencyKeySchema } from '@sunshine/contracts';
import { ApiError, refusal } from './api-error';
import { PrismaService } from './prisma.service';
import type { Prisma } from '../generated/prisma/client';

const KEY_CONSTRAINT = 'commands_actorId_idempotencyKey_key';

export interface IdempotentCommand {
  actorId: string;
  key: string;
  /** UPPER_SNAKE_CASE business action, such as ORDER_CONFIRM. */
  action: string;
  /** The validated request body (and route IDs), hashed to detect a key reused for a different request. */
  payload: unknown;
}

/**
 * Runs a money or stock command at most once per actor and Idempotency-Key (TRD decision M6).
 *
 * The key is claimed first, inside the same transaction as the business effect, and the result is saved before
 * commit. A concurrent duplicate blocks on the unique key until the first commits, then replays its result; if the
 * first rolls back, the duplicate runs instead. `work` must return the JSON response body, because that is what a
 * retry receives.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(command: IdempotentCommand, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const payloadHash = hashPayload(command.payload);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const claim = await tx.command.create({
          data: { actorId: command.actorId, idempotencyKey: command.key, action: command.action, payloadHash },
          select: { id: true },
        });
        const result = await work(tx);
        await tx.command.update({ where: { id: claim.id }, data: { result: result as Prisma.InputJsonValue } });
        return result;
      });
    } catch (error) {
      if (!isKeyTaken(error)) throw error;
    }
    const recorded = await this.prisma.command.findUnique({
      where: { actorId_idempotencyKey: { actorId: command.actorId, idempotencyKey: command.key } },
    });
    if (!recorded || recorded.action !== command.action || recorded.payloadHash !== payloadHash) {
      throw refusal({
        code: 'IDEMPOTENCY_CONFLICT', reason: 'This Idempotency-Key was already used for a different request.', source: 'PLATFORM',
        nextAction: 'Send a new Idempotency-Key for a new action; reuse a key only to retry the same request.',
      });
    }
    return recorded.result as T;
  }
}

/** SHA-256 of the payload as JSON with object keys sorted, so key order does not change the hash. */
export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortKeys(payload)) ?? 'undefined').digest('hex');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function isKeyTaken(error: unknown): boolean {
  const cause = (error as { code?: unknown; meta?: { driverAdapterError?: { cause?: { constraint?: { index?: unknown } } } } } | null);
  return cause?.code === 'P2002' && cause.meta?.driverAdapterError?.cause?.constraint?.index === KEY_CONSTRAINT;
}

/** Reads and validates the Idempotency-Key header; a missing or malformed key is a 400 before any work starts. */
export function readIdempotencyKey(request: Pick<Request, 'header'>): string {
  const parsed = idempotencyKeySchema.safeParse(request.header(IDEMPOTENCY_KEY_HEADER));
  if (!parsed.success) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', {
      [IDEMPOTENCY_KEY_HEADER]: parsed.error.issues.map((issue) => issue.message),
    });
  }
  return parsed.data;
}

/** `@IdempotencyKey() key: string` on a controller method that must run at most once per key. */
export const IdempotencyKey = createParamDecorator((_: unknown, context: ExecutionContext) =>
  readIdempotencyKey(context.switchToHttp().getRequest<Request>()));
