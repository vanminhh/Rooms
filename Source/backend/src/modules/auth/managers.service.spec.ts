import { NotFoundException } from '@nestjs/common';
import { verifyPassword } from '../../common/crypto/password.js';
import { ManagersService } from './managers.service.js';

// The Prisma transaction/database and audit sink are outside edges; password hashing remains real.
describe('BE-P2-16 managers service', () => {
  const boss = { id: 1, role: 'BOSS', buildingIds: [], mustChangePassword: false } as any;
  const managers = new Map<number, any>();
  const sessions = new Map<number, any[]>();
  const buildings = new Map<number, any>();
  let nextId = 10;
  const audit = { log: vi.fn(async () => undefined) };
  const tx: any = {
    user: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: nextId++, ...data, contactPhone: null, zaloUrl: null, facebookUrl: null, createdAt: new Date('2026-01-01T00:00:00Z'), managedBuildings: [] };
        managers.set(row.id, row); return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => managers.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => { const row = managers.get(where.id); Object.assign(row, data); return row; }),
      findMany: vi.fn(async ({ where, skip, take }: any) => [...managers.values()].filter((m) => m.role === where.role && (where.managedBuildings?.some ? m.managedBuildings.some((b: any) => b.id === where.managedBuildings.some.id) : true)).slice(skip, skip + take)),
      count: vi.fn(async () => managers.size),
    },
    session: { updateMany: vi.fn(async ({ where, data }: any) => { const live = sessions.get(where.userId) ?? []; for (const s of live) if (s.revokedAt === null) s.revokedAt = data.revokedAt; return { count: live.length }; }) },
    $queryRaw: vi.fn(async () => []),
  };
  const prisma: any = { ...tx, $transaction: vi.fn(async (work: any) => work(tx)) };
  const service = new ManagersService(prisma, audit as any);

  beforeEach(() => { managers.clear(); sessions.clear(); buildings.clear(); audit.log.mockClear(); tx.user.create.mockClear(); tx.user.update.mockClear(); tx.session.updateMany.mockClear(); });

  it('AUTH-08/AUTH-03: Boss receives a one-time argon2id temporary password and safe manager view', async () => {
    const first = await service.create(boss, { phone: '0912345678', fullName: 'Quản lý Một' } as any, '127.0.0.1');
    const second = await service.create(boss, { phone: '0912345679', fullName: 'Quản lý Hai' } as any);
    expect(first.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    expect(await verifyPassword(managers.get(first.manager.id).passwordHash, first.temporaryPassword)).toBe(true);
    expect(first.manager).toMatchObject({ isActive: true, mustChangePassword: true });
    expect(first.manager).not.toHaveProperty('passwordHash');
    expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
    expect(JSON.stringify(first.manager)).not.toContain(first.temporaryPassword);
    expect(JSON.stringify(first.manager)).not.toContain('passwordHash');
    expect(audit.log).toHaveBeenCalledWith(1, 'manager.create', 'user', first.manager.id, undefined, expect.objectContaining({ role: 'MANAGER', isActive: true, mustChangePassword: true }), '127.0.0.1', tx);
  });

  it('AUTH-08/AUTH-T3/AUD-01: deactivation revokes every live session and keeps assigned buildings', async () => {
    const created = await service.create(boss, { phone: '0912345678', fullName: 'Quản lý' } as any);
    const row = managers.get(created.manager.id);
    row.managedBuildings = [{ id: 44, code: 'B44', name: 'Tòa 44', isActive: true }];
    sessions.set(row.id, [{ revokedAt: null }, { revokedAt: null }, { revokedAt: new Date('2026-01-01') }]);
    const result = await service.update(boss, row.id, { isActive: false } as any);
    expect(result).toMatchObject({ isActive: false, mustChangePassword: true, buildings: [{ id: 44 }] });
    expect(sessions.get(row.id)?.filter((s) => s.revokedAt === null)).toHaveLength(0);
    expect(tx.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: row.id, revokedAt: null }, data: { revokedAt: expect.any(Date) } }));
    expect(audit.log).toHaveBeenLastCalledWith(1, 'manager.deactivate', 'user', row.id, { isActive: true }, { isActive: false }, undefined, tx);
    const reactivated = await service.update(boss, row.id, { isActive: true } as any);
    expect(reactivated).toMatchObject({ isActive: true, buildings: [{ id: 44 }] });
    expect(sessions.get(row.id)?.filter((s) => s.revokedAt === null)).toHaveLength(0);
  });

  it('AUTH-08/API-02: listing exposes only manager rows and paginated safe views', async () => {
    const created = await service.create(boss, { phone: '0912345678', fullName: 'Quản lý' } as any);
    const result = await service.list(boss, { page: 2, limit: 1 } as any);
    expect(result).toMatchObject({ data: [], meta: { page: 2, limit: 1, total: 1 } });
    expect(JSON.stringify(result)).not.toContain(managers.get(created.manager.id).passwordHash);
  });

  it('AUTH-08/API-04: only manager accounts can be patched and absent ids return 404', async () => {
    await expect(service.update(boss, 999, { isActive: false } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('AUTH-08/API-04: PATCH returns 404 for existing Boss and Tenant users', async () => {
    managers.set(1, { id: 1, role: 'BOSS', isActive: true });
    managers.set(2, { id: 2, role: 'TENANT', isActive: true });

    await expect(service.update(boss, 1, { isActive: false } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(boss, 2, { isActive: false } as any)).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.session.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});
