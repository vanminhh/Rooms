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
import { publicBuildingWhere, publicRoomWhere } from '../../common/rooms/public-room.js';
import { TokenService } from '../auth/token.service.js';
import { BuildingsModule } from './buildings.module.js';

// CP-2 (BE-P2-30) · PUB-02, PUB-03, PUB-04, BLD-04: GET /public/buildings/:id HTTP contract.
// Prisma + Setting (default contact fallback) are the external edges, both mocked. Real guards,
// ValidationPipe, PublicBuildingsController, PublicBuildingsService, ratesAt/ratesAfter,
// loadPublicRates, BuildingContactService and the response interceptor all run through an HTTP
// server. Nothing in the unit under test is mocked.

const d = (s: string): Date => new Date(`${s}T00:00:00Z`);
const today = todayHanoi();

function buildingRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10, code: 'DD01', name: 'Dương Đình 1', address: '12 Dương Đình Nghệ',
    district: 'Cầu Giấy', ward: 'Dịch Vọng', waterMode: 'PER_M3', amenities: ['Thang máy'],
    description: 'Tòa mới xây', managerId: 5,
    manager: { isActive: true, contactPhone: '0901111111', zaloUrl: 'https://zalo/a', facebookUrl: null },
    ...overrides,
  };
}
function roomListRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 101, code: 'A101', floor: 1, areaM2: 20, price: 2_000_000, maxOccupants: 2, buildingId: 10,
    building: { code: 'DD01', name: 'Dương Đình 1', district: 'Cầu Giấy', ward: 'Dịch Vọng' },
    images: [] as { url: string }[],
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

describe('CP-2 (BE-P2-30) · GET /public/buildings/:id HTTP contract', () => {
  let app: INestApplication;
  let buildingRecord: ReturnType<typeof buildingRow> | null;
  let roomRows: ReturnType<typeof roomListRow>[];
  let ratePlanRows: ReturnType<typeof ratePlan>[];
  let defaultContactRow: { key: string; value: unknown } | null;

  const buildingFindFirst = vi.fn(async ({ where }: any) =>
    buildingRecord && where.id === buildingRecord.id ? buildingRecord : null,
  );
  const roomFindMany = vi.fn(async ({ where, orderBy }: any) => {
    const rows = roomRows.filter((r) => r.buildingId === where.AND[0].buildingId);
    return [...rows].sort((a, b) => {
      for (const ord of orderBy as Record<string, 'asc' | 'desc'>[]) {
        const [key] = Object.entries(ord)[0];
        const av = (a as any)[key]; const bv = (b as any)[key];
        if (av !== bv) return av - bv;
      }
      return 0;
    });
  });
  const ratePlanFindMany = vi.fn(async ({ where }: any) => {
    const rows = ratePlanRows.filter((p) => p.buildingId === where.buildingId && p.status === where.status);
    if ('lte' in where.effectiveFrom) return rows.filter((p) => p.effectiveFrom.getTime() <= where.effectiveFrom.lte.getTime());
    return rows.filter((p) => p.effectiveFrom.getTime() > where.effectiveFrom.gt.getTime());
  });
  const serviceFindMany = vi.fn(async () => [] as unknown[]);
  const settingFindUnique = vi.fn(async ({ where }: any) => (where.key === 'default_contact' ? defaultContactRow : null));

  const db: any = {
    building: { findFirst: buildingFindFirst },
    room: { findMany: roomFindMany },
    ratePlan: { findMany: ratePlanFindMany },
    service: { findMany: serviceFindMany },
    setting: { findUnique: settingFindUnique },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'draft-only-test-secret-never-used-outside-this-process';
    const testingModule = Test.createTestingModule({
      imports: [JwtModule.register({}), BuildingsModule],
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
    buildingRecord = buildingRow();
    roomRows = [roomListRow({ id: 102, price: 3_000_000 }), roomListRow({ id: 101, price: 2_000_000 })];
    ratePlanRows = [ratePlan('ELECTRIC'), ratePlan('WATER')];
    defaultContactRow = { key: 'default_contact', value: { phone: '0900000000', zaloUrl: null, facebookUrl: null } };
    buildingFindFirst.mockClear(); roomFindMany.mockClear(); ratePlanFindMany.mockClear();
    serviceFindMany.mockClear(); settingFindUnique.mockClear();
  });

  it('PUB-02: queries building.findFirst with exactly { id, ...publicBuildingWhere(today) } (no ad hoc public filter)', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/buildings/10').expect(200);
    const call = buildingFindFirst.mock.calls.at(-1)?.[0] as any;
    expect(call.where).toEqual({ id: 10, ...publicBuildingWhere(today) });
  });

  it('PUB-02: a building id that does not exist or is locked / has no public room gives the same 404 NOT_FOUND body', async () => {
    buildingRecord = null;
    const missing = await request(app.getHttpServer()).get('/api/v1/public/buildings/999').expect(404);
    const locked = await request(app.getHttpServer()).get('/api/v1/public/buildings/999').expect(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect(missing.body).toEqual(locked.body);
  });

  it('rooms: only public rooms of this building, price ascending', async () => {
    const roomCall = () => {
      const call = roomFindMany.mock.calls.at(-1)?.[0] as any;
      expect(call.where).toEqual({ AND: [{ buildingId: 10 }, publicRoomWhere(today)] });
      expect(call.orderBy).toEqual([{ price: 'asc' }, { id: 'asc' }]);
    };
    const res = await request(app.getHttpServer()).get('/api/v1/public/buildings/10').expect(200);
    expect(res.body.data.rooms.map((r: any) => r.id)).toEqual([101, 102]);
    expect(res.body.data.rooms.map((r: any) => r.price)).toEqual([2_000_000, 3_000_000]);
    roomCall();
  });

  it('Biên: a building with zero public rooms returned by room.findMany -> rooms: []', async () => {
    roomRows = [];
    const res = await request(app.getHttpServer()).get('/api/v1/public/buildings/10').expect(200);
    expect(res.body.data.rooms).toEqual([]);
  });

  it('PUB-03: a rate effective in the future is in upcomingRates and not in rates; today\'s rate is in rates', async () => {
    const future = addDays(today, 15);
    ratePlanRows.push(ratePlan('ELECTRIC', { id: 20, effectiveFrom: future, tiers: [{ tierNo: 1, upTo: null, unitPrice: 4_200 }] }));
    const res = await request(app.getHttpServer()).get('/api/v1/public/buildings/10').expect(200);
    expect(res.body.data.upcomingRates).toHaveLength(1);
    expect(res.body.data.upcomingRates[0].effectiveFrom).toBe(formatDateOnly(future));
    expect(res.body.data.rates.electric.effectiveFrom).toBe('2026-01-01');
  });

  it('BLD-04: an active manager with a contact phone is used as the contact', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/buildings/10').expect(200);
    expect(res.body.data.contact).toEqual({ phone: '0901111111', zaloUrl: 'https://zalo/a', facebookUrl: null });
  });

  it('BLD-04: managerId = null falls back to the Boss default contact', async () => {
    buildingRecord = buildingRow({ managerId: null, manager: null });
    const res = await request(app.getHttpServer()).get('/api/v1/public/buildings/10').expect(200);
    expect(res.body.data.contact).toEqual({ phone: '0900000000', zaloUrl: null, facebookUrl: null });
  });

  it('BLD-04: an inactive manager falls back to the Boss default contact', async () => {
    buildingRecord = buildingRow({ manager: { isActive: false, contactPhone: '0901111111', zaloUrl: null, facebookUrl: null } });
    const res = await request(app.getHttpServer()).get('/api/v1/public/buildings/10').expect(200);
    expect(res.body.data.contact).toEqual({ phone: '0900000000', zaloUrl: null, facebookUrl: null });
  });

  it('Biên: :id = 0 is rejected as VALIDATION_FAILED on fields.id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/buildings/0').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.id).toBeDefined();
  });

  it('Biên: :id = abc is rejected as VALIDATION_FAILED on fields.id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/buildings/abc').expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.id).toBeDefined();
  });

  it('Biên: empty amenities JSON array maps to []', async () => {
    buildingRecord = buildingRow({ amenities: [] as string[] });
    const res = await request(app.getHttpServer()).get('/api/v1/public/buildings/10').expect(200);
    expect(res.body.data.amenities).toEqual([]);
  });

  it('PUB-04: the detail body never carries managerId, reviewNote, proposedById or reviewedById', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/buildings/10').expect(200);
    const json = JSON.stringify(res.body.data);
    for (const leaked of ['managerId', 'reviewNote', 'proposedById', 'reviewedById']) {
      expect(json).not.toContain(leaked);
    }
  });

  it('Quyền: /public/buildings/:id is reachable with no Authorization header and with a garbage one', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/buildings/10').expect(200);
    await request(app.getHttpServer()).get('/api/v1/public/buildings/10').set('Authorization', 'Bearer garbage').expect(200);
  });
});
