import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { addDays, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { MustChangePasswordGuard } from '../../common/guards/must-change-password.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { ViewingsModule } from './viewings.module.js';

// CP-3 (BE-P2-31) · VIEW-01, 02, 08, 11, 12, A-03: POST /public/viewings HTTP contract.
// Prisma is the external database edge (mocked); real guards, ValidationPipe,
// PublicViewingsController, ViewingsService, checkVisitSlot, error filter and response
// interceptor all run through an HTTP server. Nothing in the unit under test is mocked.
// Each `it` gets a fresh app (own ViewingsService/RateLimiter instance) so the per-IP and
// per-process limiters never leak across tests.

const TOMORROW = formatDateOnly(addDays(todayHanoi(), 1));

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    roomId: 101,
    guestName: 'Nguyễn Văn A',
    guestPhone: '0912345678',
    visitDate: TOMORROW,
    timeSlot: 'EVENING',
    ...overrides,
  };
}

describe('CP-3 (BE-P2-31) · POST /public/viewings HTTP contract', () => {
  async function setup(roomExists = true) {
    const viewingCreate = vi.fn(async () => ({ id: 1 }));
    const roomFindFirst = vi.fn(async () => (roomExists ? { id: 101 } : null));
    const viewingCount = vi.fn(async () => 0);
    const db: any = {
      $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
        work({
          $queryRaw: vi.fn(async () => [{ lock: 'ok' }]),
          room: { findFirst: roomFindFirst },
          viewing: { count: viewingCount, create: viewingCreate },
        }),
      ),
    };
    process.env.JWT_SECRET = 'draft-only-test-secret-never-used-outside-this-process';
    const testingModule = Test.createTestingModule({
      imports: [JwtModule.register({}), ViewingsModule],
      providers: [
        TokenService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: MustChangePasswordGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    });
    testingModule.overrideProvider(PrismaService).useValue(db);
    const moduleRef = await testingModule.compile();
    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const tokens = moduleRef.get(TokenService);
    return { app, tokens, viewingCreate, roomFindFirst, viewingCount };
  }

  async function teardown(app: INestApplication) {
    await app.close();
    delete process.env.JWT_SECRET;
  }

  it('VIEW-01 happy: a valid booking returns 201 { received: true } with no id, and writes one WEB/NEW viewing', async () => {
    const { app, viewingCreate } = await setup();
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/viewings').send(validBody()).expect(201);
    expect(res.body.data).toEqual({ received: true });
    expect(res.body.data.id).toBeUndefined();
    expect(viewingCreate).toHaveBeenCalledTimes(1);
    expect(viewingCreate.mock.calls[0][0].data).toMatchObject({ source: 'WEB', status: 'NEW', roomId: 101 });
    await teardown(app);
  });

  it('VIEW-01: a non-public room is 409 ROOM_NOT_AVAILABLE, nothing is created', async () => {
    const { app, viewingCreate } = await setup(false);
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/viewings').send(validBody()).expect(409);
    expect(res.body.error.code).toBe('ROOM_NOT_AVAILABLE');
    expect(viewingCreate).not.toHaveBeenCalled();
    await teardown(app);
  });

  it('VIEW-01: a non-existent room id gives the exact same 409 ROOM_NOT_AVAILABLE body (no existence leak)', async () => {
    const { app } = await setup(false);
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/viewings').send(validBody({ roomId: 999999 })).expect(409);
    expect(res.body.error.code).toBe('ROOM_NOT_AVAILABLE');
    await teardown(app);
  });

  it('VIEW-08: visitDate before today is 400 VALIDATION_FAILED on fields.visitDate', async () => {
    const { app } = await setup();
    const yesterday = formatDateOnly(addDays(todayHanoi(), -1));
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/viewings').send(validBody({ visitDate: yesterday })).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.visitDate).toBeDefined();
    await teardown(app);
  });

  it('VIEW-08: visitDate 31 days out is 400 VALIDATION_FAILED on fields.visitDate; +30 is accepted', async () => {
    const { app } = await setup();
    const today = todayHanoi();
    const tooFar = formatDateOnly(addDays(today, 31));
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/viewings').send(validBody({ visitDate: tooFar })).expect(400);
    expect(res.body.error.fields.visitDate).toBeDefined();

    const boundary = formatDateOnly(addDays(today, 30));
    await request(app.getHttpServer())
      .post('/api/v1/public/viewings').send(validBody({ visitDate: boundary, guestPhone: '0912345671' })).expect(201);
    await teardown(app);
  });

  it('VIEW-08: an unrecognized timeSlot value is 400 VALIDATION_FAILED on fields.timeSlot', async () => {
    const { app } = await setup();
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/viewings').send(validBody({ timeSlot: 'NIGHT' })).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.timeSlot).toBeDefined();
    await teardown(app);
  });

  it('Validation: missing/invalid guestPhone and roomId are each reported under their own field', async () => {
    const { app } = await setup();
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/viewings')
      .send(validBody({ guestPhone: '123', roomId: 0 })).expect(400);
    expect(res.body.error.fields.guestPhone).toBeDefined();
    expect(res.body.error.fields.roomId).toBeDefined();
    await teardown(app);
  });

  it('VIEW-11: a phone with 3 WEB viewings already today is 429 TOO_MANY_REQUESTS', async () => {
    const { app, viewingCount } = await setup();
    viewingCount.mockResolvedValue(3);
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/viewings').send(validBody()).expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    await teardown(app);
  });

  it('VIEW-02: the 6th request within an hour from the same IP (same supertest agent/socket) is 429', async () => {
    const { app } = await setup();
    const agent = request(app.getHttpServer());
    for (let i = 0; i < 5; i++) {
      await agent.post('/api/v1/public/viewings').send(validBody({ guestPhone: `091234000${i}` })).expect(201);
    }
    const res = await agent.post('/api/v1/public/viewings').send(validBody({ guestPhone: '0912340009' })).expect(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    await teardown(app);
  });

  it('VIEW-12 honeypot: a filled website field returns 201 with a body byte-identical to a real success, and writes nothing', async () => {
    const { app: appHoneypot, viewingCreate: createHoneypot } = await setup();
    const honeypotRes = await request(appHoneypot.getHttpServer())
      .post('/api/v1/public/viewings').send(validBody({ website: 'http://spam.example' })).expect(201);
    expect(createHoneypot).not.toHaveBeenCalled();
    await teardown(appHoneypot);

    const { app: appReal, viewingCreate: createReal } = await setup();
    const realRes = await request(appReal.getHttpServer())
      .post('/api/v1/public/viewings').send(validBody()).expect(201);
    expect(createReal).toHaveBeenCalledTimes(1);
    await teardown(appReal);

    expect(JSON.stringify(honeypotRes.body)).toBe(JSON.stringify(realRes.body));
  });

  it('Quyền: the route needs no token, and a TENANT token does not block it either (route is @Public)', async () => {
    const { app, tokens, viewingCreate } = await setup();
    const noToken = await request(app.getHttpServer())
      .post('/api/v1/public/viewings').send(validBody({ guestPhone: '0900000001' })).expect(201);
    expect(noToken.body.data).toEqual({ received: true });

    const tenantToken = await tokens.signAccessToken({ id: 3, role: 'TENANT' } as any);
    const withToken = await request(app.getHttpServer())
      .post('/api/v1/public/viewings').set('Authorization', `Bearer ${tenantToken}`)
      .send(validBody({ guestPhone: '0900000002' })).expect(201);
    expect(withToken.body.data).toEqual({ received: true });
    expect(viewingCreate).toHaveBeenCalledTimes(2);
    await teardown(app);
  });
});
