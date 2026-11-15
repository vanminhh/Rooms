import { existsSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { hashPassword } from '../src/common/crypto/password.js';
import { addDays, formatDateOnly, todayHanoi } from '../src/common/date/today.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { MailerService } from '../src/modules/mailer/mailer.service.js';
import { cleanupRun, E2eRun, uniqueBuildingCode, uniquePhone, randomPassword } from '../scripts/e2e/run.js';

// EX-6: real HTTP/Postgres races. No seed import/call and no changes to existing accounts.
if (existsSync('.env')) process.loadEnvFile('.env');
vi.setConfig({ testTimeout: 180_000, hookTimeout: 240_000 });

describe('BE-EX-24 real viewing transactions, no seed', () => {
  let app: INestApplication, prisma: PrismaService, tokens: TokenService, run: E2eRun;
  let bossId: number, boss: string, manager: string, passwordHash: string;
  const buildings: number[] = [], rooms: number[][] = [];
  const day = formatDateOnly(addDays(todayHanoi(), 1));
  const at = (hour: number) => `${day}T${String(hour).padStart(2, '0')}:00:00+07:00`;
  const sendMail = vi.fn(async () => {});

  async function api(method: 'get' | 'post' | 'patch', path: string, token: string, body?: object) {
    let req = request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', token);
    if (body) req = req.send(body);
    const result = await req;
    if (result.status === 201 && (path === '/me/viewings' || path === '/viewings') && result.body.data?.id) run.record('viewings', result.body.data.id);
    return result;
  }
  async function user(role: 'GUEST' | 'MANAGER' = 'GUEST') {
    const phone = await uniquePhone(async p => !!await prisma.user.findUnique({ where: { phone: p }, select: { id: true } }));
    const account = await prisma.user.create({ data: { role, phone, fullName: `[E2E ${run.runId}] ${role}`,
      email: `${phone}.${run.runId}@example.test`, emailVerifiedAt: new Date(), locale: 'en', passwordHash, mustChangePassword: false,
      ...(role === 'MANAGER' ? { contactPhone: phone } : {}) } });
    run.record('users', account.id);
    return { ...account, token: `Bearer ${await tokens.signAccessToken(account)}` };
  }
  async function book(token: string, roomId: number, hour: number) { return api('post', '/me/viewings', token, { roomId, visitAt: at(hour) }); }
  async function manual(roomId: number, phone: string, hour: number) {
    return api('post', '/viewings', boss, { roomId, guestName: `[E2E ${run.runId}] Manual`, guestPhone: phone, visitAt: at(hour) });
  }
  async function openAt(buildingId: number, hour: number) {
    return prisma.viewing.findMany({ where: { room: { buildingId }, visitAt: new Date(at(hour)), status: { in: ['NEW', 'CONFIRMED'] } } });
  }
  function oneWinner(results: request.Response[], code: string) {
    expect(results.map(r => r.status).sort((a, b) => a - b)).toEqual([201, code === 'TOO_MANY_REQUESTS' ? 429 : 409]);
    expect(results.find(r => r.status !== 201)!.body.error.code).toBe(code);
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailerService).useValue({ send: sendMail }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
    prisma = app.get(PrismaService); tokens = app.get(TokenService);
    const owner = await prisma.user.findFirstOrThrow({ where: { role: 'BOSS', isActive: true } });
    bossId = owner.id; boss = `Bearer ${await tokens.signAccessToken(owner)}`;
    // Start the cleanup log only after the connection preflight succeeds.
    run = new E2eRun(); passwordHash = await hashPassword(randomPassword());
    const managerA = await user('MANAGER'), managerB = await user('MANAGER'); manager = managerA.token;
    for (let index = 0; index < 3; index++) {
      const code = await uniqueBuildingCode(async c => !!await prisma.building.findUnique({ where: { code: c }, select: { id: true } }));
      const created = await prisma.building.create({ data: { code, name: `[E2E ${run.runId}] ${index}`, address: '[E2E] Hà Nội', district: 'Cầu Giấy', ward: 'Dịch Vọng', waterMode: 'PER_M3', managerId: index === 2 ? managerB.id : managerA.id } });
      run.record('buildings', created.id); run.recordBuildingCode(code); buildings.push(created.id); rooms.push([]);
      for (const kind of ['ELECTRIC', 'WATER'] as const) {
        const rate = await prisma.ratePlan.create({ data: { buildingId: created.id, kind, effectiveFrom: todayHanoi(), status: 'APPROVED', proposedById: bossId, reviewedById: bossId, reviewedAt: new Date(), tiers: { create: [{ tierNo: 1, upTo: null, unitPrice: 3500 }] } } });
        run.record('rate_plans', rate.id);
      }
      for (let n = 0; n < 5; n++) {
        const room = await prisma.room.create({ data: { buildingId: created.id, code: `P${n + 1}`, floor: 1, areaM2: 25, price: 3000000 } });
        run.record('rooms', room.id); rooms[index].push(room.id);
      }
    }
  });
  afterAll(async () => {
    try {
      if (run) {
        // Include a committed test booking even if a later response assertion failed.
        const rows = await prisma.viewing.findMany({ where: { roomId: { in: run.log.ids.rooms } }, select: { id: true } });
        rows.forEach(row => run.record('viewings', row.id));
        expect(await cleanupRun(prisma, run.log)).toEqual([]); run.finish('CLEANED');
      }
    } catch (error) { run?.finish('FAILED_CLEANUP'); throw error; }
    finally { await app?.close(); }
  });

  it('VIEW-16: two accounts race for the third place: exactly one succeeds', async () => {
    const a = await user(), b = await user(), c = await user(), d = await user();
    expect((await book(a.token, rooms[0][0], 8)).status).toBe(201);
    expect((await book(b.token, rooms[0][1], 8)).status).toBe(201);
    const results = await Promise.all([book(c.token, rooms[0][2], 8), book(d.token, rooms[0][3], 8)]);
    oneWinner(results, 'VIEWING_TIME_TAKEN'); expect(new Set((await openAt(buildings[0], 8)).map(r => r.guestPhone)).size).toBe(3);
  });
  it('VIEW-02: two requests race for daily booking three: cancelled creations still count', async () => {
    const guest = await user();
    for (let n = 0; n < 2; n++) {
      const created = await book(guest.token, rooms[0][n], 9); expect(created.status).toBe(201);
      expect((await api('post', `/me/viewings/${created.body.data.id}/cancel`, guest.token)).status).toBe(201);
    }
    oneWinner(await Promise.all([book(guest.token, rooms[0][2], 9), book(guest.token, rooms[0][3], 9)]), 'TOO_MANY_REQUESTS');
    expect(await prisma.viewing.count({ where: { userId: guest.id, source: 'WEB' } })).toBe(3);
  });
  it('VIEW-02a: concurrent same-account/same-room requests create one open row', async () => {
    const guest = await user();
    oneWinner(await Promise.all([book(guest.token, rooms[0][0], 10), book(guest.token, rooms[0][0], 10)]), 'CONFLICT_STATE');
  });
  it('VIEW-16: mixed WEB/MANUAL race cannot consume a fourth place', async () => {
    const a = await user(), b = await user(), c = await user(), d = await user();
    expect((await manual(rooms[0][0], a.phone, 11)).status).toBe(201);
    expect((await manual(rooms[0][1], b.phone, 11)).status).toBe(201);
    oneWinner(await Promise.all([book(c.token, rooms[0][2], 11), manual(rooms[0][3], d.phone, 11)]), 'VIEWING_TIME_TAKEN');
    expect(new Set((await openAt(buildings[0], 11)).map(r => r.guestPhone)).size).toBe(3);
  });
  it('VIEW-16/21: manual-only phone at full capacity can book two extra rooms concurrently', async () => {
    const a = await user(), b = await user(), c = await user();
    for (const guest of [a, b, c]) expect((await manual(rooms[0][0], guest.phone, 12)).status).toBe(201);
    const range = `?from=${day}&to=${day}`;
    const pub = await api('get', `/public/rooms/${rooms[0][1]}/viewing-times${range}`, '');
    const own = await api('get', `/me/rooms/${rooms[0][1]}/viewing-times${range}`, a.token);
    expect(pub.body.data[0].hours).not.toContain(new Date(at(12)).toISOString());
    expect(own.body.data[0].hours).toContain(new Date(at(12)).toISOString());
    const results = await Promise.all([book(a.token, rooms[0][1], 12), book(a.token, rooms[0][2], 12)]);
    expect(results.map(r => r.status)).toEqual([201, 201]);
    expect(new Set((await openAt(buildings[0], 12)).map(r => r.guestPhone)).size).toBe(3);
  });
  it('VIEW-16: same phone races across buildings with different managers: only one succeeds', async () => {
    const guest = await user();
    oneWinner(await Promise.all([book(guest.token, rooms[0][0], 13), manual(rooms[2][0], guest.phone, 13)]), 'VIEWING_TIME_TAKEN');
  });
  it('VIEW-16: same responsible races across buildings with different phones: only one succeeds', async () => {
    const a = await user(), b = await user();
    oneWinner(await Promise.all([book(a.token, rooms[0][0], 14), book(b.token, rooms[1][0], 14)]), 'VIEWING_TIME_TAKEN');
  });
  it('VIEW-18: only cancellation of the last room releases a phone place', async () => {
    const a = await user(), b = await user(), c = await user(), d = await user();
    const first = await book(a.token, rooms[0][0], 15), second = await book(a.token, rooms[0][1], 15);
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    expect((await manual(rooms[0][2], b.phone, 15)).status).toBe(201); expect((await manual(rooms[0][3], c.phone, 15)).status).toBe(201);
    expect((await api('post', `/me/viewings/${first.body.data.id}/cancel`, a.token)).status).toBe(201);
    expect((await book(d.token, rooms[0][4], 15)).body.error.code).toBe('VIEWING_TIME_TAKEN');
    expect((await api('post', `/me/viewings/${second.body.data.id}/cancel`, a.token)).status).toBe(201);
    expect((await book(d.token, rooms[0][4], 15)).status).toBe(201);
  });
  it('VIEW-09/16: reschedule and new booking race for the same last place', async () => {
    const a = await user(), b = await user(), c = await user(), d = await user();
    expect((await manual(rooms[0][0], a.phone, 16)).status).toBe(201);
    expect((await manual(rooms[0][1], b.phone, 16)).status).toBe(201);
    const moving = await manual(rooms[0][2], c.phone, 17); expect(moving.status).toBe(201);
    const results = await Promise.all([api('patch', `/viewings/${moving.body.data.id}`, boss, { visitAt: at(16) }), book(d.token, rooms[0][3], 16)]);
    expect(results.filter(r => r.status === 200 || r.status === 201)).toHaveLength(1);
    expect(results.find(r => r.status === 409)!.body.error.code).toBe('VIEWING_TIME_TAKEN');
    expect(new Set((await openAt(buildings[0], 16)).map(r => r.guestPhone)).size).toBe(3);
  });
  it('VIEW-08/15/18/20: legacy retains its label, can confirm/cancel/convert, never owned by phone', async () => {
    const guest = await user();
    const legacy = await prisma.viewing.create({ data: { roomId: rooms[2][0], guestName: guest.fullName, guestPhone: guest.phone, visitDate: addDays(todayHanoi(), 2), timeSlot: 'AFTERNOON', status: 'NEW', source: 'WEB' } });
    run.record('viewings', legacy.id);
    expect((await api('get', `/me/viewings/${legacy.id}`, guest.token)).status).toBe(404);
    const confirmed = await api('post', `/viewings/${legacy.id}/confirm`, boss, { via: 'PHONE' });
    expect(confirmed.status).toBe(201); expect(confirmed.body.data.timeSlotLabel).toBe('Chiều (14:00–17:00)'); expect(confirmed.body.data.visitAt).toBeNull();
    const converted = await api('patch', `/viewings/${legacy.id}`, boss, { visitAt: at(18) });
    expect(converted.status).toBe(200); expect(converted.body.data.visitDate).toBeNull(); expect(converted.body.data.timeSlot).toBeNull();
    expect((await api('patch', `/viewings/${legacy.id}`, boss, { status: 'CANCELLED', note: '[E2E] khách hủy' })).status).toBe(200);
  });
  it('VIEW-13/22: maintenance/room/building lock preserve open rows and move locked building work to Boss', async () => {
    const guest = await user(); const created = await book(guest.token, rooms[0][4], 19); expect(created.status).toBe(201);
    const id = created.body.data.id;
    for (const patch of [{ underMaintenance: true }, { isActive: false }]) {
      expect((await api('patch', `/rooms/${rooms[0][4]}`, boss, patch)).status).toBe(200);
      expect((await prisma.viewing.findUniqueOrThrow({ where: { id } })).status).toBe('NEW');
    }
    expect((await api('patch', `/buildings/${buildings[0]}`, boss, { isActive: false })).status).toBe(200);
    expect((await prisma.viewing.findUniqueOrThrow({ where: { id } })).status).toBe('NEW');
    expect((await api('get', `/viewings?buildingId=${buildings[0]}`, manager)).status).toBe(403);
    expect((await api('get', `/me/viewings/${id}`, guest.token)).status).toBe(200);
    const dashboard = await api('get', `/dashboard?buildingId=${buildings[0]}`, boss);
    expect(dashboard.status).toBe(200); expect(dashboard.body.data.newViewings.count).toBeGreaterThan(0);
    expect((await manual(rooms[0][0], guest.phone, 19)).status).toBe(201); // active room, Boss scope
  });
});
