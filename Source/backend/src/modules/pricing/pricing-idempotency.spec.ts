import { BadRequestException, ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { compareDates, formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { hashRequest, parseIdempotencyKey, runIdempotent } from './pricing-idempotency.js';

// CP-1 · API-05, Q-P5-6, [ASSUMPTION P5-2]. The unit under test is the pure
// `parseIdempotencyKey`/`runIdempotent` pair; only Prisma (and, in the HTTP block, the whole
// PrismaService) is mocked. `run()` passed into `runIdempotent` is a plain vi.fn, not a DB edge.

describe('CP-1 · parseIdempotencyKey ([ASSUMPTION P5-2])', () => {
  it('[ASSUMPTION P5-2] accepts undefined (no header sent)', () => {
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
  });

  it('[ASSUMPTION P5-2] accepts a 1-character key (lower boundary)', () => {
    expect(parseIdempotencyKey('a')).toBe('a');
  });

  it('[ASSUMPTION P5-2] accepts a 255-character key (upper boundary, matches the VARCHAR(255) column)', () => {
    const key = 'k'.repeat(255);
    expect(parseIdempotencyKey(key)).toBe(key);
  });

  it('[ASSUMPTION P5-2] rejects an empty key as 400 VALIDATION_FAILED', () => {
    expect(() => parseIdempotencyKey('')).toThrow(BadRequestException);
    try {
      parseIdempotencyKey('');
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ status: 400, response: { code: 'VALIDATION_FAILED', fields: { idempotencyKey: expect.any(String) } } });
    }
  });

  it('[ASSUMPTION P5-2] rejects a 256-character key (one over the column limit) as 400 VALIDATION_FAILED', () => {
    const key = 'k'.repeat(256);
    expect(() => parseIdempotencyKey(key)).toThrow(BadRequestException);
  });
});

describe('CP-1 · runIdempotent (unit, fake Prisma tx)', () => {
  function makeTx() {
    const store = new Map<string, any>();
    const tx: any = {
      $queryRaw: vi.fn(async () => [{ lock: 'ok' }]),
      pricingIdempotencyKey: {
        findUnique: vi.fn(async ({ where }: any) => {
          const k = where.actorId_route_key;
          return store.get(`${k.actorId}|${k.route}|${k.key}`) ?? null;
        }),
        create: vi.fn(async ({ data }: any) => {
          store.set(`${data.actorId}|${data.route}|${data.key}`, { ...data });
          return data;
        }),
        delete: vi.fn(async ({ where }: any) => {
          const k = where.actorId_route_key;
          store.delete(`${k.actorId}|${k.route}|${k.key}`);
        }),
      },
    };
    return { tx, store };
  }

  it('API-05: no key just runs, without touching the idempotency table', async () => {
    const { tx } = makeTx();
    const run = vi.fn(async () => ({ id: 1 }));
    const result = await runIdempotent(tx, { actorId: 1, route: 'POST /room-prices', key: undefined, statusCode: 201 }, 'hash-a', run);
    expect(result).toEqual({ id: 1 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(tx.pricingIdempotencyKey.create).not.toHaveBeenCalled();
  });

  it('Q-P5-6: same (actor, route, key) with the same request hash replays the first response and does not call run() again', async () => {
    const { tx } = makeTx();
    const run = vi.fn(async () => ({ id: 42 }));
    const scope = { actorId: 1, route: 'POST /room-prices', key: 'K1', statusCode: 201 };
    const first = await runIdempotent(tx, scope, 'same-hash', run);
    const second = await runIdempotent(tx, scope, 'same-hash', run);
    expect(first).toEqual({ id: 42 });
    expect(second).toEqual({ id: 42 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('Q-P5-6: same (actor, route, key) with a different request hash is 409 CONFLICT_STATE and never re-runs the side effect', async () => {
    const { tx } = makeTx();
    const run = vi.fn(async () => ({ id: 42 }));
    const scope = { actorId: 1, route: 'POST /room-prices', key: 'K2', statusCode: 201 };
    await runIdempotent(tx, scope, 'hash-a', run);
    await expect(runIdempotent(tx, scope, 'hash-b', run)).rejects.toMatchObject({
      constructor: ConflictException, status: 409, response: { message: 'CONFLICT_STATE' },
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('Q-P5-6: the same key on a different route is an independent record (both run)', async () => {
    const { tx } = makeTx();
    const run = vi.fn(async () => ({ id: 1 }));
    await runIdempotent(tx, { actorId: 1, route: 'POST /room-prices', key: 'SAME', statusCode: 201 }, 'hash', run);
    await runIdempotent(tx, { actorId: 1, route: 'POST /room-prices/:id/approve', key: 'SAME', statusCode: 200 }, 'hash', run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('Q-P5-6: the same key for a different actor is an independent record and never leaks actor A\'s response to actor B', async () => {
    const { tx } = makeTx();
    const runA = vi.fn(async () => ({ id: 'A-result' }));
    const runB = vi.fn(async () => ({ id: 'B-result' }));
    const resultA = await runIdempotent(tx, { actorId: 1, route: 'POST /room-prices', key: 'SAME', statusCode: 201 }, 'hash', runA);
    const resultB = await runIdempotent(tx, { actorId: 2, route: 'POST /room-prices', key: 'SAME', statusCode: 201 }, 'hash', runB);
    expect(resultA).toEqual({ id: 'A-result' });
    expect(resultB).toEqual({ id: 'B-result' });
    expect(runA).toHaveBeenCalledTimes(1);
    expect(runB).toHaveBeenCalledTimes(1);
  });

  it('Q-P5-6: a record older than 24 hours is treated as missing, deleted, and the request re-runs', async () => {
    const { tx, store } = makeTx();
    const run = vi.fn(async () => ({ id: 1 }));
    const scope = { actorId: 1, route: 'POST /room-prices', key: 'EXPIRING', statusCode: 201 };
    await runIdempotent(tx, scope, 'hash', run);
    const stored = store.get('1|POST /room-prices|EXPIRING');
    stored.expiresAt = new Date(Date.now() - 1000); // force past expiry
    await runIdempotent(tx, scope, 'hash', run);
    expect(run).toHaveBeenCalledTimes(2);
    expect(tx.pricingIdempotencyKey.delete).toHaveBeenCalledTimes(1);
  });

  it('hashRequest: the same object (any key order) hashes identically, a changed field hashes differently', () => {
    const a = hashRequest({ roomId: 1, price: 2500000, effectiveFrom: '2026-11-10', reason: null });
    const b = hashRequest({ roomId: 1, price: 2500000, effectiveFrom: '2026-11-10', reason: null });
    const c = hashRequest({ roomId: 1, price: 2600000, effectiveFrom: '2026-11-10', reason: null });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

// HTTP-level: confirms the contract end to end through the real controller/ValidationPipe,
// with only PrismaService mocked.
describe('CP-1 · BE-P2-22 · Idempotency-Key over HTTP (API-05, Q-P5-6)', () => {
  let app: INestApplication;
  let tokens: TokenService;
  const users = new Map<number, any>([[1, { id: 1, role: 'BOSS', isActive: true, mustChangePassword: false }]]);
  let roomPriceRows: any[] = [];
  let nextId = 1;
  let idempotencyStore = new Map<string, any>();

  const fakePrisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    room: {
      findUnique: vi.fn(async ({ where }: any) => (where.id === 101 ? { id: 101, buildingId: 10, isActive: true, building: { isActive: true } } : null)),
      // CP-4: Boss self-approve (PRC-04) moves rooms.price through this same mock.
      update: vi.fn(async ({ data }: any) => ({ id: 101, buildingId: 10, isActive: true, ...data })),
    },
    roomPrice: {
      // CP-4: approveRoomPriceInTx (Boss self-approve, PRC-04) re-reads the row under the lock.
      findUnique: vi.fn(async ({ where }: any) => {
        const row = roomPriceRows.find((r) => r.id === where.id);
        if (!row) return null;
        return { ...row, room: { buildingId: 10, isActive: true, building: { isActive: true } } };
      }),
      // CP-6: toView's oldRoomPrice comparison lookup; no prior APPROVED price in these CP-1 fixtures.
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = roomPriceRows.filter((row) => {
          if (where.id !== undefined && row.id !== where.id) return false;
          if (where.roomId !== undefined && row.roomId !== where.roomId) return false;
          if (where.status !== undefined && row.status !== where.status) return false;
          if (where.effectiveFrom?.gte !== undefined && compareDates(row.effectiveFrom, where.effectiveFrom.gte) < 0) return false;
          return true;
        });
        matches.forEach((row) => Object.assign(row, data));
        return { count: matches.length };
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: nextId++, reviewedById: null, reviewedAt: null, reviewNote: null, createdAt: new Date(), ...data };
        roomPriceRows.push(row);
        return row;
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => ({ id: 1, ...data })) },
    pricingIdempotencyKey: {
      findUnique: vi.fn(async ({ where }: any) => {
        const k = where.actorId_route_key;
        return idempotencyStore.get(`${k.actorId}|${k.route}|${k.key}`) ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        idempotencyStore.set(`${data.actorId}|${data.route}|${data.key}`, { ...data });
        return data;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const k = where.actorId_route_key;
        idempotencyStore.delete(`${k.actorId}|${k.route}|${k.key}`);
      }),
    },
    $queryRaw: vi.fn(async () => [{ id: 1 }]),
    $transaction: vi.fn(async (work: (tx: any) => Promise<unknown>) => work({
      $queryRaw: fakePrisma.$queryRaw, room: fakePrisma.room, roomPrice: fakePrisma.roomPrice,
      auditLog: fakePrisma.auditLog, pricingIdempotencyKey: fakePrisma.pricingIdempotencyKey,
    })),
    $disconnect: vi.fn(async () => undefined),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'draft-only-test-secret-never-used-outside-this-process';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(fakePrisma).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    tokens = moduleRef.get(TokenService);
  });
  afterAll(async () => { await app.close(); delete process.env.JWT_SECRET; });
  beforeEach(() => { roomPriceRows = []; nextId = 1; idempotencyStore = new Map(); });

  async function auth(id: number, role: 'BOSS') {
    return `Bearer ${await tokens.signAccessToken({ id, role } as any)}`;
  }
  const body = (price = 2500000) => ({ roomId: 101, price, effectiveFrom: formatDateOnly(todayHanoi()) });

  it('API-05: without an Idempotency-Key header, each request runs independently', async () => {
    const auth1 = await auth(1, 'BOSS');
    const r1 = await request(app.getHttpServer()).post('/api/v1/room-prices').set('Authorization', auth1).send(body());
    const r2 = await request(app.getHttpServer()).post('/api/v1/room-prices').set('Authorization', auth1).send(body());
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.data.id).not.toBe(r2.body.data.id);
    expect(roomPriceRows).toHaveLength(2);
  });

  it('[ASSUMPTION P5-2] an empty Idempotency-Key header is 400 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS')).set('Idempotency-Key', '').send(body());
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(roomPriceRows).toHaveLength(0);
  });

  it('[ASSUMPTION P5-2] a 256-character Idempotency-Key header is 400 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', await auth(1, 'BOSS')).set('Idempotency-Key', 'k'.repeat(256)).send(body());
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(roomPriceRows).toHaveLength(0);
  });

  it('Q-P5-6: the same key with the same payload replays the first response and creates only one room_price row', async () => {
    const token = await auth(1, 'BOSS');
    const first = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', token).set('Idempotency-Key', 'REQ-1').send(body());
    const second = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', token).set('Idempotency-Key', 'REQ-1').send(body());
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(roomPriceRows).toHaveLength(1);
  });

  it('Q-P5-6: the same key with a different payload is 409 CONFLICT_STATE and does not create a second row', async () => {
    const token = await auth(1, 'BOSS');
    const first = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', token).set('Idempotency-Key', 'REQ-2').send(body(2500000));
    expect(first.status).toBe(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/room-prices').set('Authorization', token).set('Idempotency-Key', 'REQ-2').send(body(2600000));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT_STATE');
    expect(roomPriceRows).toHaveLength(1);
  });
});
