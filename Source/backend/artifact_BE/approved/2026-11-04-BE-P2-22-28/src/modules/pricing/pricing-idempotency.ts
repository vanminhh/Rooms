import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.js';

// API-05 and Q-P5-6: the same (actor, route, key) replays the first result for 24 hours.
const KEY_MAX_LENGTH = 255;
const TTL_MS = 24 * 3600_000;

export function parseIdempotencyKey(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  // [ASSUMPTION] length 1..255 is not in the spec; the column is VARCHAR(255).
  if (raw.length === 0 || raw.length > KEY_MAX_LENGTH) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      fields: { idempotencyKey: 'Idempotency-Key phải có từ 1 đến 255 ký tự' },
    });
  }
  return raw;
}

// SHA-256 of the normalized payload. Callers build it in a fixed key order and include path params.
export function hashRequest(payload: object): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export interface IdempotencyScope {
  actorId: number;
  route: string; // method + path template, e.g. 'POST /room-prices/:id/approve'
  key: string | undefined;
  statusCode: number;
}

// Runs inside the caller's transaction. No key: just run. Same key and payload: replay the stored response.
// Same key, other payload: 409. Errors are not stored, so a failed request can be retried.
export async function runIdempotent<T extends object>(
  tx: Prisma.TransactionClient,
  scope: IdempotencyScope,
  requestHash: string,
  run: () => Promise<T>,
): Promise<T> {
  const key = scope.key;
  if (key === undefined) return run();
  const now = new Date();
  // Serializes identical requests: the second one waits here, then sees the first one's committed row.
  await tx.$queryRaw<Array<{ lock: string }>>`SELECT pg_advisory_xact_lock(hashtext(${`${scope.actorId}|${scope.route}|${key}`}))::text AS lock`;
  const where = { actorId_route_key: { actorId: scope.actorId, route: scope.route, key } };
  const stored = await tx.pricingIdempotencyKey.findUnique({ where });
  if (stored && stored.expiresAt >= now) {
    if (stored.requestHash !== requestHash) throw new ConflictException(ErrorCode.CONFLICT_STATE);
    return stored.responseJson as unknown as T;
  }
  // An expired row counts as missing (API-05): replace it in this transaction.
  if (stored) await tx.pricingIdempotencyKey.delete({ where });
  const result = await run();
  await tx.pricingIdempotencyKey.create({
    data: {
      actorId: scope.actorId,
      route: scope.route,
      key,
      requestHash,
      statusCode: scope.statusCode,
      responseJson: result as unknown as Prisma.InputJsonValue,
      expiresAt: new Date(now.getTime() + TTL_MS),
    },
  });
  return result;
}
