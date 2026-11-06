import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { todayHanoi } from '../../common/date/today.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MustChangePasswordGuard } from '../../common/guards/must-change-password.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { publicBuildingWhere, publicRoomWhere } from '../../common/rooms/public-room.js';
import { TokenService } from '../auth/token.service.js';
import { BuildingsModule } from './buildings.module.js';

// CP-1 (BE-P2-29) · BLD-05: /public/locations HTTP contract.
// Prisma is the external database edge; `publicBuildingWhere`/`publicRoomWhere` are the already-tested
// (src/common/rooms/public-room.spec.ts) reused definition of "public" — this test does not re-derive
// their filtering, it checks that PublicBuildingsService wires them unchanged and aggregates correctly
// the rows building.findMany would return for that `where`.

describe('CP-1 (BE-P2-29) · /public/locations HTTP contract', () => {
  let app: INestApplication;
  // Two buildings share "Cầu Giấy / Dịch Vọng" (BLD-05: roomCount must sum across buildings in the same ward).
  const buildingFindMany = vi.fn(async (_args: any) => [
    { district: 'Cầu Giấy', ward: 'Dịch Vọng', _count: { rooms: 3 } },
    { district: 'Cầu Giấy', ward: 'Dịch Vọng', _count: { rooms: 2 } },
    { district: 'Cầu Giấy', ward: 'Nghĩa Đô', _count: { rooms: 1 } },
    { district: 'Hoàn Kiếm', ward: 'Hàng Bạc', _count: { rooms: 2 } },
    { district: 'Ba Đình', ward: 'Trúc Bạch', _count: { rooms: 5 } },
  ]);
  const db: any = { building: { findMany: buildingFindMany } };

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
  beforeEach(() => buildingFindMany.mockClear());

  it('BLD-05: districts A→Z, wards A→Z inside each, roomCount summed across buildings sharing a ward', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/locations').expect(200);
    expect(res.body.data).toEqual([
      { district: 'Ba Đình', roomCount: 5, wards: [{ ward: 'Trúc Bạch', roomCount: 5 }] },
      {
        district: 'Cầu Giấy', roomCount: 6,
        wards: [{ ward: 'Dịch Vọng', roomCount: 5 }, { ward: 'Nghĩa Đô', roomCount: 1 }],
      },
      { district: 'Hoàn Kiếm', roomCount: 2, wards: [{ ward: 'Hàng Bạc', roomCount: 2 }] },
    ]);
  });

  it('BLD-05: wires the reused publicBuildingWhere/publicRoomWhere unchanged, scoped by the room count', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/locations').expect(200);
    const today = todayHanoi();
    const call = buildingFindMany.mock.calls.at(-1)?.[0] as any;
    expect(call.where).toEqual(publicBuildingWhere(today));
    expect(call.select._count.select.rooms.where).toEqual(publicRoomWhere(today));
    expect(call.select.district).toBe(true);
    expect(call.select.ward).toBe(true);
  });

  it('Biên: no public building at all -> /public/locations returns []', async () => {
    buildingFindMany.mockResolvedValueOnce([]);
    const res = await request(app.getHttpServer()).get('/api/v1/public/locations').expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('Quyền: /public/locations is reachable with no Authorization header and with a garbage one', async () => {
    await request(app.getHttpServer()).get('/api/v1/public/locations').expect(200);
    await request(app.getHttpServer()).get('/api/v1/public/locations').set('Authorization', 'Bearer garbage').expect(200);
  });
});
