import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { contractEndDate, contractPeriods } from '../src/common/date/period.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { switchRenewal } from '../src/modules/billing/renewal-switch.js';
import { uniqueBuildingCode, uniquePhone, e2eName, newRunId } from '../scripts/e2e/run.js';
import { rollbackPrismaFacade } from './fixtures/rollback-prisma.js';

it('BE-P5-09 CON-17..19: create, print, sign and switch only the fixture renewal', async () => {
  vi.stubEnv('JWT_SECRET', 'test-only-renewal-rollback');
  vi.stubEnv('CCCD_KEY', Buffer.alloc(32, 31).toString('base64'));
  vi.stubEnv('CLOUDINARY_URL', 'cloudinary://test:fixture@rooms-renewal');
  let scanMetadata: Record<string, unknown> | undefined;
  vi.stubGlobal('fetch', async (url: string) => {
    if (!scanMetadata || url !== 'https://api.cloudinary.com/v1_1/rooms-renewal/resources/' + scanMetadata.asset_id) {
      throw new Error('Unexpected provider request');
    }
    return new Response(JSON.stringify(scanMetadata), { status: 200 });
  });
  const db = new PrismaService();
  const rollback = new Error('Expected fixture rollback');
  const runId = newRunId();
  let fixtureRoomId: number | undefined;
  try {
    try {
      await db.$transaction(async tx => {
        const { AppModule } = await import('../src/app.module.js');
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
          .overrideProvider(PrismaService).useValue(rollbackPrismaFacade(tx)).compile();
        const app = moduleRef.createNestApplication();
        configureApp(app);
        try {
          await app.init();
          const phone = () => uniquePhone(async candidate => !!await tx.user.findUnique({ where: { phone: candidate } }));
          const manager = await tx.user.create({ data: { role: 'MANAGER', phone: await phone(),
            fullName: e2eName(runId, 'Manager'), passwordHash: 'fixture', isActive: true, mustChangePassword: false } });
          const tenant = await tx.user.create({ data: { role: 'TENANT', phone: await phone(),
            fullName: e2eName(runId, 'Tenant'), passwordHash: 'fixture', isActive: true, mustChangePassword: false } });
          const code = await uniqueBuildingCode(async candidate => !!await tx.building.findUnique({ where: { code: candidate } }));
          const building = await tx.building.create({ data: { code, name: e2eName(runId, 'Renewal'),
            address: '[E2E] Hanoi', district: 'Test', ward: 'Test', waterMode: 'PER_M3', managerId: manager.id } });
          const room = await tx.room.create({ data: { buildingId: building.id, code: 'R1', floor: 1, areaM2: 25, price: 3500000 } });
          fixtureRoomId = room.id;
          const internet = await tx.service.create({ data: { buildingId: building.id, name: 'Fixture internet', unit: 'ROOM' } });
          const handoverDay = new Date('2028-01-01');
          const start = await tx.contract.create({ data: { code: 'RENEW' + room.id, roomId: room.id, buildingId: building.id,
            tenantId: tenant.id, rent: 2500000, deposit: 2500000, status: 'ACTIVE', createdById: manager.id,
            startDate: handoverDay, endDate: contractEndDate(handoverDay, 3), termMonths: 3,
            signedAt: handoverDay, movedInAt: handoverDay,
            occupants: { create: { fullName: tenant.fullName, phone: tenant.phone, isSigner: true, moveInDate: handoverDay } } } });
          const contractId = start.id;
          await tx.contractService.create({ data: { contractId, buildingId: building.id, serviceId: internet.id } });
          const managerToken = await app.get(TokenService).signAccessToken(manager);
          const api = (method: 'get' | 'post', path: string, token: string) => request(app.getHttpServer())[method]('/api/v1' + path)
            .set('Authorization', 'Bearer ' + token);
          const scan = { version: 1, format: 'pdf' };
          // P5-2: exercise the job's single-contract handler only on this rollback fixture.
          const renewal = await api('post', `/contracts/${contractId}/renew`, managerToken)
            .send({ termMonths: 3, terms: 'Renewal fixture' }).expect(201);
          const renewalId: number = renewal.body.data.id;
          expect(await tx.contractService.findMany({ where: { contractId: renewalId }, select: { serviceId: true } }))
            .toEqual([{ serviceId: internet.id }]);
          await api('post', `/contracts/${contractId}/renew`, managerToken).send({ termMonths: 3 }).expect(409);
          await api('get', `/contracts/${renewalId}/print`, managerToken).expect(200);
          const renewalUpload = await api('post', '/files/sign', managerToken)
            .send({ purpose: 'CONTRACT_SCAN', contractId: renewalId }).expect(201);
          const renewalScan = { ...scan, assetId: `renewal-${runId}`,
            publicId: `${renewalUpload.body.data.folder}/${renewalUpload.body.data.publicId}` };
          scanMetadata = { asset_id: renewalScan.assetId, public_id: renewalScan.publicId, asset_folder: renewalUpload.body.data.folder,
            version: 1, format: 'pdf', resource_type: 'image', type: 'authenticated' };
          const renewalSigned = await api('post', `/contracts/${renewalId}/sign`, managerToken).send(renewalScan).expect(201);
          expect(renewalSigned.body.data).toMatchObject({ status: 'HOLD', depositInvoice: null });
          expect(renewalSigned.body.data).not.toHaveProperty('temporaryPassword');
          const switchDate = new Date(renewal.body.data.startDate);
          expect(await switchRenewal(tx, renewalId, switchDate)).toBe('WAITING_FINAL_INVOICE');
          const periods = contractPeriods(handoverDay, 3);
          const last = periods[periods.length - 1];
          const closingInvoice = await tx.invoice.create({ data: { contractId, type: 'MONTHLY', status: 'DRAFT',
            periodNo: last.periodNo, periodStart: last.periodStart, periodEnd: last.periodEnd } });

          for (const [kind, value] of [['ELECTRIC', 1500], ['WATER', 150]] as const) {
            await tx.meterReading.create({ data: { contractId, roomId: room.id, invoiceId: closingInvoice.id, kind, value,
              readOn: last.periodEnd, readById: manager.id } });
          }
          expect(await switchRenewal(tx, renewalId, switchDate)).toBe('SWITCHED');
          expect(await switchRenewal(tx, renewalId, switchDate)).toBe('CHANGED');
          expect(await tx.occupant.count({ where: { contractId: renewalId, isSigner: true } })).toBe(1);
          expect(await tx.meterReading.count({ where: { contractId: renewalId, isOpening: true } })).toBe(2);
          expect(await tx.invoice.count({ where: { contractId: renewalId, type: 'DEPOSIT' } })).toBe(0);
          throw rollback;
        } finally { await app.close(); }
      }, { timeout: 240000, maxWait: 10000 });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    expect(fixtureRoomId).toBeDefined();
    expect(await db.room.count({ where: { id: fixtureRoomId } })).toBe(0);
    expect(await db.contract.count({ where: { roomId: fixtureRoomId } })).toBe(0);
  } finally {
    await db.$disconnect();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
}, 300000);
