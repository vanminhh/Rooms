import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ServicesService } from './services.service.js';

// Prisma and the clock are outside edges; ServicesService and the real ratesAt/todayHanoi helpers run unmocked.
const boss = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null } as any;
const manager = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] } as any;
const serviceRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1, buildingId: 10, name: 'Wifi', unit: 'ROOM', isActive: true, ...overrides,
});
function harness() {
  const state = { services: [serviceRow()], buildings: [10, 20], plans: [] as any[] };
  const prisma: any = {
    service: {
      findMany: vi.fn(async ({ where, orderBy, skip, take }: any) => {
        let rows = state.services.filter((s: any) => where.buildingId === undefined || (typeof where.buildingId === 'number' ? s.buildingId === where.buildingId : where.buildingId.in.includes(s.buildingId)));
        if (orderBy?.id) rows = [...rows].sort((a: any, b: any) => orderBy.id === 'desc' ? b.id - a.id : a.id - b.id);
        if (orderBy?.name) rows = [...rows].sort((a: any, b: any) => orderBy.name === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
        return rows.slice(skip, skip + take);
      }),
      count: vi.fn(async ({ where }: any) => state.services.filter((s: any) => where.buildingId === undefined || (typeof where.buildingId === 'number' ? s.buildingId === where.buildingId : where.buildingId.in.includes(s.buildingId))).length),
      create: vi.fn(async ({ data }: any) => { const row = serviceRow({ ...data, id: Math.max(0, ...state.services.map((s: any) => s.id)) + 1 }); state.services.push(row); return row; }),
      findUnique: vi.fn(async ({ where }: any) => state.services.find((s: any) => s.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => { const row: any = state.services.find((s: any) => s.id === where.id); Object.assign(row, data); return row; }),
    },
    building: { findUnique: vi.fn(async ({ where }: any) => state.buildings.includes(where.id) ? { id: where.id } : null) },
    ratePlan: { findMany: vi.fn(async ({ where }: any) => state.plans.filter((p: any) => p.buildingId === where.buildingId && p.status === where.status && p.effectiveFrom <= where.effectiveFrom.lte)) },
  };
  return { service: new ServicesService(prisma), prisma, state };
}

describe('BE-P2-15 · ServicesService', () => {
  it('SVC-01/02, D-P23-1: Boss creates ROOM/PERSON/VEHICLE catalog entries without creating a rate', async () => {
    const h = harness();
    for (const unit of ['ROOM', 'PERSON', 'VEHICLE']) {
      await expect(h.service.create(boss, { buildingId: 10, name: `Dịch vụ ${unit}`, unit } as any)).resolves.toMatchObject({ unit, hasCurrentRate: false });
    }
    expect(h.prisma.service.create).toHaveBeenCalledTimes(3);
    expect(h.prisma.ratePlan.findMany).not.toHaveBeenCalled();
  });

  it('SVC-01: name length 50 is accepted; nonexistent building is a field validation error', async () => {
    const h = harness();
    await expect(h.service.create(boss, { buildingId: 10, name: 'x'.repeat(50), unit: 'PERSON' } as any)).resolves.toMatchObject({ name: 'x'.repeat(50) });
    await expect(h.service.create(boss, { buildingId: 99, name: 'Wifi', unit: 'ROOM' } as any)).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED', fields: { buildingId: expect.any(String) } } });
  });

  it('SCOPE-01/02, API-08: manager catalog is scoped, empty pages retain correct metadata, and foreign building is forbidden', async () => {
    const h = harness();
    h.state.services.push(serviceRow({ id: 2, buildingId: 20, name: 'Rác', unit: 'PERSON' }));
    await expect(h.service.list(manager, { page: 1, limit: 100 } as any)).resolves.toMatchObject({ data: [expect.objectContaining({ buildingId: 10 })], meta: { page: 1, limit: 100, total: 1 } });
    await expect(h.service.list(manager, { buildingId: 20, page: 1, limit: 20 } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.list(boss, { buildingId: 20, page: 2, limit: 20 } as any)).resolves.toMatchObject({ data: [], meta: { page: 2, limit: 20, total: 1 } });
  });

  it('SVC-04, RATE-04/06, G-02: hasCurrentRate follows the real effective date helper and treats zero price as present', async () => {
    const h = harness();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-31T16:59:59.000Z'));
      h.state.plans.push({ id: 1, buildingId: 10, kind: 'SERVICE', serviceId: 1, effectiveFrom: new Date('2026-11-01T00:00:00Z'), reviewedAt: new Date(), status: 'APPROVED', tiers: [{ tierNo: 1, upTo: null, unitPrice: 0 }] });
      await expect(h.service.list(boss, { page: 1, limit: 20 } as any)).resolves.toMatchObject({ data: [expect.objectContaining({ hasCurrentRate: false })] });
      vi.setSystemTime(new Date('2026-10-31T17:00:00.000Z'));
      await expect(h.service.list(boss, { page: 1, limit: 20 } as any)).resolves.toMatchObject({ data: [expect.objectContaining({ hasCurrentRate: true })] });
      h.state.plans[0].effectiveFrom = new Date('2027-03-01T00:00:00Z');
      vi.setSystemTime(new Date('2027-02-28T16:59:59.000Z'));
      await expect(h.service.list(boss, { page: 1, limit: 20 } as any)).resolves.toMatchObject({ data: [expect.objectContaining({ hasCurrentRate: false })] });
      vi.setSystemTime(new Date('2027-02-28T17:00:00.000Z'));
      await expect(h.service.list(boss, { page: 1, limit: 20 } as any)).resolves.toMatchObject({ data: [expect.objectContaining({ hasCurrentRate: true })] });
    } finally { vi.useRealTimers(); }
  });

  it('SVC-02/04, DB-B5, D-P23-1: PATCH cannot change unit or building even when unchanged, and rejection does not mutate', async () => {
    const h = harness();
    for (const field of ['unit', 'buildingId']) {
      const value = field === 'unit' ? 'ROOM' : 10;
      await expect(h.service.update(boss, 1, { name: 'Should not apply', isActive: false, [field]: value } as any)).rejects.toBeInstanceOf(BadRequestException);
      expect(h.state.services[0]).toMatchObject({ name: 'Wifi', isActive: true, unit: 'ROOM', buildingId: 10 });
    }
    await expect(h.service.update(boss, 999, { name: 'Missing' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('SVC-01/02, G-01: rename and deactivate preserve building/unit and never write fractional prices or delete history', async () => {
    const h = harness();
    h.state.plans.push({ id: 7, buildingId: 10, kind: 'SERVICE', serviceId: 1, effectiveFrom: new Date('2020-01-01T00:00:00Z'), status: 'APPROVED', tiers: [{ unitPrice: 100001 }] });
    await expect(h.service.update(boss, 1, { name: 'Wifi mới', isActive: false } as any)).resolves.toMatchObject({ name: 'Wifi mới', unit: 'ROOM', buildingId: 10, isActive: false });
    expect(h.state.plans[0].tiers[0].unitPrice).toBe(100001);
    expect(h.prisma.service.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { name: 'Wifi mới', isActive: false } });
  });
});
