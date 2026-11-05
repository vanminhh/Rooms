import { addDays, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { DashboardService } from './dashboard.service.js';
import type { DashboardQueryDto } from './dto/dashboard.dto.js';

// CP-5 (BE-P2-33) · VIEW-07, SCOPE-04, VIEW-13, PRC-11, Q-P6-2: unit tests of DashboardService
// against the spec and PLAN.md §2.3 / §4 CP-5 (not the coder's comments). Prisma is the only
// mocked edge (DB), reproduced here just enough to exercise the `viewing`/`room`/`building`,
// `roomPrice`, `ratePlan` where-shapes the service actually sends.

const TODAY = todayHanoi();
const TODAY_STR = formatDateOnly(TODAY);
const YESTERDAY = formatDateOnly(addDays(TODAY, -1));
const MINUS_30 = formatDateOnly(addDays(TODAY, -30));

// Buildings: 10 has an active manager (excluded from Boss's card); 20 is locked/unmanaged
// (managerId null, BLD-06); 30 has a manager who was disabled (SCOPE-04); 40 is a second
// active-managed building used only for manager-scope tests.
interface BuildingRow {
  id: number;
  managerId: number | null;
  managerActive: boolean;
}
const BUILDINGS = new Map<number, BuildingRow>([
  [10, { id: 10, managerId: 2, managerActive: true }],
  [20, { id: 20, managerId: null, managerActive: false }],
  [30, { id: 30, managerId: 3, managerActive: false }],
  [40, { id: 40, managerId: 4, managerActive: true }],
]);
const ROOMS = new Map<number, { buildingId: number; code: string }>([
  [101, { buildingId: 10, code: 'P101' }],
  [102, { buildingId: 10, code: 'P102' }],
  [201, { buildingId: 20, code: 'P201' }],
  [301, { buildingId: 30, code: 'P301' }],
  [401, { buildingId: 40, code: 'P401' }],
]);

const BOSS: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
const MANAGER_10: AuthUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] };
// The former manager of building 20: once a building is locked its managerId is cleared (BLD-06),
// so this manager's scope no longer includes it (VIEW-13).
const MANAGER_NONE: AuthUser = { id: 9, role: 'MANAGER', mustChangePassword: false, buildingIds: [] };

interface ViewingRow {
  id: number;
  roomId: number;
  visitDate: Date;
  timeSlot: string;
  status: string;
  guestName: string;
  guestPhone: string;
  note: string | null;
  source: string;
  handledById: number | null;
  outcomeNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function addRow(rows: ViewingRow[], overrides: Partial<ViewingRow> & { id: number; roomId: number; visitDate: string }): ViewingRow {
  const row: ViewingRow = {
    status: 'NEW',
    timeSlot: 'MORNING',
    guestName: 'Khách',
    guestPhone: '0912340000',
    note: null,
    source: 'WEB',
    handledById: null,
    outcomeNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    visitDate: new Date(`${overrides.visitDate}T00:00:00.000Z`),
  };
  rows.push(row);
  return row;
}

function roomInclude(roomId: number) {
  const r = ROOMS.get(roomId)!;
  return { code: r.code, buildingId: r.buildingId, building: { name: `Tòa ${r.buildingId}` } };
}

function matchRoomWhere(roomWhere: any, roomId: number): boolean {
  const r = ROOMS.get(roomId)!;
  if (roomWhere.buildingId !== undefined) {
    const bf = roomWhere.buildingId;
    if (bf && typeof bf === 'object' && 'in' in bf) {
      if (!bf.in.includes(r.buildingId)) return false;
    } else if (r.buildingId !== bf) return false;
  }
  if (roomWhere.building !== undefined) {
    const bld = BUILDINGS.get(r.buildingId);
    if (!bld) return false; // ?buildingId of a building that does not exist at all
    if (roomWhere.building.id !== undefined && bld.id !== roomWhere.building.id) return false;
    if (roomWhere.building.OR) {
      const ok = roomWhere.building.OR.some((cond: any) =>
        'managerId' in cond ? bld.managerId === cond.managerId : bld.managerId !== null && bld.managerActive === cond.manager.isActive,
      );
      if (!ok) return false;
    }
  }
  return true;
}

function matchWhere(row: ViewingRow, where: any): boolean {
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.room !== undefined && !matchRoomWhere(where.room, row.roomId)) return false;
  if (where.id !== undefined && !where.id.in.includes(row.id)) return false;
  return true;
}

function makePrisma(
  viewingRows: ViewingRow[],
  roomPriceRows: { status: string; effectiveFrom: Date }[] = [],
  ratePlanRows: { status: string; effectiveFrom: Date }[] = [],
) {
  return {
    viewing: {
      findMany: vi.fn(async ({ where, select }: any) => {
        const rows = viewingRows.filter((r) => matchWhere(r, where));
        if (select) return rows.map((r) => ({ id: r.id, visitDate: r.visitDate, timeSlot: r.timeSlot }));
        return rows.map((r) => ({ ...r, room: roomInclude(r.roomId) }));
      }),
    },
    roomPrice: {
      count: vi.fn(
        async ({ where }: any) =>
          roomPriceRows.filter((r) => r.status === where.status && r.effectiveFrom.getTime() >= where.effectiveFrom.gte.getTime()).length,
      ),
    },
    ratePlan: {
      count: vi.fn(
        async ({ where }: any) =>
          ratePlanRows.filter((r) => r.status === where.status && r.effectiveFrom.getTime() >= where.effectiveFrom.gte.getTime()).length,
      ),
    },
  } as any;
}

describe('CP-5 (BE-P2-33) · DashboardService.get — newViewings (VIEW-07, SCOPE-04)', () => {
  it('VIEW-07 happy: MANAGER sees count/items of NEW viewings of their own buildings only; other statuses and other buildings do not count', async () => {
    const rows: ViewingRow[] = [];
    addRow(rows, { id: 1, roomId: 101, visitDate: TODAY_STR, status: 'NEW' });
    addRow(rows, { id: 2, roomId: 102, visitDate: TODAY_STR, status: 'CONFIRMED' }); // same building, not NEW
    addRow(rows, { id: 3, roomId: 401, visitDate: TODAY_STR, status: 'NEW' }); // building 40, out of scope
    const prisma = makePrisma(rows);
    const service = new DashboardService(prisma);
    const res = await service.get(MANAGER_10, {} as DashboardQueryDto);
    expect(res.newViewings.count).toBe(1);
    expect(res.newViewings.items.map((v) => v.id)).toEqual([1]);
  });

  it('VIEW-07/SCOPE-04: Boss counts only NEW viewings of buildings with no active manager (managerId null or manager inactive); an actively-managed building is excluded', async () => {
    const rows: ViewingRow[] = [];
    addRow(rows, { id: 1, roomId: 101, visitDate: TODAY_STR }); // building 10, active manager -> excluded
    addRow(rows, { id: 2, roomId: 201, visitDate: TODAY_STR }); // building 20, managerId null -> included
    addRow(rows, { id: 3, roomId: 301, visitDate: TODAY_STR }); // building 30, manager inactive -> included
    const prisma = makePrisma(rows);
    const service = new DashboardService(prisma);
    const res = await service.get(BOSS, {} as DashboardQueryDto);
    expect(res.newViewings.count).toBe(2);
    expect(res.newViewings.items.map((v) => v.id).sort()).toEqual([2, 3]);
  });

  it('VIEW-13: a locked building (managerId cleared) puts its NEW viewings in the Boss card and removes them from the former manager (who no longer has it in scope)', async () => {
    const rows: ViewingRow[] = [];
    addRow(rows, { id: 1, roomId: 201, visitDate: TODAY_STR }); // building 20, locked
    const prisma = makePrisma(rows);
    const service = new DashboardService(prisma);
    const boss = await service.get(BOSS, {} as DashboardQueryDto);
    expect(boss.newViewings.count).toBe(1);
    const formerManager = await service.get(MANAGER_NONE, {} as DashboardQueryDto);
    expect(formerManager.newViewings.count).toBe(0);
    expect(formerManager.newViewings.items).toEqual([]);
  });

  it('Q-P6-2 = A: a NEW viewing whose visit_date is in the past (yesterday, today-30) still counts and still appears in items (earliest first by visitDate asc)', async () => {
    const rows: ViewingRow[] = [];
    addRow(rows, { id: 1, roomId: 101, visitDate: TODAY_STR });
    addRow(rows, { id: 2, roomId: 101, visitDate: YESTERDAY });
    addRow(rows, { id: 3, roomId: 101, visitDate: MINUS_30 });
    const prisma = makePrisma(rows);
    const service = new DashboardService(prisma);
    const res = await service.get(MANAGER_10, {} as DashboardQueryDto);
    expect(res.newViewings.count).toBe(3);
    expect(res.newViewings.items.map((v) => v.id)).toEqual([3, 2, 1]); // oldest visitDate first
  });

  it('boundary: no NEW viewings at all → count 0, items []', async () => {
    const prisma = makePrisma([]);
    const service = new DashboardService(prisma);
    const res = await service.get(BOSS, {} as DashboardQueryDto);
    expect(res.newViewings.count).toBe(0);
    expect(res.newViewings.items).toEqual([]);
  });

  it('boundary: exactly 5 NEW viewings → items has 5, count is 5', async () => {
    const rows: ViewingRow[] = [];
    for (let i = 1; i <= 5; i++) addRow(rows, { id: i, roomId: 101, visitDate: formatDateOnly(addDays(TODAY, i)) });
    const prisma = makePrisma(rows);
    const service = new DashboardService(prisma);
    const res = await service.get(MANAGER_10, {} as DashboardQueryDto);
    expect(res.newViewings.count).toBe(5);
    expect(res.newViewings.items).toHaveLength(5);
  });

  it('boundary: 6 NEW viewings → items is capped at 5, count is 6 (the full count, not the page size)', async () => {
    const rows: ViewingRow[] = [];
    for (let i = 1; i <= 6; i++) addRow(rows, { id: i, roomId: 101, visitDate: formatDateOnly(addDays(TODAY, i)) });
    const prisma = makePrisma(rows);
    const service = new DashboardService(prisma);
    const res = await service.get(MANAGER_10, {} as DashboardQueryDto);
    expect(res.newViewings.count).toBe(6);
    expect(res.newViewings.items).toHaveLength(5);
    expect(res.newViewings.items.map((v) => v.id)).toEqual([1, 2, 3, 4, 5]); // the 5 earliest visitDates
  });
});

describe('CP-5 (BE-P2-33) · DashboardService.get — Boss ?buildingId narrows, never widens (PLAN §2.3)', () => {
  it('a building WITH an active manager that has NEW viewings → count 0, items [] (not 403): ?buildingId only narrows the Boss card, it never adds a managed building to it', async () => {
    const rows: ViewingRow[] = [];
    addRow(rows, { id: 1, roomId: 101, visitDate: TODAY_STR }); // building 10, active manager
    const prisma = makePrisma(rows);
    const service = new DashboardService(prisma);
    const res = await service.get(BOSS, { buildingId: 10 } as DashboardQueryDto);
    expect(res.newViewings.count).toBe(0);
    expect(res.newViewings.items).toEqual([]);
  });

  it('same building, after its manager becomes inactive → its NEW viewings now appear under ?buildingId', async () => {
    BUILDINGS.set(50, { id: 50, managerId: 5, managerActive: false });
    ROOMS.set(501, { buildingId: 50, code: 'P501' });
    const rows: ViewingRow[] = [];
    addRow(rows, { id: 1, roomId: 501, visitDate: TODAY_STR });
    const prisma = makePrisma(rows);
    const service = new DashboardService(prisma);
    const res = await service.get(BOSS, { buildingId: 50 } as DashboardQueryDto);
    expect(res.newViewings.count).toBe(1);
    expect(res.newViewings.items.map((v) => v.id)).toEqual([1]);
  });

  it('a managerId=null building → count matches exactly that building, not mixed with another unmanaged building', async () => {
    const rows: ViewingRow[] = [];
    addRow(rows, { id: 1, roomId: 201, visitDate: TODAY_STR }); // building 20
    addRow(rows, { id: 2, roomId: 301, visitDate: TODAY_STR }); // building 30, also without an active manager
    const prisma = makePrisma(rows);
    const service = new DashboardService(prisma);
    const res = await service.get(BOSS, { buildingId: 20 } as DashboardQueryDto);
    expect(res.newViewings.count).toBe(1);
    expect(res.newViewings.items.map((v) => v.id)).toEqual([1]);
  });

  it('?buildingId of a building that does not exist at all → count 0 (not 403; Boss scope does not leak existence)', async () => {
    const prisma = makePrisma([]);
    const service = new DashboardService(prisma);
    const res = await service.get(BOSS, { buildingId: 999999 } as DashboardQueryDto);
    expect(res.newViewings.count).toBe(0);
    expect(res.newViewings.items).toEqual([]);
  });
});

describe('CP-5 (BE-P2-33) · DashboardService.get — pendingPrices (PRC-11)', () => {
  it('Boss: counts only PENDING room_prices/rate_plans with effective_from >= today; an expired PENDING proposal (yesterday) is not counted; rooms + ratePlans sum to count', async () => {
    const roomPriceRows = [
      { status: 'PENDING', effectiveFrom: new Date(`${TODAY_STR}T00:00:00.000Z`) }, // boundary: today, counted
      { status: 'PENDING', effectiveFrom: new Date(`${YESTERDAY}T00:00:00.000Z`) }, // expired, not counted
      { status: 'APPROVED', effectiveFrom: new Date(`${TODAY_STR}T00:00:00.000Z`) }, // wrong status
    ];
    const ratePlanRows = [{ status: 'PENDING', effectiveFrom: new Date(`${formatDateOnly(addDays(TODAY, 1))}T00:00:00.000Z`) }];
    const prisma = makePrisma([], roomPriceRows, ratePlanRows);
    const service = new DashboardService(prisma);
    const res = await service.get(BOSS, {} as DashboardQueryDto);
    expect(res.pendingPrices).toEqual({ count: 2, rooms: 1, ratePlans: 1 });
  });

  it('Manager: pendingPrices is null (PRC-11 is a Boss-only card)', async () => {
    const roomPriceRows = [{ status: 'PENDING', effectiveFrom: new Date(`${TODAY_STR}T00:00:00.000Z`) }];
    const prisma = makePrisma([], roomPriceRows, []);
    const service = new DashboardService(prisma);
    const res = await service.get(MANAGER_10, {} as DashboardQueryDto);
    expect(res.pendingPrices).toBeNull();
  });

  it('boundary: no pending proposals at all → count 0, rooms 0, ratePlans 0', async () => {
    const prisma = makePrisma([]);
    const service = new DashboardService(prisma);
    const res = await service.get(BOSS, {} as DashboardQueryDto);
    expect(res.pendingPrices).toEqual({ count: 0, rooms: 0, ratePlans: 0 });
  });
});

describe('CP-5 (BE-P2-33) · DashboardService.get — scope guard on ?buildingId (SCOPE-02/API-08)', () => {
  it('MANAGER ?buildingId outside their own buildings → 403 OUT_OF_SCOPE', async () => {
    const prisma = makePrisma([]);
    const service = new DashboardService(prisma);
    await expect(service.get(MANAGER_10, { buildingId: 40 } as DashboardQueryDto)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('MANAGER ?buildingId of one of their own buildings → allowed (no throw)', async () => {
    const prisma = makePrisma([]);
    const service = new DashboardService(prisma);
    await expect(service.get(MANAGER_10, { buildingId: 10 } as DashboardQueryDto)).resolves.toBeDefined();
  });
});
