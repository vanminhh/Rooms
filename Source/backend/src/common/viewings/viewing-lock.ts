import type { Prisma } from '@prisma/client';

// VIEW-16/22: mapping lock first, then viewing/account/phone/responsible/building keys.
// Mapping writers take the exclusive lock before any building/user row lock.
export async function lockViewingMapping(tx: Prisma.TransactionClient, exclusive = false): Promise<void> {
  if (exclusive) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('viewing-responsibility-map'))::text AS lock`;
  } else {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtext('viewing-responsibility-map'))::text AS lock`;
  }
}

export async function lockViewingKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`viewing:${key}`}))::text AS lock`;
}
