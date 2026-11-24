import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { contractEndDate } from '../src/common/date/period.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { CloseIncidentsJob } from '../src/jobs/close-incidents.job.js';
import { uniqueBuildingCode, uniquePhone, e2eName, newRunId } from '../scripts/e2e/run.js';
import { rollbackPrismaFacade } from './fixtures/rollback-prisma.js';

it('BE-P5-18 REQ-01..08: incident reopen and close, move-out approval and payment confirmation', async () => {
  vi.stubEnv('JWT_SECRET', 'test-only-renewal-rollback');
  vi.stubEnv('BANK_WEBHOOK_SECRET', 'fixture-request-webhook');
  vi.stubEnv('CCCD_KEY', Buffer.alloc(32, 31).toString('base64'));
  vi.stubEnv('CLOUDINARY_URL', 'cloudinary://test:fixture@rooms-renewal');
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
          const tenantToken = await app.get(TokenService).signAccessToken(tenant);
          const api = (method: 'get' | 'post' | 'patch', path: string, token: string) =>
            request(app.getHttpServer())[method]('/api/v1' + path).set('Authorization', 'Bearer ' + token);
          const submit = (type: string, payload: object = {}, photos: object[] = []) => api('post', '/me/requests', tenantToken)
            .send({ type, contractId, title: 'Fixture request', payload, photos });
          const incident = (await submit('INCIDENT').expect(201)).body.data.id;
          const update = (status: string, cost?: number) => api('patch', '/requests/' + incident, managerToken).send({ status, cost });
          await update('CLOSED').expect(409);
          await update('IN_PROGRESS').expect(200);
          await update('RESOLVED', 200000).expect(200);
          await api('post', '/me/requests/' + incident + '/reopen', tenantToken).expect(201);
          expect((await update('RESOLVED', 100000).expect(200)).body.data.cost).toBe(100000);
          await tx.request.update({ where: { id: incident }, data: { resolvedAt: new Date('2090-03-01T16:59:00Z') } });
          const job = app.get(CloseIncidentsJob);
          expect(await job.run(new Date('2090-03-03T01:00:00Z'), contractId)).toBe(0);
          expect(await job.run(new Date('2090-03-04T01:00:00Z'), contractId)).toBe(1);
          expect(await job.run(new Date('2090-03-04T02:00:00Z'), contractId)).toBe(0);
          const move = (await submit('MOVE_OUT', { plannedMoveOutDate: '2028-02-01' }).expect(201)).body.data.id;
          expect((await submit('RENEW', { termMonths: 3 }).expect(409)).body.error.code).toBe('PENDING_REQUEST_EXISTS');
          const approval = await api('post', '/requests/' + move + '/approve', managerToken).expect(201);
          expect(approval.body.data.status).toBe('APPROVED');
          expect(approval.body.data.payload.remainingRent).toBe(2500000);
          expect((await tx.contract.findUniqueOrThrow({ where: { id: contractId } })).plannedMoveOutDate).toEqual(new Date('2028-02-01'));
          const invoice = await tx.invoice.create({ data: { contractId, type: 'DEPOSIT', status: 'UNPAID', total: 2500000,
            issueDate: handoverDay, dueDate: handoverDay } });
          const upload = await api('post', '/files/sign', tenantToken).send({ purpose: 'REQUEST_PHOTO', contractId }).expect(201);
          const receipt = { assetId: 'fixture-receipt', publicId: upload.body.data.folder + '/receipt', version: 1, format: 'jpg' };
          vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ asset_id: receipt.assetId, public_id: receipt.publicId,
            version: 1, format: 'jpg', resource_type: 'image', type: 'upload' })));
          const paymentIssue = { invoiceId: invoice.id, amount: 2500000, transferredAt: '2028-01-02T09:00:00+07:00' };
          await submit('PAYMENT_ISSUE', paymentIssue).expect(400);
          await submit('PAYMENT_ISSUE', paymentIssue, [{ ...receipt, publicId: 'requests/999/999/receipt' }]).expect(400);
          await submit('PAYMENT_ISSUE', paymentIssue, Array.from({ length: 6 }, (_, n) => ({ ...receipt, assetId: 'receipt-' + n }))).expect(400);
          await api('post', '/files/sign', managerToken).send({ purpose: 'REQUEST_PHOTO', contractId }).expect(403);
          const issue = (await submit('PAYMENT_ISSUE', paymentIssue, [receipt]).expect(201)).body.data.id;
          const escalated = (await submit('PAYMENT_ISSUE', paymentIssue, [receipt]).expect(201)).body.data.id;
          await api('post', '/requests/' + escalated + '/escalate', managerToken).expect(201);
          await api('post', '/requests/' + escalated + '/resolve', managerToken).expect(403);
          const bank = { bankBin: '970436', bankName: 'VCB', accountNo: '0000123456', accountName: 'E2E' };
          await tx.setting.upsert({ where: { key: 'bank_account' }, create: { key: 'bank_account', value: bank, updatedById: manager.id },
            update: { value: bank } });
          const hook = await request(app.getHttpServer()).post('/api/v1/webhooks/bank').set('X-Webhook-Secret', 'fixture-request-webhook')
            .send({ transactions: [{ id: runId + '-issue', amount: 2500000, content: 'TT' + invoice.id,
              accountNumber: bank.accountNo, receivedAt: '2028-01-02 09:00:00' }] }).expect(200);
          expect(hook.body.data.matched).toBe(1);
          const resolved = await api('post', '/requests/' + issue + '/resolve', managerToken).expect(201);
          expect(resolved.body.data.status).toBe('RESOLVED');
          expect(await tx.payment.count({ where: { invoiceId: invoice.id } })).toBe(1);
          const garage = await tx.service.create({ data: { buildingId: building.id, name: 'Parking', unit: 'VEHICLE' } });
          const parked = (plate: string) => tx.vehicle.create({ data: { plate, type: 'CAR', buildingId: building.id,
            contractId, serviceId: garage.id, registeredAt: new Date('2025-01-01') } });
          const removable = await parked('R' + room.id + 'A');
          const duplicate = await parked('R' + room.id + 'B');
          const vehicle = (await submit('VEHICLE_CHANGE', { remove: [{ vehicleId: removable.id, removedAt: '2025-02-01' }],
            add: [{ plate: duplicate.plate, type: 'CAR', serviceId: garage.id }] }).expect(201)).body.data.id;
          await api('post', '/requests/' + vehicle + '/approve', managerToken).expect(400);
          expect((await tx.request.findUniqueOrThrow({ where: { id: vehicle } })).status).toBe('PENDING');
          expect((await tx.vehicle.findUniqueOrThrow({ where: { id: removable.id } })).isActive).toBe(true);
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
