import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from './audit.service.js';

// Outside edge replaced: the DB. `auditLog.create` is a vi.fn() on a stand-in PrismaService / transaction client.
// Real: AuditService itself.

const fakeDb = () => ({ auditLog: { create: vi.fn().mockResolvedValue({}) } });
const build = () => {
  const prisma = fakeDb();
  const service = new AuditService(prisma as unknown as PrismaService);
  return { prisma, service };
};

describe('AUD-01: AuditService.log', () => {
  it('AUD-01: log(1, "user.change_password", "user", 1) writes exactly 5 keys; before/after are absent', async () => {
    const { prisma, service } = build();
    await service.log(1, 'user.change_password', 'user', 1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.auditLog.create.mock.calls[0][0];
    expect(data).toEqual({ actorId: 1, action: 'user.change_password', entity: 'user', entityId: 1, ip: null });
    expect(Object.keys(data).sort()).toEqual(['action', 'actorId', 'entity', 'entityId', 'ip']);
    expect('before' in data).toBe(false);
    expect('after' in data).toBe(false);
  });

  it('AUD-01: an explicit undefined before/after is still left out of data', async () => {
    const { prisma, service } = build();
    await service.log(7, 'user.reset_password', 'user', 7, undefined, undefined, undefined);
    const { data } = prisma.auditLog.create.mock.calls[0][0];
    expect(Object.keys(data).sort()).toEqual(['action', 'actorId', 'entity', 'entityId', 'ip']);
    expect(data.ip).toBeNull();
  });

  it('AUD-01: before, after and ip are stored when given', async () => {
    const { prisma, service } = build();
    await service.log(2, 'room.update', 'room', 9, { price: 1 }, { price: 2 }, '203.0.113.7');
    expect(prisma.auditLog.create.mock.calls[0][0]).toEqual({
      data: {
        actorId: 2,
        action: 'room.update',
        entity: 'room',
        entityId: 9,
        before: { price: 1 },
        after: { price: 2 },
        ip: '203.0.113.7',
      },
    });
  });

  it('AUD-01: an explicit null ip is stored as null', async () => {
    const { prisma, service } = build();
    await service.log(3, 'user.change_password', 'user', 3, undefined, undefined, null);
    expect(prisma.auditLog.create.mock.calls[0][0].data.ip).toBeNull();
  });

  it('AUD-01: with a transaction client the row goes through `db`, never through the default prisma', async () => {
    const { prisma, service } = build();
    const tx = fakeDb();
    await service.log(4, 'user.change_password', 'user', 4, undefined, undefined, '::1', tx as never);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create.mock.calls[0][0].data).toEqual({
      actorId: 4,
      action: 'user.change_password',
      entity: 'user',
      entityId: 4,
      ip: '::1',
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('AUD-03: actorId null (system action) is accepted', async () => {
    const { prisma, service } = build();
    await service.log(null, 'system.job', 'invoice', 5);
    expect(prisma.auditLog.create.mock.calls[0][0].data.actorId).toBeNull();
  });

  it('AUD-01: a failing insert rejects, so a caller inside a transaction rolls back', async () => {
    const { prisma, service } = build();
    prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));
    await expect(service.log(1, 'user.change_password', 'user', 1)).rejects.toThrow('db down');
  });
});
