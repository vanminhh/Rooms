import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MustChangePasswordGuard } from '../../common/guards/must-change-password.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { ServicesController } from './services.controller.js';
import { ServicesService } from './services.service.js';

// Only Prisma is an outside fake; real Nest routing, guards, DTO validation, service and helpers run.
describe('BE-P2-15 · services HTTP', () => {
  let app: INestApplication | undefined;
  let tokens: TokenService;
  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
    [2, { id: 2, role: 'MANAGER', isActive: true, mustChangePassword: false }],
    [3, { id: 3, role: 'TENANT', isActive: true, mustChangePassword: false }],
  ]);
  const rows = new Map<number, any>();
  const plans: any[] = [];
  const fakePrisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: { findMany: vi.fn(async ({ where }: any) => where.managerId === 2 ? [{ id: 10 }] : []), findUnique: vi.fn(async ({ where }: any) => where.id === 10 ? { id: 10 } : null) },
    service: {
      findMany: vi.fn(async ({ where, skip, take }: any) => [...rows.values()].filter((s) => where.buildingId === undefined || (typeof where.buildingId === 'number' ? s.buildingId === where.buildingId : where.buildingId.in.includes(s.buildingId))).slice(skip, skip + take)),
      count: vi.fn(async ({ where }: any) => [...rows.values()].filter((s) => where.buildingId === undefined || (typeof where.buildingId === 'number' ? s.buildingId === where.buildingId : where.buildingId.in.includes(s.buildingId))).length),
      // Prisma is an outside edge: emulate the database unique index, including its named-index metadata form.
      create: vi.fn(async ({ data }: any) => {
        if ([...rows.values()].some((service) => service.buildingId === data.buildingId && service.name === data.name)) {
          throw { code: 'P2002', meta: { target: 'services_building_id_name_key' } };
        }
        const row = { id: rows.size + 1, ...data, isActive: true }; rows.set(row.id, row); return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.id) ?? null),
      // Some Prisma versions report the compound unique fields as an array in meta.target.
      update: vi.fn(async ({ where, data }: any) => {
        const row = rows.get(where.id);
        if ([...rows.values()].some((service) => service.id !== where.id && service.buildingId === row.buildingId && service.name === data.name)) {
          throw { code: 'P2002', meta: { target: ['buildingId', 'name'] } };
        }
        Object.assign(row, data); return row;
      }),
    },
    ratePlan: { findMany: vi.fn(async ({ where }: any) => plans.filter((p) => p.buildingId === where.buildingId && p.status === where.status && p.effectiveFrom <= where.effectiveFrom.lte)) },
  };
  beforeAll(async () => {
    process.env.JWT_SECRET = 'draft-only-test-secret-never-used-outside-this-process';
    const moduleRef = await Test.createTestingModule({ imports: [JwtModule.register({})], controllers: [ServicesController], providers: [ServicesService, TokenService, { provide: PrismaService, useValue: fakePrisma }, { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: MustChangePasswordGuard }, { provide: APP_GUARD, useClass: RolesGuard }] }).compile();
    app = moduleRef.createNestApplication(); configureApp(app); await app.init(); tokens = moduleRef.get(TokenService);
  });
  afterAll(async () => { if (app) await app.close(); delete process.env.JWT_SECRET; });
  beforeEach(() => { rows.clear(); plans.length = 0; });
  async function auth(id: number) { return `Bearer ${await tokens.signAccessToken({ id, role: 'BOSS' } as any)}`; }

  it('SVC-01/02, API-01: Boss creates a catalog entry and returns the standard envelope without a rate', async () => {
    const response = await request(app!.getHttpServer()).post('/api/v1/services').set('Authorization', await auth(1)).send({ buildingId: 10, name: 'Wifi', unit: 'ROOM' }).expect(201);
    expect(response.body.data).toMatchObject({ id: 1, buildingId: 10, name: 'Wifi', unit: 'ROOM', isActive: true, hasCurrentRate: false });
    expect(fakePrisma.ratePlan.findMany).not.toHaveBeenCalled();
  });

  it('SVC-01, API-04: invalid and unknown create input returns validation errors', async () => {
    const response = await request(app!.getHttpServer()).post('/api/v1/services').set('Authorization', await auth(1)).send({ buildingId: 0, name: '', unit: 'INVALID', price: 100 }).expect(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('SVC-01: POST rejects a duplicate name in the same building even when the existing service is locked', async () => {
    rows.set(1, { id: 1, buildingId: 10, name: 'Wifi', unit: 'ROOM', isActive: false });
    const response = await request(app!.getHttpServer()).post('/api/v1/services').set('Authorization', await auth(1)).send({ buildingId: 10, name: 'Wifi', unit: 'ROOM' }).expect(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', fields: { name: expect.any(String) } });
    expect(rows.size).toBe(1);
    expect(rows.get(1)).toMatchObject({ name: 'Wifi', isActive: false });
  });

  it('SVC-01: PATCH rejects renaming to a locked service name in the same building and preserves the row', async () => {
    rows.set(1, { id: 1, buildingId: 10, name: 'Wifi', unit: 'ROOM', isActive: false });
    rows.set(2, { id: 2, buildingId: 10, name: 'Internet', unit: 'ROOM', isActive: true });
    const response = await request(app!.getHttpServer()).patch('/api/v1/services/2').set('Authorization', await auth(1)).send({ name: 'Wifi' }).expect(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', fields: { name: expect.any(String) } });
    expect(rows.get(1)).toMatchObject({ name: 'Wifi', isActive: false });
    expect(rows.get(2)).toMatchObject({ name: 'Internet', isActive: true });
  });

  it('SVC-01: duplicate service names remain valid across different buildings', async () => {
    rows.set(1, { id: 1, buildingId: 20, name: 'Wifi', unit: 'ROOM', isActive: false });
    const response = await request(app!.getHttpServer()).post('/api/v1/services').set('Authorization', await auth(1)).send({ buildingId: 10, name: 'Wifi', unit: 'ROOM' }).expect(201);
    expect(response.body.data).toMatchObject({ buildingId: 10, name: 'Wifi', unit: 'ROOM' });
    expect(rows.size).toBe(2);
  });

  it('SCOPE-01/02: guest is unauthenticated, tenant forbidden, manager may only list own building and cannot mutate', async () => {
    await request(app!.getHttpServer()).get('/api/v1/services').expect(401);
    const tenantToken = `Bearer ${await tokens.signAccessToken({ id: 3, role: 'TENANT' } as any)}`;
    await request(app!.getHttpServer()).get('/api/v1/services').set('Authorization', tenantToken).expect(403);
    const managerToken = `Bearer ${await tokens.signAccessToken({ id: 2, role: 'MANAGER' } as any)}`;
    await request(app!.getHttpServer()).get('/api/v1/services?buildingId=20').set('Authorization', managerToken).expect(403);
    await request(app!.getHttpServer()).post('/api/v1/services').set('Authorization', managerToken).send({ buildingId: 10, name: 'x', unit: 'ROOM' }).expect(403);
  });

  it('SVC-02/04, DB-B5: immutable unit and building fields reject the whole patch without partial mutation', async () => {
    rows.set(1, { id: 1, buildingId: 10, name: 'Wifi', unit: 'ROOM', isActive: true });
    const response = await request(app!.getHttpServer()).patch('/api/v1/services/1').set('Authorization', await auth(1)).send({ name: 'Changed', isActive: false, unit: 'ROOM', buildingId: 10 }).expect(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(rows.get(1)).toMatchObject({ name: 'Wifi', isActive: true, unit: 'ROOM', buildingId: 10 });
  });
});
