import { ConflictException } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';

describe('BE-P2-17 · building lock during room creation', () => {
  it('ROOM-06: waits for the building row lock, rechecks isActive, and creates in the same transaction', async () => {
    let releaseBuildingLock!: () => void;
    let finishLockAttempt!: () => void;
    const buildingLockReleased = new Promise<void>((resolve) => { releaseBuildingLock = resolve; });
    const lockAttempted = new Promise<void>((resolve) => { finishLockAttempt = resolve; });
    let buildingIsActive = true;

    const tx = {
      $queryRaw: vi.fn(async (query: TemplateStringsArray) => {
        finishLockAttempt();
        await buildingLockReleased;
        return query;
      }),
      building: {
        findUnique: vi.fn(async () => ({ id: 10, managerId: null, isActive: buildingIsActive })),
      },
      room: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new RoomsService(prisma as any);
    const boss = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null } as any;

    const create = service.create(boss, { buildingId: 10, code: '101', floor: 1, areaM2: 24 } as any);
    await lockAttempted;

    // A competing transaction owns the building row lock and commits a lock before this create proceeds.
    buildingIsActive = false;
    releaseBuildingLock();

    await expect(create).rejects.toMatchObject({
      constructor: ConflictException,
      status: 409,
      response: { statusCode: 409, error: 'Conflict', message: 'CONFLICT_STATE' },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String(tx.$queryRaw.mock.calls[0][0])).toContain('SELECT id FROM buildings WHERE id =');
    expect(String(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(tx.building.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.room.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
