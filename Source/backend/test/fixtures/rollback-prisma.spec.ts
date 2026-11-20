import type { Prisma } from '@prisma/client';
import { rollbackPrismaFacade } from './rollback-prisma.js';

// Only the SQL connection edge is replaced. No database or application is opened.
function fixture() {
  const sql: string[] = [];
  const user = { findUnique: vi.fn(async () => ({ id: 1 })) };
  const close = vi.fn(async () => {});
  const connect = vi.fn(async () => {});
  const tx = {
    user,
    $disconnect: close,
    onModuleDestroy: close,
    $connect: connect,
    async $executeRawUnsafe(this: unknown, command: string) {
      if (this !== tx) throw new Error('SQL receiver was lost');
      sql.push(command);
      return 0;
    },
    async $queryRaw(this: unknown, _query: TemplateStringsArray, id: number) {
      if (this !== tx) throw new Error('Query receiver was lost');
      return [{ id }];
    },
  };
  return { tx, sql, user, close, connect, facade: rollbackPrismaFacade(tx as unknown as Prisma.TransactionClient) };
}

describe('BE-P3-19: rollback Prisma route savepoints', () => {
  it('releases a successful route savepoint and passes the original transaction to its callback', async () => {
    const { tx, facade, sql } = fixture();
    const result = { paymentId: 70 };
    await expect(facade.$transaction(async routeTx => {
      expect((routeTx as unknown) === tx).toBe(true);
      await routeTx.$executeRawUnsafe('INSERT fixture payment');
      return result;
    })).resolves.toBe(result);
    expect(sql).toEqual([
      'SAVEPOINT rooms_e2e_route_1', 'INSERT fixture payment', 'RELEASE SAVEPOINT rooms_e2e_route_1',
    ]);
  });

  it('rolls back failed work before releasing and rethrows the exact original error', async () => {
    const { facade, sql } = fixture();
    const failure = new Error('route failed');
    await expect(facade.$transaction(async routeTx => {
      await routeTx.$executeRawUnsafe('INSERT fixture audit');
      throw failure;
    })).rejects.toBe(failure);
    expect(sql).toEqual([
      'SAVEPOINT rooms_e2e_route_1', 'INSERT fixture audit',
      'ROLLBACK TO SAVEPOINT rooms_e2e_route_1', 'RELEASE SAVEPOINT rooms_e2e_route_1',
    ]);
    await expect(facade.$transaction(async () => 'next route')).resolves.toBe('next route');
    expect(sql.slice(-2)).toEqual(['SAVEPOINT rooms_e2e_route_2', 'RELEASE SAVEPOINT rooms_e2e_route_2']);
  });

  it('preserves non-Error thrown values as well', async () => {
    const { facade } = fixture();
    const failure = { code: 'simulated constraint failure' };
    await expect(facade.$transaction(async () => { throw failure; })).rejects.toBe(failure);
  });

  it('keeps recovery failures alongside the original failure and attempts both cleanup commands', async () => {
    const { tx, facade, sql } = fixture();
    const failure = new Error('route failure');
    const recovery = new Error('rollback failure');
    const execute = tx.$executeRawUnsafe.bind(tx);
    tx.$executeRawUnsafe = async command => {
      await execute(command);
      if (command.startsWith('ROLLBACK TO')) throw recovery;
      return 0;
    };
    const thrown = await facade.$transaction(async () => { throw failure; }).catch(error => error as unknown);
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([failure, recovery]);
    expect((thrown as AggregateError).cause).toBe(failure);
    expect(sql).toEqual([
      'SAVEPOINT rooms_e2e_route_1', 'ROLLBACK TO SAVEPOINT rooms_e2e_route_1', 'RELEASE SAVEPOINT rooms_e2e_route_1',
    ]);
  });

  it('does not run work or attempt recovery when creating the savepoint fails', async () => {
    const { tx, facade } = fixture();
    const failure = new Error('connection unavailable');
    const execute = vi.fn(async () => { throw failure; });
    tx.$executeRawUnsafe = execute;
    const work = vi.fn(async () => 'must not run');
    await expect(facade.$transaction(work)).rejects.toBe(failure);
    expect(work).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledExactlyOnceWith('SAVEPOINT rooms_e2e_route_1');
  });

  it('forwards delegates unchanged and binds raw methods to the original transaction', async () => {
    const { facade, user, sql } = fixture();
    expect((facade.user as unknown) === user).toBe(true);
    await expect(facade.user.findUnique({ where: { id: 1 } })).resolves.toEqual({ id: 1 });
    // oxlint-disable-next-line typescript-eslint/unbound-method -- Deliberate extraction verifies the facade binds this.
    const query = facade.$queryRaw;
    await expect(query`SELECT ${7}`).resolves.toEqual([{ id: 7 }]);
    // oxlint-disable-next-line typescript-eslint/unbound-method -- Deliberate extraction verifies the facade binds this.
    const execute = facade.$executeRawUnsafe;
    await execute('SELECT fixture');
    expect(sql).toEqual(['SELECT fixture']);
    expect((facade as unknown as Record<string, unknown>).missingDelegate).toBeUndefined();
  });

  it('never closes or opens the owning connection through the facade', async () => {
    const { facade, close, connect } = fixture();
    await facade.$disconnect();
    await facade.onModuleDestroy();
    await expect(facade.$connect()).rejects.toThrow('cannot use $connect');
    expect(close).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejects array transactions and supplied options without any SQL or callback work', async () => {
    const { facade, sql } = fixture();
    const work = vi.fn(async () => 'must not run');
    await expect(facade.$transaction([])).rejects.toThrow('only callback transactions');
    await expect(facade.$transaction(work, { timeout: 100 })).rejects.toThrow('cannot emulate transaction options');
    await expect(facade.$transaction(work, { isolationLevel: 'RepeatableRead' })).rejects.toThrow('cannot emulate transaction options');
    expect(work).not.toHaveBeenCalled();
    expect(sql).toEqual([]);
  });

  it('rejects overlapping callbacks rather than overlapping savepoint scopes', async () => {
    const { facade, sql } = fixture();
    let release!: () => void;
    let enter!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    const first = facade.$transaction(async () => { enter(); await pending; });
    await entered;
    try {
      await expect(facade.$transaction(async () => {})).rejects.toThrow('sequential, non-nested');
      expect(sql).toEqual(['SAVEPOINT rooms_e2e_route_1']);
    } finally {
      release();
      await first;
    }
    expect(sql).toEqual(['SAVEPOINT rooms_e2e_route_1', 'RELEASE SAVEPOINT rooms_e2e_route_1']);
  });

  it('rejects a nested facade transaction and restores the enclosing route savepoint', async () => {
    const { facade, sql } = fixture();
    await expect(facade.$transaction(async () => facade.$transaction(async () => {})))
      .rejects.toThrow('sequential, non-nested');
    expect(sql).toEqual([
      'SAVEPOINT rooms_e2e_route_1', 'ROLLBACK TO SAVEPOINT rooms_e2e_route_1', 'RELEASE SAVEPOINT rooms_e2e_route_1',
    ]);
  });
});
