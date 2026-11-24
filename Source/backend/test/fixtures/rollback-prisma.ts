import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/common/prisma/prisma.service.js';

// BE-P3-19: route transactions use savepoints on one real outer transaction.
// This deliberately cannot emulate transaction isolation or concurrent connections.
export function rollbackPrismaFacade(tx: Prisma.TransactionClient, isolationLevel?: Prisma.TransactionIsolationLevel): PrismaService {
  let active = false;
  let nextSavepoint = 0;
  const noOp = async () => {};
  const blocked = new Set(['$connect', '$extends', '$on', '$use']);

  async function transaction(work: unknown, ...options: unknown[]): Promise<unknown> {
    if (typeof work !== 'function') {
      throw new TypeError('Rollback Prisma accepts only callback transactions');
    }
    const opts = options[0];
    const inheritsIsolation = isolationLevel && options.length === 1 && typeof opts === 'object' && opts !== null
      && Object.keys(opts).length === 1 && 'isolationLevel' in opts && opts.isolationLevel === isolationLevel;
    if (options.length !== 0 && !inheritsIsolation) {
      throw new TypeError('Rollback Prisma cannot emulate transaction options');
    }
    if (active) {
      throw new Error('Rollback Prisma requires sequential, non-nested transactions');
    }

    active = true;
    // Only a fixed prefix and a local integer enter SQL; never interpolate request data.
    const savepoint = `rooms_e2e_route_${++nextSavepoint}`;
    try {
      await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
      try {
        const result: unknown = await work(tx);
        await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        const cleanupErrors: unknown[] = [];
        for (const sql of [`ROLLBACK TO SAVEPOINT ${savepoint}`, `RELEASE SAVEPOINT ${savepoint}`]) {
          try { await tx.$executeRawUnsafe(sql); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
        }
        if (cleanupErrors.length > 0) {
          throw new AggregateError([error, ...cleanupErrors], 'Could not restore the route savepoint', { cause: error });
        }
        throw error;
      }
    } finally {
      active = false;
    }
  }

  return new Proxy(tx, {
    get(target, property) {
      if (property === '$transaction') return transaction;
      if (property === '$disconnect' || property === 'onModuleDestroy') return noOp;
      if (typeof property === 'string' && blocked.has(property)) {
        return async () => { throw new Error(`Rollback Prisma cannot use ${property}`); };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as PrismaService;
}
