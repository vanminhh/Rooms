import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { todayHanoi, addDays, formatDateOnly } from '../../common/date/today.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MustChangePasswordGuard } from '../../common/guards/must-change-password.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { publicRoomWhere } from '../../common/rooms/public-room.js';
import { TokenService } from '../auth/token.service.js';
import { RoomsModule } from './rooms.module.js';

// CP-2 (BE-P2-30) · PUB-02, PUB-03, PUB-04, ROOM-08, BLD-04, A-05: GET /public/rooms/:id HTTP contract.
// Prisma + the Setting table (for the default contact fallback) are the external edges, both mocked.
// Real guards, ValidationPipe, PublicRoomsController, PublicRoomsService, ratesAt/ratesAfter,
// loadPublicRates, buildEstimate, BuildingContactService and the response interceptor all run through
// an HTTP server. Nothing in the unit under test is mocked.

const d = (s: string): Date => new Date(`${s}T00:00:00Z`);
// Real clock, same call as the service makes (todayHanoi()); avoids any drift between test and service time.
const today = todayHanoi();

function room(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 101, code: 'A101', floor: 3, areaM2: 22.5, maxOccupants: 2,
    furniture: ['Giường', 'Tủ lạnh'], description: 'Phòng góc, nhiều nắng',
    price: 2_500_000, buildingId: 10,
    images: [] as { id: number; url: string; sortOrder: number }[],
    building: buildingRow(),
    ...overrides,
  };
}
function buildingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10, code: 'DD01', name: 'Dương Đình 1', address: '12 Dương Đình Nghệ',
    district: 'Cầu Giấy', ward: 'Dịch Vọng', waterMode: 'PER_M3', amenities: ['Thang máy'],
    description: 'Tòa mới xây', managerId: 5,
    manager: { isActive: true, contactPhone: '0901111111', zaloUrl: 'https://zalo/a', facebookUrl: null },
    ...overrides,
  };
}

function ratePlan(kind: 'ELECTRIC' | 'WATER' | 'SERVICE', overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1, buildingId: 10, kind, serviceId: null, effectiveFrom: d('2026-01-01'), status: 'APPROVED', reviewedAt: null,
    tiers: [{ tierNo: 1, upTo: null, unitPrice: 3_500 }],
    ...overrides,
  };
}

describe('CP-2 (BE-P2-30) · GET /public/rooms/:id HTTP contract', () => {
  let app: INestApplication;
  let roomRow: ReturnType<typeof room> | null;
  let ratePlanRows: ReturnType<typeof ratePlan>[];
  let serviceRows: { id: number; name: string; unit: 'ROOM' | 'PERSON' | 'VEHICLE'; buildingId: number; isActive: boolean }[];
  let defaultContactRow: { key: string; value: unknown } | null;

  const roomFindFirst = vi.fn(async ({ where }: any) => (roomRow && where.id === roomRow.id ? roomRow : null));
  const ratePlanFindMany = vi.fn(async ({ where }: any) => {
    const rows = ratePlanRows.filter((p) => p.buildingId === where.buildingId && p.status === where.status);
    if ('lte' in where.effectiveFrom) return rows.filter((p) => p.effectiveFrom.getTime() <= where.effectiveFrom.lte.getTime());
    return rows.filter((p) => p.effectiveFrom.getTime() > where.effectiveFrom.gt.getTime());
  });
  const serviceFindMany = vi.fn(async ({ where }: any) =>
    serviceRows.filter((s) => s.buildingId === where.buildingId && s.isActive === where.isActive),
  );
  const settingFindUnique = vi.fn(async ({ where }: any) => (where.key === 'default_contact' ? defaultContactRow : null));

  const db: any = {
    room: { findFirst: roomFindFirst },
    ratePlan: { findMany: ratePlanFindMany },
    service: { findMany: serviceFindMany },
    setting: { findUnique: settingFindUnique },
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
  beforeEach(() => {
    roomRow = room();
    ratePlanRows = [ratePlan('ELECTRIC'), ratePlan('WATER')];
    serviceRows = [];
    defaultContactRow = { key: 'default_contact', value: { phone: '0900000000', zaloUrl: null, facebookUrl: null } };
    roomFindFirst.mockClear(); ratePlanFindMany.mockClear(); serviceFindMany.mockClear(); settingFindUnique.mockClear();
  });

  it('PUB-02: queries room.findFirst with exactly { id, ...publicRoomWhere(today) } (no ad hoc public filter)', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    const call = roomFindFirst.mock.calls.at(-1)?.[0] as any;
    expect(call.where).toEqual({ id: 101, ...publicRoomWhere(today) });
  });

  it('PUB-02: a room id that does not exist or is not public gives the same 404 NOT_FOUND body', async () => {
    roomRow = null;
    const missing = await request(app.getHttpServer()).get('/api/v1/public/rooms/999').expect(404);
    const notPublic = await request(app.getHttpServer()).get('/api/v1/public/rooms/999').expect(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect(missing.body).toEqual(notPublic.body);
  });

  it('ROOM-08 PER_M3 end-to-end: price + Wifi (ROOM) + Rác (PERSON × 1), electric/water-m3 excluded; deposit = price', async () => {
    serviceRows = [
      { id: 1, name: 'Wifi', unit: 'ROOM', buildingId: 10, isActive: true },
      { id: 2, name: 'Rác', unit: 'PERSON', buildingId: 10, isActive: true },
    ];
    ratePlanRows.push(
      ratePlan('SERVICE', { id: 11, serviceId: 1, tiers: [{ tierNo: 1, upTo: null, unitPrice: 100_000 }] }),
      ratePlan('SERVICE', { id: 12, serviceId: 2, tiers: [{ tierNo: 1, upTo: null, unitPrice: 50_000 }] }),
    );
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    // Hand calc: 2_500_000 (giá thuê) + 100_000 (Wifi) + 50_000 (Rác × 1 người) = 2_650_000.
    expect(res.body.data.monthlyEstimate).toBe(2_650_000);
    expect(res.body.data.deposit).toBe(2_500_000);
    expect(res.body.data.estimate.meteredNote).toMatch(/điện, nước/);
    expect(res.body.data.rates.electric).not.toBeNull();
    expect(res.body.data.rates.water).not.toBeNull();
  });

  it('ROOM-08 PER_PERSON end-to-end: water tier-1 unit price × 1 person is added on top', async () => {
    roomRow = room({ building: buildingRow({ waterMode: 'PER_PERSON' }) });
    ratePlanRows = [ratePlan('ELECTRIC'), ratePlan('WATER', { tiers: [{ tierNo: 1, upTo: null, unitPrice: 80_000 }] })];
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    // Hand calc: 2_500_000 + 80_000 (nước 1 người) = 2_580_000.
    expect(res.body.data.monthlyEstimate).toBe(2_580_000);
  });

  it('SVC-04: an active service with no rate in effect is excluded from the total and listed in estimate.missing; a locked service never reaches the query at all', async () => {
    serviceRows = [{ id: 3, name: 'Thang máy', unit: 'ROOM', buildingId: 10, isActive: true }];
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    expect(res.body.data.monthlyEstimate).toBe(2_500_000);
    expect(res.body.data.estimate.missing).toEqual(['chưa gồm: Thang máy (chưa có giá)']);
    const serviceCall = serviceFindMany.mock.calls.at(-1)?.[0] as any;
    expect(serviceCall.where.isActive).toBe(true); // locked services are excluded at the query, not filtered later
  });

  it('Q-P6-4 (a): VEHICLE service active without a rate -> in estimate.missing, not in monthlyEstimate', async () => {
    serviceRows = [{ id: 4, name: 'Gửi xe máy', unit: 'VEHICLE', buildingId: 10, isActive: true }];
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    expect(res.body.data.monthlyEstimate).toBe(2_500_000);
    expect(res.body.data.estimate.missing).toEqual(['chưa gồm: Gửi xe máy (chưa có giá)']);
  });

  it('Q-P6-4 (b): VEHICLE service active with a rate -> in rates.services, not in monthlyEstimate and not in missing', async () => {
    serviceRows = [{ id: 4, name: 'Gửi xe máy', unit: 'VEHICLE', buildingId: 10, isActive: true }];
    ratePlanRows.push(ratePlan('SERVICE', { id: 13, serviceId: 4, tiers: [{ tierNo: 1, upTo: null, unitPrice: 150_000 }] }));
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    expect(res.body.data.monthlyEstimate).toBe(2_500_000);
    expect(res.body.data.estimate.missing).toEqual([]);
    expect(res.body.data.rates.services.map((s: any) => s.serviceName)).toEqual(['Gửi xe máy']);
  });

  it('PUB-03: a rate effective in the future is in upcomingRates (with the right effectiveFrom) and not in rates; today\'s rate is in rates', async () => {
    const future = addDays(today, 30);
    ratePlanRows.push(ratePlan('WATER', { id: 20, effectiveFrom: future, tiers: [{ tierNo: 1, upTo: null, unitPrice: 25_000 }] }));
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    expect(res.body.data.upcomingRates).toHaveLength(1);
    expect(res.body.data.upcomingRates[0].effectiveFrom).toBe(formatDateOnly(future));
    expect(res.body.data.upcomingRates[0].kind).toBe('WATER');
    // The current water rate (effective 2026-01-01) is still the one applied in `rates`, not the future one.
    expect(res.body.data.rates.water.effectiveFrom).toBe('2026-01-01');
  });

  it('BLD-04: an active manager with a contact phone is used as the contact', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    expect(res.body.data.contact).toEqual({ phone: '0901111111', zaloUrl: 'https://zalo/a', facebookUrl: null });
  });

  it('BLD-04: an inactive manager falls back to the Boss default contact', async () => {
    roomRow = room({ building: buildingRow({ manager: { isActive: false, contactPhone: '0901111111', zaloUrl: null, facebookUrl: null } }) });
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    expect(res.body.data.contact).toEqual({ phone: '0900000000', zaloUrl: null, facebookUrl: null });
  });

  it('BLD-04: an active manager without a contact phone falls back to the Boss default contact', async () => {
    roomRow = room({ building: buildingRow({ manager: { isActive: true, contactPhone: null, zaloUrl: null, facebookUrl: null } }) });
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    expect(res.body.data.contact).toEqual({ phone: '0900000000', zaloUrl: null, facebookUrl: null });
  });

  it('BLD-04: managerId = null (no manager relation) falls back to the Boss default contact', async () => {
    roomRow = room({ building: buildingRow({ managerId: null, manager: null }) });
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    expect(res.body.data.contact).toEqual({ phone: '0900000000', zaloUrl: null, facebookUrl: null });
  });

  it('BLD-04: the body never carries the manager\'s own login phone field, only phone/zaloUrl/facebookUrl under contact', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    expect(Object.keys(res.body.data.contact).sort()).toEqual(['facebookUrl', 'phone', 'zaloUrl']);
  });

  it('Biên: :id = 0 is rejected as VALIDATION_FAILED on fields.id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/0').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.id).toBeDefined();
  });

  it('Biên: :id = abc is rejected as VALIDATION_FAILED on fields.id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.id).toBeDefined();
  });

  it('Biên: a room with no images -> images: [] (no imageUrl field on the detail contract)', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    expect(res.body.data.images).toEqual([]);
  });

  it('Biên: empty furniture/amenities JSON arrays map to []', async () => {
    roomRow = room({ furniture: [] as string[], building: buildingRow({ amenities: [] as string[] }) });
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    expect(res.body.data.furniture).toEqual([]);
    expect(res.body.data.building.amenities).toEqual([]);
  });

  it('PUB-04: the detail body never carries reviewNote, proposedById, reviewedById, handledById or managerId', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    const json = JSON.stringify(res.body.data);
    for (const leaked of ['reviewNote', 'proposedById', 'reviewedById', 'handledById', 'managerId']) {
      expect(json).not.toContain(leaked);
    }
  });

  it('Quyền: /public/rooms/:id is reachable with no Authorization header and with a garbage one', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/rooms/101').expect(200);
    await request(app.getHttpServer()).get('/api/v1/public/rooms/101').set('Authorization', 'Bearer garbage').expect(200);
  });
});
