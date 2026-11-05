import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MustChangePasswordGuard } from '../../common/guards/must-change-password.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { RoomsModule } from './rooms.module.js';

// CP-1 (BE-P2-29) · PUB-01, ROOM-05, BLD-05, API-02: /public/rooms, /public/featured-rooms HTTP contract.
// Prisma is the external database edge; real guards, ValidationPipe, PublicRoomsController,
// PublicRoomsService, public-room/public-view/public-price-order helpers, error filter and
// response interceptor all run through an HTTP server. Nothing in the unit under test is mocked.

const d = (s: string): Date => new Date(`${s}T00:00:00Z`);

function ratePlans(effectiveFrom: Date) {
  return [
    { kind: 'ELECTRIC', status: 'APPROVED', effectiveFrom },
    { kind: 'WATER', status: 'APPROVED', effectiveFrom },
  ];
}
function building(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    isActive: true, ratePlans: ratePlans(d('2026-01-01')),
    code: 'DD01', name: 'Dương Đình 1', district: 'Cầu Giấy', ward: 'Dịch Vọng',
    ...overrides,
  };
}
const BUILD_DD = building();
const BUILD_HK = building({ code: 'HK01', name: 'Hàng Khay 1', district: 'Hoàn Kiếm', ward: 'Hàng Bạc' });
// R2-1/BLD-05: only ELECTRIC approved -> missing WATER -> no room of this building is ever public.
const BUILD_NORATE = building({
  code: 'NR01', name: 'Chưa đủ giá', district: 'Cầu Giấy', ward: 'Dịch Vọng',
  ratePlans: [{ kind: 'ELECTRIC', status: 'APPROVED', effectiveFrom: d('2026-01-01') }],
});

function room(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1, code: 'X', floor: 1, areaM2: 20, price: 2_000_000, maxOccupants: 2,
    isActive: true, underMaintenance: false, contracts: [] as { status: string }[],
    images: [] as { url: string; sortOrder: number }[],
    buildingId: 10, building: BUILD_DD,
    ...overrides,
  };
}

// Public rooms: 101, 102, 201, 301..304 (7 total). Hidden: 103 (price null), 104 (maintenance),
// 105 (locked), 106 (HOLD contract), 107 (building missing WATER).
const ROOMS = [
  room({ id: 101, code: 'A101', price: 3_000_000, images: [{ url: 'https://img/101.jpg', sortOrder: 0 }] }),
  room({ id: 102, code: 'A102', price: 1_000_000 }),
  room({ id: 103, code: 'A103', price: null }),
  room({ id: 104, code: 'A104', underMaintenance: true }),
  room({ id: 105, code: 'A105', isActive: false }),
  room({ id: 106, code: 'A106', contracts: [{ status: 'HOLD' }] }),
  room({ id: 107, code: 'N107', buildingId: 30, building: BUILD_NORATE }),
  room({ id: 201, code: 'B201', buildingId: 12, building: BUILD_HK, price: 5_000_000 }),
  room({ id: 301, code: 'A301', price: 1_500_000 }),
  room({ id: 302, code: 'A302', price: 1_600_000 }),
  room({ id: 303, code: 'A303', price: 1_700_000 }),
  room({ id: 304, code: 'A304', price: 1_800_000 }),
];

// reviewedAt, newest first: 101 > 201 > 301 > 302 > 303 > 304 > 102 (102 is oldest, excluded from top 6).
const PRICES = [
  { id: 1, roomId: 101, status: 'APPROVED', effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-03-01') },
  { id: 2, roomId: 201, status: 'APPROVED', effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-02-01') },
  { id: 3, roomId: 301, status: 'APPROVED', effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-01-20') },
  { id: 4, roomId: 302, status: 'APPROVED', effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-01-15') },
  { id: 5, roomId: 303, status: 'APPROVED', effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-01-10') },
  { id: 6, roomId: 304, status: 'APPROVED', effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-01-05') },
  { id: 7, roomId: 102, status: 'APPROVED', effectiveFrom: d('2026-01-01'), reviewedAt: d('2026-01-01') },
];

function compareVal(value: unknown, target: unknown): number {
  const a = value instanceof Date ? value.getTime() : (value as number);
  const b = target instanceof Date ? target.getTime() : (target as number);
  return a - b;
}

// Same generic where-evaluator style as src/common/rooms/public-room.spec.ts (equality, {not},
// {in}, {gte}, {lte}, relation {some}/{none}, AND, nested plain objects), extended with {gte}
// and plain-number {lte} so minPrice/maxPrice can be exercised the same way.
function matches(row: unknown, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Record<string, unknown>[]).every((c) => matches(row, c));
    const value = (row as Record<string, unknown>)[key];
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ('not' in c) return value !== c.not;
      if ('in' in c) return (c.in as unknown[]).includes(value);
      if ('gte' in c) return compareVal(value, c.gte) >= 0;
      if ('lte' in c) return compareVal(value, c.lte) <= 0;
      if ('none' in c) return !(value as unknown[]).some((item) => matches(item, c.none as Record<string, unknown>));
      if ('some' in c) return (value as unknown[]).some((item) => matches(item, c.some as Record<string, unknown>));
      return matches(value, c);
    }
    return value === cond;
  });
}

function applyOrderBy(rows: typeof ROOMS, orderBy: Record<string, 'asc' | 'desc'>[]): typeof ROOMS {
  return [...rows].sort((a, b) => {
    for (const ord of orderBy) {
      const [key, dir] = Object.entries(ord)[0] as [string, 'asc' | 'desc'];
      const av = (a as any)[key];
      const bv = (b as any)[key];
      if (av !== bv) return dir === 'asc' ? av - bv : bv - av;
    }
    return 0;
  });
}

function toIncludeShape(r: (typeof ROOMS)[number]) {
  return {
    id: r.id, code: r.code, floor: r.floor, areaM2: r.areaM2, price: r.price, maxOccupants: r.maxOccupants,
    buildingId: r.buildingId,
    building: { code: r.building.code, name: r.building.name, district: r.building.district, ward: r.building.ward },
    images: [...r.images].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 1).map((i) => ({ url: i.url })),
  };
}

describe('CP-1 (BE-P2-29) · /public/rooms, /public/featured-rooms HTTP contract', () => {
  let app: INestApplication;

  const roomFindMany = vi.fn(async ({ where, select, orderBy, skip, take }: any) => {
    let rows = ROOMS.filter((r) => matches(r, where));
    if (orderBy) rows = applyOrderBy(rows, orderBy);
    if (skip !== undefined) rows = rows.slice(skip, skip + (take ?? rows.length));
    else if (take !== undefined) rows = rows.slice(0, take);
    if (select && Object.keys(select).length === 1 && select.id) return rows.map((r) => ({ id: r.id }));
    return rows.map(toIncludeShape);
  });
  const roomCount = vi.fn(async ({ where }: any) => ROOMS.filter((r) => matches(r, where)).length);
  const roomPriceFindMany = vi.fn(async ({ where }: any) =>
    PRICES.filter((p) =>
      (where.roomId.in as number[]).includes(p.roomId) &&
      p.status === where.status &&
      p.effectiveFrom.getTime() <= where.effectiveFrom.lte.getTime(),
    ),
  );

  const db: any = {
    room: { findMany: roomFindMany, count: roomCount },
    roomPrice: { findMany: roomPriceFindMany },
    building: { findMany: vi.fn(async () => []) },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'draft-only-test-secret-never-used-outside-this-process';
    const testingModule = Test.createTestingModule({
      imports: [JwtModule.register({}), RoomsModule],
      providers: [
        TokenService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: MustChangePasswordGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    });
    testingModule.overrideProvider(PrismaService).useValue(db);
    const moduleRef = await testingModule.compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => { await app.close(); delete process.env.JWT_SECRET; });
  beforeEach(() => { roomFindMany.mockClear(); roomCount.mockClear(); roomPriceFindMany.mockClear(); });

  it('PUB-01/ROOM-05: GET /public/rooms returns only public rooms, each with a non-null numeric price, and meta.total', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms').expect(200);
    expect(res.body.meta.total).toBe(7);
    expect(res.body.data).toHaveLength(7);
    for (const item of res.body.data) {
      expect(typeof item.price).toBe('number');
      expect(item.price).not.toBeNull();
    }
    expect(res.body.data.map((r: any) => r.code).sort()).not.toContain('A103'); // price = null
    expect(res.body.data.map((r: any) => r.code).sort()).not.toContain('A104'); // under maintenance
    expect(res.body.data.map((r: any) => r.code).sort()).not.toContain('A105'); // locked
    expect(res.body.data.map((r: any) => r.code).sort()).not.toContain('A106'); // HOLD contract
    expect(res.body.data.map((r: any) => r.code).sort()).not.toContain('N107'); // building missing WATER
  });

  it('ROOM-05/BLD-05: a building missing one of ELECTRIC/WATER contributes zero rooms, even filtered to it directly', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms?buildingId=30').expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('PUB-01: default sort is price ascending', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms').expect(200);
    expect(res.body.data.map((r: any) => r.price)).toEqual([
      1_000_000, 1_500_000, 1_600_000, 1_700_000, 1_800_000, 3_000_000, 5_000_000,
    ]);
  });

  it('PUB-01: sort=-price is descending', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms?sort=-price').expect(200);
    expect(res.body.data.map((r: any) => r.price)).toEqual([
      5_000_000, 3_000_000, 1_800_000, 1_700_000, 1_600_000, 1_500_000, 1_000_000,
    ]);
  });

  it('PUB-01: sort=newest orders by the current price\'s reviewedAt desc; ties on effective_from already covered in public-price-order.spec.ts', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms?sort=newest').expect(200);
    expect(res.body.data.map((r: any) => r.id)).toEqual([101, 201, 301, 302, 303, 304, 102]);
  });

  it('PUB-01: /public/featured-rooms returns at most 6 items, newest first, dropping the stalest one', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/featured-rooms').expect(200);
    expect(res.body.data).toHaveLength(6);
    expect(res.body.data.map((r: any) => r.id)).toEqual([101, 201, 301, 302, 303, 304]);
    expect(res.body.data.map((r: any) => r.id)).not.toContain(102);
  });

  it('API-08/PUB-01: buildingId filters correctly and excludes other buildings', async () => {
    const dd = await request(app.getHttpServer()).get('/api/v1/public/rooms?buildingId=10').expect(200);
    expect(dd.body.meta.total).toBe(6);
    expect(dd.body.data.every((r: any) => r.buildingId === 10)).toBe(true);

    const hk = await request(app.getHttpServer()).get('/api/v1/public/rooms?buildingId=12').expect(200);
    expect(hk.body.meta.total).toBe(1);
    expect(hk.body.data[0].code).toBe('B201');
  });

  it('PUB-01: district/ward filters scope to the matching building only', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/rooms').query({ district: 'Cầu Giấy' }).expect(200);
    expect(res.body.meta.total).toBe(6);
    expect(res.body.data.every((r: any) => r.district === 'Cầu Giấy')).toBe(true);
  });

  it('Biên: minPrice > maxPrice yields an empty list with total = 0', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/rooms?minPrice=5000000&maxPrice=1000000').expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('Biên: minPrice = 0 includes every public room (does not filter anything out)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms?minPrice=0').expect(200);
    expect(res.body.meta.total).toBe(7);
  });

  it('Biên: minPrice/maxPrice band selects only the rooms inside it', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/rooms?minPrice=2000000&maxPrice=4000000').expect(200);
    expect(res.body.data.map((r: any) => r.code)).toEqual(['A101']);
  });

  it('Biên: last page of a filtered list has fewer rows than the limit', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/rooms?buildingId=10&limit=4&page=2').expect(200);
    expect(res.body.meta).toEqual({ page: 2, limit: 4, total: 6 });
    expect(res.body.data).toHaveLength(2);
  });

  it('Biên: limit=100 is accepted, limit=101 is rejected as VALIDATION_FAILED', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/rooms?limit=100').expect(200);
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms?limit=101').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.limit).toBeDefined();
  });

  it('PUB-01: an invalid sort value is rejected as VALIDATION_FAILED on `fields.sort`', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms?sort=bogus').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.sort).toBeDefined();
  });

  it('API-04: a non-integer buildingId is rejected as VALIDATION_FAILED on `fields.buildingId`', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms?buildingId=abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.buildingId).toBeDefined();
  });

  it('PUB-04: a list item exposes only the public contract fields, nothing from staff-only data', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms?buildingId=10&limit=1').expect(200);
    expect(Object.keys(res.body.data[0]).sort()).toEqual([
      'areaM2', 'buildingCode', 'buildingId', 'buildingName', 'code', 'district', 'floor',
      'id', 'imageUrl', 'maxOccupants', 'price', 'ward',
    ]);
  });

  it('Quyền: /public/rooms and /public/featured-rooms are reachable with no Authorization header and with a garbage one', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/rooms').expect(200);
    await request(app.getHttpServer()).get('/api/v1/public/rooms').set('Authorization', 'Bearer not-a-real-token').expect(200);
    await request(app.getHttpServer()).get('/api/v1/public/featured-rooms').set('Authorization', 'garbage').expect(200);
  });
});
