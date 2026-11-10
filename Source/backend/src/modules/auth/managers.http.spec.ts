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
import { AuditService } from '../audit/audit.service.js';
import { TokenService } from './token.service.js';
import { ManagersController } from './managers.controller.js';
import { ManagersService } from './managers.service.js';

// Only the database and audit sink are faked; Nest routing, DTO validation, guards, filter and service are real.
describe('BE-P2-16 managers HTTP', () => {
  let app: INestApplication;
  let tokens: TokenService;
  let id = 20;
  const users = new Map<number, any>([
    [1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }],
    [2, { id: 2, role: 'MANAGER', phone: '0911111111', fullName: 'Quản lý hiện hữu', email: null, isActive: true, mustChangePassword: false, contactPhone: null, zaloUrl: null, facebookUrl: null, createdAt: new Date('2026-01-01T00:00:00Z'), managedBuildings: [] }],
    [3, { id: 3, role: 'TENANT', isActive: true, mustChangePassword: false }],
  ]);
  const audit = { log: vi.fn(async () => undefined) };
  const db: any = {
    user: {
      findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null),
      create: vi.fn(async ({ data }: any) => { const user = { id: ++id, ...data, contactPhone: null, zaloUrl: null, facebookUrl: null, createdAt: new Date(), managedBuildings: [] }; users.set(user.id, user); return user; }),
      update: vi.fn(async ({ where, data }: any) => { const row = users.get(where.id); Object.assign(row, data); return row; }),
      findMany: vi.fn(async ({ where }: any) => [...users.values()].filter((u) => u.role === where.role)),
      count: vi.fn(async () => [...users.values()].filter((u) => u.role === 'MANAGER').length),
    },
    building: { findMany: vi.fn(async () => []) },
    session: { updateMany: vi.fn(async () => ({ count: 0 })) },
    auditLog: { create: vi.fn(async () => ({})) },
    $queryRaw: vi.fn(async () => []),
  };
  db.$transaction = async (callback: any) => callback(db);

  beforeAll(async () => {
    process.env.JWT_SECRET = 'draft-only-manager-http-secret';
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [ManagersController],
      providers: [ManagersService, TokenService, { provide: PrismaService, useValue: db }, { provide: AuditService, useValue: audit }, { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: MustChangePasswordGuard }, { provide: APP_GUARD, useClass: RolesGuard }],
    }).compile();
    app = moduleRef.createNestApplication(); configureApp(app); await app.init(); tokens = moduleRef.get(TokenService);
  });
  afterAll(async () => { await app.close(); delete process.env.JWT_SECRET; });
  async function bearer(id: number, role: 'BOSS' | 'MANAGER' | 'TENANT') { return `Bearer ${await tokens.signAccessToken({ id, role })}`; }

  it('AUTH-08/API-01: Boss create returns a one-time temporary password and safe response envelope', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/managers').set('Authorization', await bearer(1, 'BOSS')).send({ phone: '0912345678', fullName: 'Quản lý mới' }).expect(201);
    expect(response.body.data.manager).toMatchObject({ phone: '0912345678', fullName: 'Quản lý mới', isActive: true, mustChangePassword: true });
    expect(response.body.data.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    expect(JSON.stringify(response.body.data.manager)).not.toContain('passwordHash');
    expect(audit.log).toHaveBeenCalledWith(1, 'manager.create', 'user', response.body.data.manager.id, undefined, expect.any(Object), expect.any(String), db);
  });

  it('AUTH-08/G-04/API-04: malformed phone, name, email and forbidden client fields fail validation', async () => {
    const auth = await bearer(1, 'BOSS');
    for (const body of [
      { phone: '9123', fullName: 'Tên' },
      { phone: '0912345678', fullName: '' },
      { phone: '0912345678', fullName: 'x'.repeat(101) },
      { phone: '0912345678', fullName: 'Tên', email: 'bad' },
      { phone: '0912345678', fullName: 'Tên', role: 'BOSS' },
      { phone: '0912345678', fullName: 'Tên', passwordHash: 'secret' },
      { phone: '0912345678', fullName: 'Tên', buildingId: 10 },
    ]) {
      const response = await request(app.getHttpServer()).post('/api/v1/managers').set('Authorization', auth).send(body).expect(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('SCOPE-01/AUTH-05: guest, manager, tenant and password-change-required users cannot call managers routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/managers').expect(401);
    for (const [userId, role] of [[2, 'MANAGER'], [3, 'TENANT']] as const) {
      await request(app.getHttpServer()).get('/api/v1/managers').set('Authorization', await bearer(userId, role)).expect(403);
    }
    users.set(4, { id: 4, role: 'BOSS', isActive: true, mustChangePassword: true });
    const response = await request(app.getHttpServer()).get('/api/v1/managers').set('Authorization', await bearer(4, 'BOSS')).expect(403);
    expect(response.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('AUTH-08/API-02: list is paginated and never exposes password hashes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/managers?page=1&limit=10').set('Authorization', await bearer(1, 'BOSS')).expect(200);
    expect(response.body).toMatchObject({ data: expect.any(Array), meta: { page: 1, limit: 10, total: expect.any(Number) } });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });
});
