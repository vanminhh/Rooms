import { Reflector } from '@nestjs/core';
import { RoomPriceSyncJob } from './room-price-sync.job.js';
import { AppModule } from '../app.module.js';

// CP-5 · BE-P2-26 · PRC-06, Q-P5-5 A.
// Unit under test: RoomPriceSyncJob (never mocked). The only mocked edge is PrismaService's
// `$transaction` (fake in-memory tx), never the real DB.
// `SCHEDULE_CRON_OPTIONS` is the literal metadata key `@nestjs/schedule`'s `@Cron` decorator writes
// via `SetMetadata`; it is not re-exported from the package's public entrypoint, so the key is
// hardcoded here to match `node_modules/@nestjs/schedule/dist/schedule.constants.js`.
const SCHEDULE_CRON_OPTIONS = 'SCHEDULE_CRON_OPTIONS';

// A minimal fake tx that satisfies room-price-sync.ts's own delegate calls (room.findMany,
// roomPrice.findMany, room.update) with no rooms by default, so job-level tests only exercise
// wiring (does the job call $transaction and forward it to the shared helper), not the counting
// rules themselves (covered by room-price-sync.spec.ts).
function makePrisma(rooms: Array<{ id: number; price: number }> = []) {
  const tx: any = {
    room: {
      findMany: vi.fn(async () => rooms),
      update: vi.fn(async () => undefined),
    },
    roomPrice: { findMany: vi.fn(async () => []) },
  };
  const prisma: any = {
    $transaction: vi.fn(async (callback: (c: any) => unknown) => callback(tx)),
  };
  return { prisma, tx };
}

describe('CP-5 · BE-P2-26 · RoomPriceSyncJob', () => {
  it('PRC-06: @Cron registers the job at 01:00 Asia/Ho_Chi_Minh with a stable name', () => {
    const reflector = new Reflector();
    // Read the method off the prototype via a property descriptor, not a direct member
    // access, so oxlint's unbound-method rule (which flags passing a class method around
    // without binding `this`) does not fire; we only pass it to Reflector.get as a metadata
    // key target and never call it, so `this` is never used.
    const runDaily = Object.getOwnPropertyDescriptor(RoomPriceSyncJob.prototype, 'runDaily')?.value as Function;
    const options = reflector.get<Record<string, unknown>>(SCHEDULE_CRON_OPTIONS, runDaily);
    expect(options).toMatchObject({ cronTime: '0 1 * * *', name: 'room-price-sync', timeZone: 'Asia/Ho_Chi_Minh' });
  });

  it('Q-P5-5 A: onApplicationBootstrap runs the sync once at startup (outside test) to fix a missed 01:00 run', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const { prisma } = makePrisma();
      const job = new RoomPriceSyncJob(prisma);
      await job.onApplicationBootstrap();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('onApplicationBootstrap does nothing when NODE_ENV=test (job is inert in the test suite)', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const { prisma } = makePrisma();
      const job = new RoomPriceSyncJob(prisma);
      await job.onApplicationBootstrap();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('runDaily (the 01:00 cron body) runs the sync through $transaction regardless of NODE_ENV', async () => {
    const { prisma } = makePrisma();
    const job = new RoomPriceSyncJob(prisma);
    await job.runDaily();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('a failing sync is logged, not thrown: runDaily resolves even when the transaction rejects', async () => {
    const prisma: any = { $transaction: vi.fn().mockRejectedValue(new Error('simulated db edge failure')) };
    const job = new RoomPriceSyncJob(prisma);
    const errorSpy = vi.spyOn((job as any).logger, 'error').mockImplementation(() => undefined);
    await expect(job.runDaily()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('room price sync failed');
  });

  it('a failing sync at startup is logged, not thrown: onApplicationBootstrap resolves even when the transaction rejects', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const prisma: any = { $transaction: vi.fn().mockRejectedValue(new Error('simulated db edge failure')) };
      const job = new RoomPriceSyncJob(prisma);
      const errorSpy = vi.spyOn((job as any).logger, 'error').mockImplementation(() => undefined);
      await expect(job.onApplicationBootstrap()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('app.module.ts registers ScheduleModule only outside tests, so the real @Cron firing is off while NODE_ENV=test', () => {
    // vitest runs with NODE_ENV=test, so app.module.ts's own `scheduleImports` guard must have
    // excluded ScheduleModule.forRoot() when this module graph was built at import time.
    expect(process.env.NODE_ENV).toBe('test');
    const imports = Reflect.getMetadata('imports', AppModule) as Array<{ module?: { name?: string } } | { name?: string }>;
    const names = imports.map((entry) => (entry as any)?.module?.name ?? (entry as any)?.name);
    expect(names).not.toContain('ScheduleModule');
    expect(names).toContain('PricingModule');
  });

  it('sync(roomIds) forwards roomIds to the shared helper through $transaction, logs one summary line, and returns it', async () => {
    const { prisma, tx } = makePrisma([{ id: 1, price: 2000000 }, { id: 2, price: 2100000 }]);
    const job = new RoomPriceSyncJob(prisma);
    const logSpy = vi.spyOn((job as any).logger, 'log').mockImplementation(() => undefined);
    const result = await job.sync([1, 2]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: [1, 2] } }) }),
    );
    expect(result).toEqual({ scanned: 2, updated: 0, unchanged: 0, withoutApprovedPrice: 2 });
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('scanned=2 updated=0 unchanged=0 withoutApprovedPrice=2');
  });
});
