import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role, ServiceUnit } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/crypto/password.js';
import { contractEndDate } from '../src/common/date/period.js';
import { addDays, formatDateOnly, todayHanoi } from '../src/common/date/today.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { MailerService } from '../src/modules/mailer/mailer.service.js';
import { e2eName, e2eServiceName, newRunId, randomPassword, uniqueBuildingCode, uniquePhone, uniqueVehiclePlate } from '../scripts/e2e/run.js';
import { rollbackPrismaFacade } from './fixtures/rollback-prisma.js';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

// Sequential route savepoints on ONE outer transaction. The separate plate-race
// case in contracts.e2e-spec.ts is required for independent-transaction proof.
describe('BE-P3-27: real PostgreSQL occupant, vehicle and service workflows with outer rollback', () => {
  it('CON-13..16/DB-B5/B6/B9/D-07: registration, private views, services, cancellation and rollback', async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('MAIL_PROVIDER', '');
    vi.stubEnv('JWT_SECRET', 'test-only-registrations-workflow-jwt-0123456789');
    vi.stubEnv('CCCD_KEY', Buffer.alloc(32, 93).toString('base64'));
    vi.stubEnv('CLOUDINARY_URL', 'cloudinary://registrations-key:registrations-secret@rooms-registrations');
    const runId = newRunId(), rollback = new Error('BE-P3-27 expected outer rollback');
    const owned = { users: [] as number[], buildings: [] as number[], rooms: [] as number[], services: [] as number[],
      ratePlans: [] as number[], contracts: [] as number[] };
    const privateValues = ['000123456789'];
    const logs: unknown[][] = [];
    const log = (...args: unknown[]) => { logs.push(args); };
    const logger: LoggerService = { log, error: log, warn: log, debug: log, verbose: log };
    const mailer = { send: vi.fn(async () => {}) };
    const metadata = new Map<string, object>();
    const provider = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const prefix = 'https://api.cloudinary.com/v1_1/rooms-registrations/resources/';
      const body = url.startsWith(prefix) ? metadata.get(url.slice(prefix.length)) : undefined;
      if (!body || init?.method !== 'GET') throw new Error('Unexpected outbound request in registration workflow');
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', provider);
    let prisma: PrismaService | undefined, app: INestApplication | undefined, finished = false;
    const privateKeys = new Set(['passwordHash', 'idNumberEnc', 'signedScanAssetId', 'idFrontAssetId', 'idBackAssetId', 'temporaryPassword']);
    const hasPrivateKeys = (value: unknown): boolean => !!value && typeof value === 'object' &&
      Object.entries(value).some(([key, child]) => privateKeys.has(key) || hasPrivateKeys(child));
    const safe = (value: unknown, label: string) => {
      expect(hasPrivateKeys(value), `${label}: forbidden identity fields`).toBe(false);
      const text = JSON.stringify(value);
      expect(privateValues.some(secret => text.includes(secret)), `${label}: private values`).toBe(false);
    };
    try {
      prisma = new PrismaService();
      try {
        await prisma.$transaction(async tx => {
          const boss = await tx.user.findFirstOrThrow({ where: { role: 'BOSS', isActive: true }, select: { id: true } });
          const fixtureHash = await hashPassword(randomPassword()); privateValues.push(fixtureHash);
          const fixtureUser = async (role: Role, label: string) => {
            const phone = await uniquePhone(async value => !!await tx.user.findUnique({ where: { phone: value }, select: { id: true } }));
            const row = await tx.user.create({ data: { role, phone, fullName: e2eName(runId, label), passwordHash: fixtureHash,
              isActive: true, mustChangePassword: false } });
            owned.users.push(row.id); return row;
          };
          const manager = await fixtureUser('MANAGER', 'Registrations manager');
          const foreignManager = await fixtureUser('MANAGER', 'Other manager');
          const tenant = await fixtureUser('TENANT', 'Contract tenant');
          const otherTenant = await fixtureUser('TENANT', 'Other tenant');
          const guest = await fixtureUser('GUEST', 'Guest');
          const fixtureBuilding = async (managerId: number, label: string) => {
            const code = await uniqueBuildingCode(async value => !!await tx.building.findUnique({ where: { code: value }, select: { id: true } }));
            const row = await tx.building.create({ data: { code, name: e2eName(runId, label), address: '[E2E] Hanoi',
              district: 'Cầu Giấy', ward: 'Dịch Vọng', waterMode: 'PER_M3', managerId } });
            owned.buildings.push(row.id); return row;
          };
          const building = await fixtureBuilding(manager.id, 'Registrations building');
          const otherBuilding = await fixtureBuilding(foreignManager.id, 'Other building');
          const fixtureService = async (buildingId: number, unit: ServiceUnit) => {
            const row = await tx.service.create({ data: { buildingId, unit, name: e2eServiceName(`${runId} ${unit}`) } });
            owned.services.push(row.id);
            const price = await tx.ratePlan.create({ data: { buildingId, serviceId: row.id, kind: 'SERVICE', status: 'APPROVED',
              effectiveFrom: addDays(todayHanoi(), -1), proposedById: boss.id, reviewedById: boss.id, reviewedAt: new Date(),
              tiers: { create: { tierNo: 1, unitPrice: 30000 } } }, select: { id: true } });
            owned.ratePlans.push(price.id); return row;
          };
          const roomService = await fixtureService(building.id, 'ROOM');
          const personService = await fixtureService(building.id, 'PERSON');
          const parking = await fixtureService(building.id, 'VEHICLE');
          const foreignService = await fixtureService(otherBuilding.id, 'ROOM');
          const fixtureContract = async (buildingId: number, tenantId: number, label: string) => {
            const room = await tx.room.create({ data: { buildingId, code: label, floor: 1, areaM2: 22, price: 2500000, maxOccupants: 2 } });
            owned.rooms.push(room.id);
            const startDate = todayHanoi();
            const row = await tx.contract.create({ data: { code: `E2EREG${room.id}`, buildingId, roomId: room.id, tenantId,
              startDate, endDate: contractEndDate(startDate, 3), termMonths: 3, rent: 2500000, deposit: 0,
              status: 'HOLD', createdById: manager.id,
              occupants: { create: { fullName: e2eName(runId, `Signer ${label}`), isSigner: true, moveInDate: startDate } },
              services: { create: { serviceId: buildingId === building.id ? roomService.id : foreignService.id } },
            }, select: { id: true } });
            owned.contracts.push(row.id); return row;
          };
          const held = await fixtureContract(building.id, tenant.id, 'RG1');
          const second = await fixtureContract(building.id, tenant.id, 'RG2');
          const foreign = await fixtureContract(otherBuilding.id, otherTenant.id, 'RG3');
          const { AppModule } = await import('../src/app.module.js');
          const module = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(PrismaService).useValue(rollbackPrismaFacade(tx))
            .overrideProvider(MailerService).useValue(mailer).compile();
          app = module.createNestApplication(); app.useLogger(logger); configureApp(app); await app.init();
          const tokens = app.get(TokenService);
          const actorTokens = new Map<number, string>();
          for (const user of [manager, foreignManager, tenant, otherTenant, guest]) actorTokens.set(user.id, await tokens.signAccessToken(user));
          const api = async (method: 'get' | 'post' | 'patch', path: string, actor = manager.id, body?: object, key?: string) => {
            const call = request(app!.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${actorTokens.get(actor)}`);
            if (key) call.set('Idempotency-Key', key);
            const result = await (body === undefined ? call : call.send(body)); safe(result.body, `${method} ${path}`); return result;
          };
          const base = `/contracts/${held.id}`, otherBase = `/contracts/${second.id}`;
          const today = formatDateOnly(todayHanoi()), tomorrow = formatDateOnly(addDays(todayHanoi(), 1));
          const front = { assetId: `reg-${runId}-front`, publicId: `contracts/${building.id}/${held.id}/id-photo-front`, version: 1, format: 'jpg' };
          const back = { ...front, assetId: `reg-${runId}-back`, publicId: `contracts/${building.id}/${held.id}/id-photo-back` };
          for (const image of [front, back]) metadata.set(image.assetId, { asset_id: image.assetId, public_id: image.publicId,
            asset_folder: `contracts/${building.id}/${held.id}`, version: 1, format: 'jpg', resource_type: 'image', type: 'authenticated' });
          const audit = app.get(AuditService), originalLog = audit.log.bind(audit);
          let failAction: string | undefined;
          const fault = vi.spyOn(audit, 'log').mockImplementation(async (...args) => {
            await originalLog(...args);
            if (args[1] === failAction) throw new Error('BE-P3-27 injected audit failure after insert');
          });
          try {
            const added = await api('post', `/me/contracts/${held.id}/occupants`, tenant.id, { fullName: e2eName(runId, 'Roommate'),
              moveInDate: today, idNumber: privateValues[0], idFront: front, idBack: back });
            expect(added.status).toBe(201); expect(added.body.data.idNumberLast4).toBeNull();
            const oid: number = added.body.data.id;
            const stored = await tx.occupant.findUniqueOrThrow({ where: { id: oid }, select: { idNumberEnc: true, idNumberLast4: true } });
            expect(Boolean(stored.idNumberEnc?.startsWith('v1:')), 'CCCD stored as encrypted versioned data').toBe(true);
            expect(stored.idNumberLast4).toBe('6789'); privateValues.push(stored.idNumberEnc!);
            expect((await api('post', `${base}/occupants`, manager.id, { fullName: e2eName(runId, 'Over capacity'), moveInDate: today })).status).toBe(409);
            expect((await api('post', `/me/contracts/${foreign.id}/occupants`, tenant.id, { fullName: e2eName(runId, 'Foreign'), moveInDate: today })).status).toBe(404);
            expect((await api('get', `${base}/occupants`, foreignManager.id)).body.error.code).toBe('OUT_OF_SCOPE');
            expect((await api('get', `${base}/occupants/${oid}/id-photos`, tenant.id)).body.error.code).toBe('FORBIDDEN');
            for (let i = 0; i < 2; i++) {
              const photos = await api('get', `${base}/occupants/${oid}/id-photos`); expect(photos.status).toBe(200);
              expect(photos.headers['cache-control']).toBe('no-store');
              for (const side of ['front', 'back']) {
                const url = new URL(photos.body.data[side].url);
                expect(Number(url.searchParams.get('expires_at')) - Number(url.searchParams.get('timestamp'))).toBe(300);
              }
            }
            expect(await tx.auditLog.count({ where: { action: 'occupant.view_id', entityId: oid } })).toBe(2);
            expect((await api('get', `${otherBase}/occupants/${oid}/id-photos`)).status).toBe(404);
            expect((await api('patch', `${base}/occupants/${oid}`, manager.id, { moveOutDate: today })).status).toBe(200);
            expect((await api('post', `${base}/occupants`, manager.id, { fullName: e2eName(runId, 'Same day'), moveInDate: today })).status).toBe(409);
            expect((await api('post', `${base}/occupants`, manager.id, { fullName: e2eName(runId, 'Next day'), moveInDate: tomorrow })).status).toBe(201);
            expect(await tx.occupant.count({ where: { contractId: held.id, isSigner: true } })).toBe(1);

            const wanted = [roomService.id, personService.id].sort((a, b) => a - b);
            expect((await api('patch', `${base}/services`, manager.id, { serviceIds: wanted })).status).toBe(200);
            expect((await api('patch', `${base}/services`, manager.id, { serviceIds: [parking.id] })).status).toBe(400);
            expect((await api('patch', `${base}/services`, manager.id, { serviceIds: [foreignService.id] })).status).toBe(400);
            failAction = 'contract.update_services';
            expect((await api('patch', `${base}/services`, manager.id, { serviceIds: [personService.id] })).status).toBe(500);
            failAction = undefined;
            expect((await api('get', `${base}/services`)).body.data.map((row: { id: number }) => row.id)).toEqual(wanted);

            const plate = await uniqueVehiclePlate(async value => !!await tx.vehicle.findFirst({ where: { plate: value, isActive: true }, select: { id: true } }));
            const carBody = { plate: plate.toLowerCase(), type: 'MOTORBIKE', serviceId: parking.id };
            const vehicle = await api('post', `${base}/vehicles`, manager.id, carBody); expect(vehicle.status).toBe(201);
            expect(vehicle.body.data.plate).toBe(plate);
            const duplicate = await api('post', `${otherBase}/vehicles`, manager.id, carBody); expect(duplicate.status).toBe(400);
            expect(duplicate.body.error.fields.plate).toBe('Biển số đang được đăng ký gửi xe');
            const lookup = await api('get', `/vehicles?plate=${plate.slice(0, 8).toLowerCase()}`); expect(lookup.status).toBe(200);
            expect(lookup.body.data.map((row: { id: number }) => row.id)).toEqual([vehicle.body.data.id]);
            expect((await api('get', `${base}/vehicles`, guest.id)).status).toBe(403);
            expect((await api('patch', `${base}/vehicles/${vehicle.body.data.id}`, manager.id, { isActive: false })).status).toBe(200);
            const registeredAgain = await api('post', `${otherBase}/vehicles`, manager.id, carBody); expect(registeredAgain.status).toBe(201);
            expect(registeredAgain.body.data.id).not.toBe(vehicle.body.data.id);
            const extraPlate = await uniqueVehiclePlate(async value => !!await tx.vehicle.findFirst({ where: { plate: value, isActive: true }, select: { id: true } }));
            failAction = 'vehicle.create';
            expect((await api('post', `${base}/vehicles`, manager.id, { ...carBody, plate: extraPlate })).status).toBe(500);
            failAction = undefined; expect(await tx.vehicle.count({ where: { plate: extraPlate } })).toBe(0);

            const cancelBody = { reason: e2eName(runId, 'Cancel vehicle hold') }, key = `P327-${runId}`;
            const cancelled = await api('post', `${otherBase}/cancel`, manager.id, cancelBody, key); expect(cancelled.status).toBe(201);
            const replay = await api('post', `${otherBase}/cancel`, manager.id, cancelBody, key); expect(replay.body).toEqual(cancelled.body);
            expect(await tx.vehicle.count({ where: { contractId: second.id, isActive: true } })).toBe(0);
            expect(await tx.auditLog.count({ where: { action: 'contract.cancel', entityId: second.id } })).toBe(1);
            const mine = await api('get', `/me/contracts/${held.id}`, tenant.id); expect(mine.status).toBe(200);
            expect(JSON.stringify(mine.body).includes(front.assetId), 'Tenant detail never contains private image references').toBe(false);
            await tx.building.update({ where: { id: building.id }, data: { managerId: foreignManager.id } });
            expect((await api('get', `${base}/services`)).status).toBe(403);
            safe(logs, 'captured logs');
            safe(await tx.auditLog.findMany({ where: { actorId: { in: owned.users } }, select: { before: true, after: true } }), 'audit payloads');
            expect(mailer.send).not.toHaveBeenCalled(); finished = true;
          } finally { fault.mockRestore(); await app.close(); app = undefined; }
          throw rollback;
        }, { maxWait: 10000, timeout: 540000 });
        throw new Error('Registration workflow unexpectedly committed');
      } catch (error) { if (error !== rollback) throw error; }
      expect(finished, 'All assertions completed before outer rollback').toBe(true);
      const counts = await Promise.all([
        prisma.user.count({ where: { id: { in: owned.users } } }), prisma.building.count({ where: { id: { in: owned.buildings } } }),
        prisma.room.count({ where: { id: { in: owned.rooms } } }), prisma.service.count({ where: { id: { in: owned.services } } }),
        prisma.ratePlan.count({ where: { id: { in: owned.ratePlans } } }), prisma.rateTier.count({ where: { ratePlanId: { in: owned.ratePlans } } }),
        prisma.contract.count({ where: { id: { in: owned.contracts } } }), prisma.occupant.count({ where: { contractId: { in: owned.contracts } } }),
        prisma.contractService.count({ where: { contractId: { in: owned.contracts } } }), prisma.vehicle.count({ where: { contractId: { in: owned.contracts } } }),
        prisma.auditLog.count({ where: { actorId: { in: owned.users } } }), prisma.pricingIdempotencyKey.count({ where: { actorId: { in: owned.users } } }),
        prisma.invoice.count({ where: { contractId: { in: owned.contracts } } }), prisma.settlement.count({ where: { contractId: { in: owned.contracts } } }),
        prisma.session.count({ where: { userId: { in: owned.users } } }),
      ]);
      expect(counts, 'No fixture rows retained after registration workflow rollback').toEqual(counts.map(() => 0));
      console.log(`BE-P3-27 ${runId}: registrations outer rollback verified; no fixture rows retained (sequences may advance)`);
    } finally {
      try { await app?.close(); } finally { try { await prisma?.$disconnect(); } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); } }
    }
  });
});
