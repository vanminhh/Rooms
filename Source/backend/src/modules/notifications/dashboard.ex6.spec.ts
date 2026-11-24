import { DashboardService } from './dashboard.service.js';
import { BOSS, MANAGER, NOW, setupViewings } from '../../../test/fixtures/viewing-prisma.js';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

function setup() {
  const { db, service: viewings } = setupViewings();
  db.prisma.request = { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) };
  db.prisma.ratePlan = { count: vi.fn(async () => 0) };
  db.prisma.roomPrice = { count: vi.fn(async () => 0) };
  db.prisma.invoice = { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) };
  db.prisma.contract = { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) };
  return { db, viewings, service: new DashboardService(db.prisma) };
}

describe('BE-EX-24 dashboard and mixed list', () => {
  it('VIEW-07/17: every NEW counts, overdue is flagged without changing status', async () => {
    const { db, service } = setup(); db.add({ visitAt: new Date('2026-11-14T03:00:00Z') }); db.add(); db.add({ status: 'CONFIRMED' });
    const result = await service.get(MANAGER, {});
    expect(result.newViewings.count).toBe(2);
    expect(result.newViewings.items[0]).toMatchObject({ overdue: true, status: 'NEW' });
    expect(result.overlappingViewings.count).toBe(0);
  });
  it('VIEW-22: valid groups are not overlaps; cross-building CONFIRMED is visible despite building filter', async () => {
    const { db, service } = setup();
    for (const phone of ['0911111111', '0922222222', '0933333333']) db.add({ guestPhone: phone });
    expect((await service.get(MANAGER, {})).overlappingViewings.count).toBe(0);
    db.add({ roomId: 201, status: 'CONFIRMED' });
    const all = await service.get(MANAGER, {});
    expect(all.overlappingViewings.count).toBe(4);
    expect(all.overlappingViewings.items.some(v => v.status === 'CONFIRMED')).toBe(true);
    const filtered = await service.get(MANAGER, { buildingId: 10 });
    expect(filtered.overlappingViewings.count).toBe(3);
    expect(filtered.newViewings.items.every(v => v.overlap)).toBe(true);
  });
  it('VIEW-13/22: lock/deactivation preserves rows and moves current responsibility to Boss', async () => {
    const { db, service } = setup(); db.add(); db.add({ roomId: 201, status: 'CONFIRMED' });
    db.users[1].isActive = false;
    db.buildings[1].isActive = false; db.buildings[1].managerId = null as any;
    const result = await service.get(BOSS, {});
    expect(result.newViewings.count).toBe(1);
    expect(result.overlappingViewings.count).toBe(2);
    expect(result.overlappingViewings.items[1].roomLocked).toBe(true);
    expect(db.rows.map(v => v.status)).toEqual(['NEW', 'CONFIRMED']);
  });
  it('VIEW-07: Boss list sees all buildings while dashboard counts only fallback responsibility', async () => {
    const { db, service, viewings } = setup(); db.add(); db.add({ roomId: 301 });
    expect((await service.get(BOSS, {})).newViewings.count).toBe(0);
    expect((await viewings.list(BOSS, {})).meta.total).toBe(2);
  });
  it('API-08/VIEW-08: mixed legacy/exact rows sort before pagination and date filters use Hanoi dates', async () => {
    const { db, viewings } = setup();
    db.add({ visitAt: null, visitDate: new Date('2026-11-16'), timeSlot: 'AFTERNOON' });
    db.add({ visitAt: new Date('2026-11-16T01:00:00Z') });
    db.add({ visitAt: null, visitDate: new Date('2026-11-16'), timeSlot: 'EVENING' });
    expect((await viewings.list(BOSS, { page: 1, limit: 1 })).data[0].id).toBe(2);
    expect((await viewings.list(BOSS, { page: 2, limit: 1 })).data[0].id).toBe(1);
    expect((await viewings.list(BOSS, { from: '2026-11-16', to: '2026-11-16' })).meta.total).toBe(3);
    expect((await viewings.list(BOSS, { from: '2026-11-17' })).meta.total).toBe(0);
  });
  it('VIEW-22: list page flags a conflict outside the selected building', async () => {
    const { db, viewings } = setup(); db.add(); db.add({ roomId: 201 });
    expect((await viewings.list(BOSS, { buildingId: 10, limit: 1 })).data[0].overlap).toBe(true);
  });
});
