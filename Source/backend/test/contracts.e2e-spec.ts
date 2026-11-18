import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/crypto/password.js';
import { addDays, formatDateOnly, todayHanoi } from '../src/common/date/today.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { lockViewingMapping } from '../src/common/viewings/viewing-lock.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { MailerService } from '../src/modules/mailer/mailer.service.js';
import {
  CLEANUP_NOTE, E2eRun, cleanupContractRun, contractFixtureTerms, e2eName, e2eServiceName,
  randomPassword, uniqueBuildingCode, uniquePhone,
} from '../scripts/e2e/run.js';

vi.setConfig({ testTimeout: 180_000, hookTimeout: 240_000 });

describe('BE-P3-12 real contracts, viewing transitions and call tasks', () => {
  let app: INestApplication, prisma: PrismaService, run: E2eRun | undefined;
  let boss: { id: number; token: string }, managerToken: string, managerId: number;
  let buildingId: number, otherRoomId: number, serviceId: number, passwordHash: string;
  const roomIds: number[] = [];
  const rent = 3_000_000;

  function api(method: 'get' | 'post', path: string, token: string) {
    return request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', token);
  }

  async function fixtureUser(role: 'MANAGER' | 'GUEST', label: string) {
    const phone = await uniquePhone(async value => !!await prisma.user.findUnique({ where: { phone: value }, select: { id: true } }));
    const account = await prisma.user.create({ data: {
      role, phone, passwordHash, fullName: e2eName(run!.runId, label), mustChangePassword: false,
      email: `${phone}.${run!.runId}@example.test`, emailVerifiedAt: new Date(), locale: 'en',
    } });
    run!.record('users', account.id);
    return account;
  }

  async function fixtureBuilding(label: string, manager?: number) {
    const code = await uniqueBuildingCode(async value => !!await prisma.building.findUnique({ where: { code: value }, select: { id: true } }));
    const building = await prisma.building.create({ data: {
      code, name: e2eName(run!.runId, label), address: '[E2E] Hanoi', district: 'Cầu Giấy', ward: 'Dịch Vọng',
      waterMode: 'PER_M3', managerId: manager,
    } });
    run!.record('buildings', building.id);
    run!.recordBuildingCode(code);
    return building.id;
  }

  async function fixtureRate(parent: number, kind: 'ELECTRIC' | 'WATER' | 'SERVICE', service?: number) {
    const rate = await prisma.ratePlan.create({ data: {
      buildingId: parent, kind, serviceId: service, effectiveFrom: addDays(todayHanoi(), -1), status: 'APPROVED',
      proposedById: boss.id, reviewedById: boss.id, reviewedAt: new Date(),
      tiers: { create: [{ tierNo: 1, unitPrice: 3_500 }] },
    } });
    run!.record('rate_plans', rate.id);
  }

  async function fixtureRoom(parent: number, code: string) {
    const room = await prisma.room.create({ data: { buildingId: parent, code, floor: 1, areaM2: 25, price: rent } });
    run!.record('rooms', room.id);
    return room.id;
  }

  async function fixtureViewing(roomId: number, guest: Awaited<ReturnType<typeof fixtureUser>>, status: 'NEW' | 'CONFIRMED') {
    const day = formatDateOnly(addDays(todayHanoi(), 1));
    const row = await prisma.viewing.create({ data: {
      roomId, userId: guest.id, guestName: guest.fullName, guestPhone: guest.phone,
      status, source: 'WEB', visitAt: new Date(`${day}T10:00:00+07:00`),
    } });
    run!.record('viewings', row.id);
    return row.id;
  }

  function contract(roomId: number, signer: Awaited<ReturnType<typeof fixtureUser>>) {
    return {
      roomId, signer: { fullName: signer.fullName, phone: signer.phone },
      startDate: formatDateOnly(addDays(todayHanoi(), 1)), termMonths: 3,
      terms: contractFixtureTerms(run!.runId), serviceIds: [serviceId],
    };
  }

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailerService).useValue({ send: vi.fn(async () => {}) }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const tokens = app.get(TokenService);
    const owner = await prisma.user.findFirstOrThrow({ where: { role: 'BOSS', isActive: true } });
    await prisma.viewing.findFirst({ select: { calledAt: true, depositCancelledByContractId: true } });
    boss = { id: owner.id, token: `Bearer ${await tokens.signAccessToken(owner)}` };

    run = new E2eRun(undefined, undefined, 'contracts');
    passwordHash = await hashPassword(randomPassword());
    const manager = await fixtureUser('MANAGER', 'Contract manager');
    managerToken = `Bearer ${await tokens.signAccessToken(manager)}`;
    managerId = manager.id;
    buildingId = await fixtureBuilding('Managed contracts', manager.id);
    const otherBuildingId = await fixtureBuilding('Out of scope');
    for (const parent of [buildingId, otherBuildingId]) {
      await fixtureRate(parent, 'ELECTRIC');
      await fixtureRate(parent, 'WATER');
    }
    const service = await prisma.service.create({ data: { buildingId, name: e2eServiceName(run.runId), unit: 'ROOM' } });
    serviceId = service.id;
    run.record('services', serviceId);
    await fixtureRate(buildingId, 'SERVICE', serviceId);
    for (const code of ['P1', 'P2', 'P3']) roomIds.push(await fixtureRoom(buildingId, code));
    otherRoomId = await fixtureRoom(otherBuildingId, 'P1');
  });

  afterAll(async () => {
    try {
      if (!run) return;
      const { log } = run;
      const { ids } = log;
      await prisma.$transaction(async tx => {
        // Take the same locks as contract creation before deciding whether a link is protected.
        await lockViewingMapping(tx, true);
        if (ids.rooms.length > 0) {
          await tx.$queryRaw`SELECT id FROM rooms WHERE id IN (${Prisma.join(ids.rooms)}) ORDER BY id FOR UPDATE`;
        }
        expect(await cleanupContractRun(tx, log)).toEqual([]);
        const [contracts, viewings, buildings, rooms, users, services] = await Promise.all([
          tx.contract.count({ where: { roomId: { in: ids.rooms }, status: { in: ['HOLD', 'ACTIVE'] } } }),
          tx.viewing.count({ where: { id: { in: ids.viewings }, OR: [
            { status: { in: ['NEW', 'CONFIRMED'] } }, { depositCancelledByContractId: { not: null }, calledAt: null },
          ] } }),
          tx.building.count({ where: { id: { in: ids.buildings }, isActive: true } }),
          tx.room.count({ where: { id: { in: ids.rooms }, isActive: true } }),
          tx.user.count({ where: { id: { in: ids.users }, isActive: true } }),
          tx.service.count({ where: { id: { in: ids.services }, isActive: true } }),
        ]);
        expect({ contracts, viewings, buildings, rooms, users, services }).toEqual({
          contracts: 0, viewings: 0, buildings: 0, rooms: 0, users: 0, services: 0,
        });
      }, { maxWait: 10_000, timeout: 60_000 });
      run.finish('CLEANED');
      console.log(`BE-P3-12 ${run.runId} CLEANED (${CLEANUP_NOTE})`);
    } catch (error) {
      run?.finish('FAILED_CLEANUP');
      throw error;
    } finally {
      await app?.close();
      vi.unstubAllEnvs();
    }
  });

  it('CON-02/SCOPE-02: outside manager cannot create a HOLD in an eligible room', async () => {
    const signer = await fixtureUser('GUEST', 'Outside signer');
    const response = await api('post', '/contracts', managerToken)
      .send({ ...contract(otherRoomId, signer), serviceIds: [], confirmedGuestAccountId: signer.id }).expect(403);
    expect(response.body.error.code).toBe('OUT_OF_SCOPE');
    expect(await prisma.contract.count({ where: { roomId: otherRoomId } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: signer.id } })).toMatchObject({ role: 'GUEST' });
  });

  it('CON-03..07/VIEW-05/06/D-39: Chốt confirms guest identity, cancels other viewings and records one call', async () => {
    const owner = await fixtureUser('GUEST', 'Original viewing owner');
    const signer = await fixtureUser('GUEST', 'Different signer');
    const confirmedGuest = await fixtureUser('GUEST', 'Another confirmed viewer');
    const source = await fixtureViewing(roomIds[0], owner, 'CONFIRMED');
    const cancelled = await fixtureViewing(roomIds[0], signer, 'NEW');
    const confirmedCancelled = await fixtureViewing(roomIds[0], confirmedGuest, 'CONFIRMED');
    const untouched = await fixtureViewing(otherRoomId, signer, 'NEW');
    const input = { ...contract(roomIds[0], signer), viewingId: source };
    const post = () => api('post', '/contracts', managerToken);

    const unconfirmedOwner = await post().send({ ...input, confirmedGuestAccountId: signer.id }).expect(409);
    expect(unconfirmedOwner.body.error).toMatchObject({ code: 'CONFLICT_STATE', fields: { confirmDifferentViewingOwner: expect.any(String) } });
    const unconfirmedAccount = await post().send({ ...input, confirmDifferentViewingOwner: true }).expect(409);
    expect(unconfirmedAccount.body.error).toMatchObject({ code: 'PHONE_TAKEN', fields: { guestAccountId: String(signer.id) } });

    const idNumber = '000123456789';
    const response = await post().send({
      ...input, confirmedGuestAccountId: signer.id, confirmDifferentViewingOwner: true,
      signer: { ...input.signer, idNumber },
    }).expect(201);
    const id: number = response.body.data.id;
    expect(response.body.data).toMatchObject({ status: 'HOLD', rent, deposit: rent, code: `HD${String(id).padStart(6, '0')}`, tenant: { id: signer.id } });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: signer.id } })).toMatchObject({ role: 'TENANT', passwordHash, locale: 'en', isActive: true });
    expect(await prisma.viewing.findUniqueOrThrow({ where: { id: source } })).toMatchObject({ status: 'WON', contractId: id, userId: owner.id });
    for (const viewingId of [cancelled, confirmedCancelled]) {
      expect(await prisma.viewing.findUniqueOrThrow({ where: { id: viewingId } })).toMatchObject({
        status: 'CANCELLED', depositCancelledByContractId: id, note: 'Phòng đã có người đặt cọc', calledAt: null,
      });
    }
    expect(await prisma.viewing.findUniqueOrThrow({ where: { id: untouched } })).toMatchObject({ status: 'NEW', depositCancelledByContractId: null });

    const detail = await api('get', `/contracts/${id}`, managerToken).expect(200);
    expect(detail.body.data.occupants).toEqual([expect.objectContaining({ isSigner: true, idNumberLast4: '6789' })]);
    expect(detail.body.data.occupants[0]).not.toHaveProperty('idNumberEnc');
    expect(JSON.stringify(detail.body)).not.toContain(idNumber);
    expect(detail.body.data.services).toEqual([expect.objectContaining({ id: serviceId, unit: 'ROOM' })]);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'contract.create', entity: 'contract', entityId: id } });
    expect(audit).toMatchObject({ actorId: managerId, after: {
      viewingId: source, cancelledViewingIds: expect.arrayContaining([cancelled, confirmedCancelled]),
    } });
    expect((audit.after as Prisma.JsonObject).cancelledViewingIds).toHaveLength(2);
    expect(await prisma.auditLog.count({ where: { action: 'user.role_change', entity: 'user', entityId: signer.id } })).toBe(1);

    const dashboard = () => api('get', `/dashboard?buildingId=${buildingId}`, managerToken).expect(200);
    expect((await dashboard()).body.data.depositCancelledViewings).toMatchObject({
      count: 2, items: expect.arrayContaining([expect.objectContaining({ id: cancelled }), expect.objectContaining({ id: confirmedCancelled })]),
    });
    const path = `/viewings/${cancelled}/called`;
    const [a, b] = await Promise.all([api('post', path, managerToken).expect(200), api('post', path, boss.token).expect(200)]);
    const call = a.body.data;
    expect([managerId, boss.id]).toContain(call.calledById);
    expect(new Date(call.calledAt).toISOString()).toBe(call.calledAt);
    expect(b.body.data).toMatchObject({ calledById: call.calledById, calledAt: call.calledAt });
    expect(await prisma.viewing.findUniqueOrThrow({ where: { id: cancelled } })).toMatchObject({
      status: 'CANCELLED', calledById: call.calledById, calledAt: new Date(call.calledAt),
    });
    expect((await dashboard()).body.data.depositCancelledViewings).toMatchObject({ count: 1, items: [{ id: confirmedCancelled }] });
  });

  it('CON-02/07: two contract creations for one room produce one HOLD and roll back the losing account', async () => {
    const first = await fixtureUser('GUEST', 'First racing signer');
    const second = await fixtureUser('GUEST', 'Second racing signer');
    const results = await Promise.all([first, second].map(signer => api('post', '/contracts', managerToken)
      .send({ ...contract(roomIds[1], signer), confirmedGuestAccountId: signer.id })));
    expect(results.map(result => result.status).sort((a, b) => a - b)).toEqual([201, 409]);
    const winner = results.findIndex(result => result.status === 201);
    const loser = [first, second][1 - winner];
    expect(results[1 - winner].body.error.code).toBe('ROOM_NOT_AVAILABLE');
    expect(await prisma.contract.findMany({ where: { roomId: roomIds[1] }, select: { id: true, status: true, tenantId: true } }))
      .toEqual([{ id: results[winner].body.data.id, status: 'HOLD', tenantId: [first, second][winner].id }]);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: loser.id } })).toMatchObject({ role: 'GUEST', passwordHash });
    expect(await prisma.auditLog.count({ where: { entity: 'user', entityId: loser.id, action: 'user.role_change' } })).toBe(0);
  });

  it('CON-05/07/VIEW-05/06/AUD-01: failure after the audit write rolls back the full operation', async () => {
    const signer = await fixtureUser('GUEST', 'Rollback signer');
    const source = await fixtureViewing(roomIds[2], signer, 'CONFIRMED');
    const alternate = await fixtureUser('GUEST', 'Rollback alternate');
    const other = await fixtureViewing(roomIds[2], alternate, 'NEW');
    const audit = app.get(AuditService);
    const log = audit.log.bind(audit);
    let attemptedContractId: number | undefined;
    const failure = vi.spyOn(audit, 'log').mockImplementation(async (...args) => {
      await log(...args);
      if (args[1] === 'contract.create') {
        attemptedContractId = args[3];
        throw new Error('BE-P3-12 simulated failure after writing the contract audit');
      }
    });
    try {
      await api('post', '/contracts', managerToken)
        .send({ ...contract(roomIds[2], signer), viewingId: source, confirmedGuestAccountId: signer.id }).expect(500);
    } finally {
      failure.mockRestore();
    }
    expect(attemptedContractId).toBeTypeOf('number');
    expect(await prisma.contract.count({ where: { roomId: roomIds[2] } })).toBe(0);
    expect(await prisma.occupant.count({ where: { contractId: attemptedContractId } })).toBe(0);
    expect(await prisma.contractService.count({ where: { contractId: attemptedContractId } })).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: signer.id } })).toMatchObject({ role: 'GUEST', passwordHash });
    expect(await prisma.viewing.findUniqueOrThrow({ where: { id: source } })).toMatchObject({ status: 'CONFIRMED', userId: signer.id, contractId: null });
    expect(await prisma.viewing.findUniqueOrThrow({ where: { id: other } })).toMatchObject({ status: 'NEW', depositCancelledByContractId: null });
    expect(await prisma.auditLog.count({ where: { OR: [
      { entity: 'contract', entityId: attemptedContractId, action: 'contract.create' },
      { entity: 'user', entityId: signer.id, action: 'user.role_change' },
    ] } })).toBe(0);
  });
});
