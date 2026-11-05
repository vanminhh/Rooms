import { addDays, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { ViewingsService } from './viewings.service.js';
import type { CreateViewingDto, UpdateViewingDto, ViewingsQueryDto } from './dto/viewings.dto.js';

// CP-4 (BE-P2-32) · VIEW-03, 04, 09, 10, SCOPE-02, API-08: unit tests of ViewingsService
// list/create/update against the spec and PLAN.md §2.3 (not the coder's comments).
// Prisma is the only mocked edge (DB), reproduced here just enough to exercise the where/orderBy
// shapes the service actually sends (including the known time_slot alphabetical DB order, so the
// service's own JS re-sort is what is really under test, not a pre-sorted fixture).

const TODAY = todayHanoi();
const TOMORROW = formatDateOnly(addDays(TODAY, 1));
const YESTERDAY = formatDateOnly(addDays(TODAY, -1));
const TODAY_STR = formatDateOnly(TODAY);
const PLUS30 = formatDateOnly(addDays(TODAY, 30));
const PLUS31 = formatDateOnly(addDays(TODAY, 31));

// Rooms: 101/102 in building 10 (active manager), 103 in building 20 (active manager),
// 104 in building 30 (locked: no manager, per BLD-06).
const ROOMS = new Map<number, { code: string; buildingId: number; isActive: boolean }>([
  [101, { code: 'P101', buildingId: 10, isActive: true }],
  [102, { code: 'P102', buildingId: 10, isActive: false }],
  [103, { code: 'P103', buildingId: 20, isActive: true }],
  [104, { code: 'P104', buildingId: 30, isActive: true }],
]);
const BUILDING_NAMES = new Map<number, string>([
  [10, 'Tòa A'],
  [20, 'Tòa B'],
  [30, 'Tòa Khóa'],
]);

const BOSS: AuthUser = { id: 1, role: 'BOSS', mustChangePassword: false, buildingIds: null };
// Manager of building 10 only; building 20 belongs to another manager; building 30 is locked
// (its manager was removed, BLD-06), so 30 is out of scope for every manager, old or new.
const MANAGER_10: AuthUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10] };
const MANAGER_1020: AuthUser = { id: 2, role: 'MANAGER', mustChangePassword: false, buildingIds: [10, 20] };

interface Row {
  id: number;
  roomId: number;
  guestName: string;
  guestPhone: string;
  visitDate: Date;
  timeSlot: string;
  note: string | null;
  source: 'WEB' | 'MANUAL';
  status: string;
  handledById: number | null;
  outcomeNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function roomInclude(roomId: number) {
  const r = ROOMS.get(roomId)!;
  return { code: r.code, buildingId: r.buildingId, building: { name: BUILDING_NAMES.get(r.buildingId) } };
}

function matchWhere(row: Row, where: any): boolean {
  if (where.room) {
    const bf = where.room.buildingId;
    if (bf !== undefined) {
      const rbId = ROOMS.get(row.roomId)!.buildingId;
      if (bf && typeof bf === 'object' && 'in' in bf) {
        if (!bf.in.includes(rbId)) return false;
      } else if (rbId !== bf) return false;
    }
  }
  if (where.status !== undefined && row.status !== where.status) return false;
  if (where.visitDate) {
    const { gte, lte } = where.visitDate;
    if (gte !== undefined && row.visitDate.getTime() < gte.getTime()) return false;
    if (lte !== undefined && row.visitDate.getTime() > lte.getTime()) return false;
  }
  return true;
}

// Mirrors Prisma's actual behaviour: time_slot is a plain varchar, so ORDER BY sorts it
// alphabetically (AFTERNOON < EVENING < MORNING) — deliberately "wrong" so the service's
// post-fetch JS re-sort (SLOT_START_MINUTES) is the thing that makes the final order correct.
function sortRows(rows: Row[], orderBy: any): Row[] {
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const [field, dir] = Object.entries(spec)[0] as [string, 'asc' | 'desc'];
      let av: any = (a as any)[field];
      let bv: any = (b as any)[field];
      if (field === 'visitDate') {
        av = av.getTime();
        bv = bv.getTime();
      }
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

function makePrisma(rows: Row[]) {
  let nextId = rows.length ? Math.max(...rows.map((r) => r.id)) + 1 : 1;
  const prisma: any = {
    room: {
      findUnique: vi.fn(async ({ where }: any) => {
        const r = ROOMS.get(where.id);
        return r ? { isActive: r.isActive, buildingId: r.buildingId } : null;
      }),
    },
    viewing: {
      create: vi.fn(async ({ data }: any) => {
        const row: Row = {
          id: nextId++,
          note: null,
          outcomeNote: null,
          handledById: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        rows.push(row);
        return { ...row, room: roomInclude(row.roomId) };
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const row = rows.find((r) => r.id === where.id);
        return row ? { ...row, room: roomInclude(row.roomId) } : null;
      }),
      findMany: vi.fn(async ({ where, orderBy, skip, take }: any) => {
        let result = rows.filter((r) => matchWhere(r, where));
        result = sortRows(result, orderBy);
        if (skip !== undefined) result = result.slice(skip);
        if (take !== undefined) result = result.slice(0, take);
        return result.map((row) => ({ ...row, room: roomInclude(row.roomId) }));
      }),
      count: vi.fn(async ({ where }: any) => rows.filter((r) => matchWhere(r, where)).length),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = rows.filter((r) => r.id === where.id && r.status === where.status);
        matches.forEach((r) => Object.assign(r, data));
        return { count: matches.length };
      }),
    },
  };
  return { prisma, rows };
}

function addRow(rows: Row[], overrides: Partial<Row> & { id: number; roomId: number; visitDate: string | Date }) {
  const visitDate = overrides.visitDate instanceof Date ? overrides.visitDate : new Date(`${overrides.visitDate}T00:00:00.000Z`);
  const row: Row = {
    guestName: 'Khách E2E',
    guestPhone: '0912340000',
    timeSlot: 'MORNING',
    note: null,
    source: 'MANUAL',
    status: 'NEW',
    handledById: null,
    outcomeNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
    visitDate,
  };
  rows.push(row);
  return row;
}

async function expectHttpError(promise: Promise<unknown>, status: number, field?: string) {
  try {
    await promise;
    throw new Error('should have thrown');
  } catch (e: any) {
    expect(e.getStatus()).toBe(status);
    if (field) {
      const res = e.getResponse();
      expect(res.fields?.[field]).toBeTruthy();
    }
    return e;
  }
}

describe('CP-4 (BE-P2-32) · ViewingsService.create (VIEW-03)', () => {
  it('VIEW-03 happy: MANAGER creates a manual viewing for an active room in their own building', async () => {
    const { prisma } = makePrisma([]);
    const service = new ViewingsService(prisma);
    const dto: CreateViewingDto = {
      roomId: 101,
      guestName: 'Nguyễn Văn B',
      guestPhone: '0912345671',
      visitDate: TOMORROW,
      timeSlot: 'MORNING',
    };
    const res = await service.create(MANAGER_10, dto);
    expect(res.source).toBe('MANUAL');
    expect(res.status).toBe('NEW');
    expect(res.handledById).toBe(MANAGER_10.id);
    expect(res.roomId).toBe(101);
  });

  it('VIEW-03: room is_active=false → 409 CONFLICT_STATE', async () => {
    const { prisma } = makePrisma([]);
    const service = new ViewingsService(prisma);
    const dto: CreateViewingDto = { roomId: 102, guestName: 'A', guestPhone: '0912345672', visitDate: TOMORROW, timeSlot: 'MORNING' };
    await expectHttpError(service.create(MANAGER_10, dto), 409);
  });

  it('VIEW-03: room of a different building (MANAGER) → 403 OUT_OF_SCOPE', async () => {
    const { prisma } = makePrisma([]);
    const service = new ViewingsService(prisma);
    const dto: CreateViewingDto = { roomId: 103, guestName: 'A', guestPhone: '0912345673', visitDate: TOMORROW, timeSlot: 'MORNING' };
    await expectHttpError(service.create(MANAGER_10, dto), 403);
  });

  it('VIEW-03: room does not exist → 404 NOT_FOUND', async () => {
    const { prisma } = makePrisma([]);
    const service = new ViewingsService(prisma);
    const dto: CreateViewingDto = { roomId: 999999, guestName: 'A', guestPhone: '0912345674', visitDate: TOMORROW, timeSlot: 'MORNING' };
    await expectHttpError(service.create(MANAGER_10, dto), 404);
  });

  it('VIEW-03 + BLD-06 + Q-P6-1=B: BOSS can create a manual viewing for an active room of a locked building', async () => {
    const { prisma } = makePrisma([]);
    const service = new ViewingsService(prisma);
    const dto: CreateViewingDto = { roomId: 104, guestName: 'A', guestPhone: '0912345675', visitDate: TOMORROW, timeSlot: 'MORNING' };
    const res = await service.create(BOSS, dto);
    expect(res.status).toBe('NEW');
    expect(res.handledById).toBe(BOSS.id);
  });

  it('VIEW-03 + BLD-06 + Q-P6-1=B: the locked building’s former MANAGER (no longer in scope) is 403 OUT_OF_SCOPE', async () => {
    const { prisma } = makePrisma([]);
    const service = new ViewingsService(prisma);
    const dto: CreateViewingDto = { roomId: 104, guestName: 'A', guestPhone: '0912345676', visitDate: TOMORROW, timeSlot: 'MORNING' };
    await expectHttpError(service.create(MANAGER_10, dto), 403);
  });

  it('VIEW-03/VIEW-08: visitDate = today+31 on create → 400 fields.visitDate; today and today+30 are accepted', async () => {
    const { prisma } = makePrisma([]);
    const service = new ViewingsService(prisma);
    await expectHttpError(
      service.create(MANAGER_10, { roomId: 101, guestName: 'A', guestPhone: '0912345677', visitDate: PLUS31, timeSlot: 'MORNING' }),
      400,
      'visitDate',
    );
    await expect(
      service.create(MANAGER_10, { roomId: 101, guestName: 'A', guestPhone: '0912345678', visitDate: PLUS30, timeSlot: 'MORNING' }),
    ).resolves.toMatchObject({ status: 'NEW' });
  });
});

describe('CP-4 (BE-P2-32) · ViewingsService.update (VIEW-04, VIEW-09, Q-P6-3)', () => {
  function setupWith(status: string, extra: Partial<Row> = {}) {
    const rows: Row[] = [];
    addRow(rows, { id: 1, roomId: 101, status, visitDate: TOMORROW, timeSlot: 'MORNING', ...extra });
    const { prisma } = makePrisma(rows);
    return { service: new ViewingsService(prisma), rows, prisma };
  }

  it('Q4-WON: status=WON is 409 CONFLICT_STATE, never 400 (NEW → WON is not an allowed PATCH move)', async () => {
    const { service } = setupWith('NEW');
    await expectHttpError(service.update(BOSS, 1, { status: 'WON' } as UpdateViewingDto), 409);
  });

  it('VIEW-04: NEW → LOST → 409 CONFLICT_STATE (LOST only reachable from CONFIRMED)', async () => {
    const { service } = setupWith('NEW');
    await expectHttpError(service.update(BOSS, 1, { status: 'LOST', outcomeNote: 'Khách không đến' } as UpdateViewingDto), 409);
  });

  it('VIEW-04: CONFIRMED → LOST without outcomeNote → 400 fields.outcomeNote', async () => {
    const { service } = setupWith('CONFIRMED');
    await expectHttpError(service.update(BOSS, 1, { status: 'LOST' } as UpdateViewingDto), 400, 'outcomeNote');
  });

  it('VIEW-04: CONFIRMED → LOST with outcomeNote → 200, status and note saved', async () => {
    const { service } = setupWith('CONFIRMED');
    const res = await service.update(MANAGER_10, 1, { status: 'LOST', outcomeNote: 'Khách đổi ý' } as UpdateViewingDto);
    expect(res.status).toBe('LOST');
    expect(res.outcomeNote).toBe('Khách đổi ý');
    expect(res.handledById).toBe(MANAGER_10.id);
  });

  it('VIEW-04: NEW → CONFIRMED → 200, handledById is the caller', async () => {
    const { service } = setupWith('NEW');
    const res = await service.update(MANAGER_10, 1, { status: 'CONFIRMED' } as UpdateViewingDto);
    expect(res.status).toBe('CONFIRMED');
    expect(res.handledById).toBe(MANAGER_10.id);
  });

  it('VIEW-04: CANCELLED → CONFIRMED → 409 CONFLICT_STATE (CANCELLED has no outgoing move)', async () => {
    const { service } = setupWith('CANCELLED');
    await expectHttpError(service.update(BOSS, 1, { status: 'CONFIRMED' } as UpdateViewingDto), 409);
  });

  it('VIEW-04: WON → anything (e.g. CANCELLED) → 409 CONFLICT_STATE', async () => {
    const { service } = setupWith('WON');
    await expectHttpError(service.update(BOSS, 1, { status: 'CANCELLED' } as UpdateViewingDto), 409);
  });

  it('Q-P6-3=A: NEW → CANCELLED without outcomeNote → 200, outcomeNote stays null', async () => {
    const { service } = setupWith('NEW');
    const res = await service.update(BOSS, 1, { status: 'CANCELLED' } as UpdateViewingDto);
    expect(res.status).toBe('CANCELLED');
    expect(res.outcomeNote).toBeNull();
  });

  it('Q-P6-3=A: CONFIRMED → CANCELLED with outcomeNote → 200, outcomeNote is saved', async () => {
    const { service } = setupWith('CONFIRMED');
    const res = await service.update(BOSS, 1, { status: 'CANCELLED', outcomeNote: 'Khách hủy' } as UpdateViewingDto);
    expect(res.status).toBe('CANCELLED');
    expect(res.outcomeNote).toBe('Khách hủy');
  });

  it('VIEW-09: NEW allows changing visitDate/timeSlot → 200', async () => {
    const { service } = setupWith('NEW');
    const res = await service.update(BOSS, 1, { visitDate: PLUS30, timeSlot: 'EVENING' } as UpdateViewingDto);
    expect(res.visitDate).toBe(PLUS30);
    expect(res.timeSlot).toBe('EVENING');
  });

  it('VIEW-09: CONFIRMED allows changing visitDate/timeSlot → 200', async () => {
    const { service } = setupWith('CONFIRMED');
    const res = await service.update(BOSS, 1, { timeSlot: 'EVENING' } as UpdateViewingDto);
    expect(res.timeSlot).toBe('EVENING');
  });

  it.each(['WON', 'LOST', 'CANCELLED'])('VIEW-09: %s refuses a visitDate/timeSlot change → 409 CONFLICT_STATE', async (status) => {
    const { service } = setupWith(status);
    await expectHttpError(service.update(BOSS, 1, { timeSlot: 'EVENING' } as UpdateViewingDto), 409);
  });

  it('VIEW-09/VIEW-08: moving visitDate to today+31 → 400 fields.visitDate', async () => {
    const { service } = setupWith('NEW');
    await expectHttpError(service.update(BOSS, 1, { visitDate: PLUS31 } as UpdateViewingDto), 400, 'visitDate');
  });

  it('[ASSUMPTION 12] a NEW viewing stuck at yesterday, PATCH with only timeSlot → 400 fields.visitDate (current date carried over still fails VIEW-08)', async () => {
    const { service } = setupWith('NEW', { visitDate: new Date(`${YESTERDAY}T00:00:00.000Z`) });
    await expectHttpError(service.update(BOSS, 1, { timeSlot: 'EVENING' } as UpdateViewingDto), 400, 'visitDate');
  });

  it('[ASSUMPTION 12] the same stale viewing, PATCH with both visitDate and timeSlot → 200', async () => {
    const { service } = setupWith('NEW', { visitDate: new Date(`${YESTERDAY}T00:00:00.000Z`) });
    const res = await service.update(BOSS, 1, { visitDate: TOMORROW, timeSlot: 'EVENING' } as UpdateViewingDto);
    expect(res.visitDate).toBe(TOMORROW);
    expect(res.timeSlot).toBe('EVENING');
  });

  it('[ASSUMPTION 12] editing only note on a LOST viewing → 200 (VIEW-08 is not applied, note is not date/slot)', async () => {
    const { service } = setupWith('LOST', { outcomeNote: 'Đã gọi' });
    const res = await service.update(BOSS, 1, { note: 'khách gọi lại' } as UpdateViewingDto);
    expect(res.status).toBe('LOST');
    expect(res.note).toBe('khách gọi lại');
  });

  it('SCOPE-02: PATCH on a viewing of another building (MANAGER) → 403 OUT_OF_SCOPE', async () => {
    const rows: Row[] = [];
    addRow(rows, { id: 1, roomId: 103, status: 'NEW', visitDate: TOMORROW, timeSlot: 'MORNING' });
    const { prisma } = makePrisma(rows);
    const service = new ViewingsService(prisma);
    await expectHttpError(service.update(MANAGER_10, 1, { status: 'CONFIRMED' } as UpdateViewingDto), 403);
  });

  it('VIEW-04: a concurrent status change (updateMany returns 0 rows) → 409 CONFLICT_STATE', async () => {
    const { service, prisma } = setupWith('NEW');
    // Simulate someone else flipping the status between the read and the conditional update.
    prisma.viewing.updateMany = vi.fn(async () => ({ count: 0 }));
    await expectHttpError(service.update(BOSS, 1, { status: 'CONFIRMED' } as UpdateViewingDto), 409);
  });

  it('PATCH on a non-existent viewing → 404 NOT_FOUND', async () => {
    const { prisma } = makePrisma([]);
    const service = new ViewingsService(prisma);
    await expectHttpError(service.update(BOSS, 999, { status: 'CONFIRMED' } as UpdateViewingDto), 404);
  });
});

describe('CP-4 (BE-P2-32) · ViewingsService.list (GET /viewings, SCOPE-02/API-08)', () => {
  it('[ASSUMPTION 14] slot order: MORNING < AFTERNOON < EVENING for the same date, regardless of insertion/DB-alphabetical order', async () => {
    const rows: Row[] = [];
    // Inserted in EVENING, MORNING, AFTERNOON order so ids are 1=EVENING, 2=MORNING, 3=AFTERNOON.
    addRow(rows, { id: 1, roomId: 101, visitDate: TOMORROW, timeSlot: 'EVENING' });
    addRow(rows, { id: 2, roomId: 101, visitDate: TOMORROW, timeSlot: 'MORNING' });
    addRow(rows, { id: 3, roomId: 101, visitDate: TOMORROW, timeSlot: 'AFTERNOON' });
    const { prisma } = makePrisma(rows);
    const service = new ViewingsService(prisma);
    const res = await service.list(BOSS, {} as ViewingsQueryDto);
    expect(res.data.map((v) => v.timeSlot)).toEqual(['MORNING', 'AFTERNOON', 'EVENING']);
    expect(res.data.map((v) => v.id)).toEqual([2, 3, 1]);
  });

  it('[ASSUMPTION 14] an earlier visitDate always sorts before a later one, regardless of slot', async () => {
    const rows: Row[] = [];
    addRow(rows, { id: 1, roomId: 101, visitDate: PLUS30, timeSlot: 'MORNING' });
    addRow(rows, { id: 2, roomId: 101, visitDate: TODAY_STR, timeSlot: 'EVENING' });
    const { prisma } = makePrisma(rows);
    const service = new ViewingsService(prisma);
    const res = await service.list(BOSS, {} as ViewingsQueryDto);
    expect(res.data.map((v) => v.id)).toEqual([2, 1]);
  });

  it('[ASSUMPTION 14] same date, same slot → tiebreak by ascending id', async () => {
    const rows: Row[] = [];
    addRow(rows, { id: 5, roomId: 101, visitDate: TOMORROW, timeSlot: 'MORNING' });
    addRow(rows, { id: 2, roomId: 101, visitDate: TOMORROW, timeSlot: 'MORNING' });
    const { prisma } = makePrisma(rows);
    const service = new ViewingsService(prisma);
    const res = await service.list(BOSS, {} as ViewingsQueryDto);
    expect(res.data.map((v) => v.id)).toEqual([2, 5]);
  });

  it('SCOPE-02/API-08: MANAGER without buildingId sees only viewings of buildings in scope', async () => {
    const rows: Row[] = [];
    addRow(rows, { id: 1, roomId: 101, visitDate: TOMORROW }); // building 10, in scope
    addRow(rows, { id: 2, roomId: 103, visitDate: TOMORROW }); // building 20, out of scope for MANAGER_10
    const { prisma } = makePrisma(rows);
    const service = new ViewingsService(prisma);
    const res = await service.list(MANAGER_10, {} as ViewingsQueryDto);
    expect(res.data.map((v) => v.id)).toEqual([1]);
  });

  it('SCOPE-02/API-08: MANAGER with 2 buildings sees both; BOSS sees every building incl. a locked one', async () => {
    const rows: Row[] = [];
    addRow(rows, { id: 1, roomId: 101, visitDate: TOMORROW }); // 10
    addRow(rows, { id: 2, roomId: 103, visitDate: TOMORROW }); // 20
    addRow(rows, { id: 3, roomId: 104, visitDate: TOMORROW }); // 30, locked
    const { prisma } = makePrisma(rows);
    const service = new ViewingsService(prisma);
    const manager = await service.list(MANAGER_1020, {} as ViewingsQueryDto);
    expect(manager.data.map((v) => v.id).sort()).toEqual([1, 2]);
    const boss = await service.list(BOSS, {} as ViewingsQueryDto);
    expect(boss.data.map((v) => v.id).sort()).toEqual([1, 2, 3]);
  });

  it('SCOPE-02: ?buildingId of a building outside MANAGER scope → 403 OUT_OF_SCOPE', async () => {
    const { prisma } = makePrisma([]);
    const service = new ViewingsService(prisma);
    await expectHttpError(service.list(MANAGER_10, { buildingId: 30 } as ViewingsQueryDto), 403);
  });

  it('status=NEW filters out every other status', async () => {
    const rows: Row[] = [];
    addRow(rows, { id: 1, roomId: 101, visitDate: TOMORROW, status: 'NEW' });
    addRow(rows, { id: 2, roomId: 101, visitDate: TOMORROW, status: 'CONFIRMED' });
    const { prisma } = makePrisma(rows);
    const service = new ViewingsService(prisma);
    const res = await service.list(BOSS, { status: 'NEW' } as ViewingsQueryDto);
    expect(res.data.map((v) => v.id)).toEqual([1]);
  });

  it('from/to filter visitDate inclusive of both ends', async () => {
    const d1 = formatDateOnly(addDays(TODAY, 1));
    const d2 = formatDateOnly(addDays(TODAY, 2));
    const d3 = formatDateOnly(addDays(TODAY, 3));
    const rows: Row[] = [];
    addRow(rows, { id: 1, roomId: 101, visitDate: d1 });
    addRow(rows, { id: 2, roomId: 101, visitDate: d2 });
    addRow(rows, { id: 3, roomId: 101, visitDate: d3 });
    const { prisma } = makePrisma(rows);
    const service = new ViewingsService(prisma);
    const res = await service.list(BOSS, { from: d1, to: d2 } as ViewingsQueryDto);
    expect(res.data.map((v) => v.id)).toEqual([1, 2]);
  });

  it('from > to → data: [] (no error, just an empty window)', async () => {
    const d1 = formatDateOnly(addDays(TODAY, 1));
    const d2 = formatDateOnly(addDays(TODAY, 2));
    const rows: Row[] = [];
    addRow(rows, { id: 1, roomId: 101, visitDate: d1 });
    const { prisma } = makePrisma(rows);
    const service = new ViewingsService(prisma);
    const res = await service.list(BOSS, { from: d2, to: d1 } as ViewingsQueryDto);
    expect(res.data).toEqual([]);
  });

  it('from with an impossible calendar date (2026-02-30) → 400 fields.from', async () => {
    const { prisma } = makePrisma([]);
    const service = new ViewingsService(prisma);
    await expectHttpError(service.list(BOSS, { from: '2026-02-30' } as ViewingsQueryDto), 400, 'from');
  });

  it('pagination meta: total reflects the filtered set, data is paged by limit/page', async () => {
    const rows: Row[] = [];
    for (let i = 1; i <= 3; i++) addRow(rows, { id: i, roomId: 101, visitDate: TOMORROW });
    const { prisma } = makePrisma(rows);
    const service = new ViewingsService(prisma);
    const res = await service.list(BOSS, { page: 2, limit: 1 } as ViewingsQueryDto);
    expect(res.meta).toEqual({ page: 2, limit: 1, total: 3 });
    expect(res.data).toHaveLength(1);
  });

  it('VIEW-10: statusLabel and timeSlotLabel use the exact Vietnamese text of 13-viewings.md', async () => {
    const rows: Row[] = [];
    addRow(rows, { id: 1, roomId: 101, visitDate: TOMORROW, timeSlot: 'AFTERNOON', status: 'CONFIRMED' });
    const { prisma } = makePrisma(rows);
    const service = new ViewingsService(prisma);
    const res = await service.list(BOSS, {} as ViewingsQueryDto);
    expect(res.data[0].timeSlotLabel).toBe('Chiều (14:00–17:00)');
    expect(res.data[0].statusLabel).toBe('Đã xác nhận');
  });
});
