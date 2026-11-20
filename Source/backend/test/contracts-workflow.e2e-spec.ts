import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/crypto/password.js';
import { contractEndDate } from '../src/common/date/period.js';
import { addDays, formatDateOnly, todayHanoi } from '../src/common/date/today.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { publicRoomWhere } from '../src/common/rooms/public-room.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { MailerService } from '../src/modules/mailer/mailer.service.js';
import { e2eName, newRunId, randomPassword, uniqueBuildingCode, uniquePhone } from '../scripts/e2e/run.js';
import { rollbackPrismaFacade } from './fixtures/rollback-prisma.js';

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

// Run this file alone with one worker. Contract creation's global mapping lock lasts until
// the outer rollback. PostgreSQL sequences can advance, but no fixture rows are committed.
// Real routes, queries and triggers run on ONE connection, with a savepoint per service
// transaction. This is neither independent-request commit proof nor a concurrency test.
describe('BE-P3-19/22: real PostgreSQL contract workflows with outer rollback', () => {
  it('CON-06..12/BIL-10..11/17/MTR-02: sign → pay → move-in and sign → pay → cancel (single connection)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MAIL_PROVIDER', '');
    vi.stubEnv('JWT_SECRET', 'test-only-rollback-contract-workflow-jwt-secret');
    vi.stubEnv('CCCD_KEY', Buffer.alloc(32, 73).toString('base64'));
    vi.stubEnv('CLOUDINARY_URL', 'cloudinary://workflow-key:workflow-secret@rooms-workflow');

    let prisma: PrismaService | undefined;
    const rollback = new Error('BE-P3-22 expected outer rollback');
    const runId = newRunId();
    const owned = {
      users: [] as number[], buildings: [] as number[], rooms: [] as number[],
      ratePlans: [] as number[], contracts: [] as number[], invoices: [] as number[], payments: [] as number[],
    };
    const responses: { label: string; body: unknown }[] = [];
    const logs: unknown[][] = [];
    const log = (...args: unknown[]) => { logs.push(args); };
    const logger: LoggerService = { log, error: log, warn: log, debug: log, verbose: log };
    const mailer = { send: vi.fn(async () => {}) };
    const cccd = '000123456789'; // Synthetic CON-01 fixture; never printed by assertions.
    let temporaryPassword = '';
    let savedHash = '';
    let initialHash = '';
    let encryptedCccd = '';
    let originalSettings: unknown;
    let workflowFinished = false;
    let app: INestApplication | undefined;
    let scanMetadata: Record<string, unknown> | undefined;

    // Only the provider metadata boundary is replaced. verifyContractAsset remains real;
    // there is no upload to or download from a real Cloudinary account in this workflow.
    const provider = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const metadataAssetId = scanMetadata?.asset_id;
      if (typeof metadataAssetId !== 'string' || url !== `https://api.cloudinary.com/v1_1/rooms-workflow/resources/${metadataAssetId}` || init?.method !== 'GET') {
        throw new Error('Unexpected outbound request in rollback workflow');
      }
      return new Response(JSON.stringify(scanMetadata), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', provider);

    const remember = (label: string, response: request.Response) => {
      responses.push({ label, body: response.body });
      return response;
    };
    const cookie = (response: request.Response): string => {
      const value = (response.headers['set-cookie'] as unknown as string[] | undefined)?.find(item => item.startsWith('rt='));
      if (!value) throw new Error('Workflow login did not return a refresh cookie');
      return value.split(';')[0];
    };
    const assertNoPrivateFields = (value: unknown): boolean => {
      if (!value || typeof value !== 'object') return false;
      const forbidden = new Set(['passwordHash', 'idNumberEnc', 'signedScanAssetId', 'idFrontAssetId', 'idBackAssetId', 'temporaryPassword']);
      return Object.entries(value).some(([key, child]) => forbidden.has(key) || assertNoPrivateFields(child));
    };

    try {
      prisma = new PrismaService();
      try {
        await prisma.$transaction(async tx => {
          const { AppModule } = await import('../src/app.module.js');
          const facade = rollbackPrismaFacade(tx);
          const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(PrismaService).useValue(facade)
            .overrideProvider(MailerService).useValue(mailer).compile();
          app = moduleRef.createNestApplication();
          app.useLogger(logger);
          configureApp(app);
          await app.init();
          const tokens = app.get(TokenService);
          const api = (method: 'get' | 'post', path: string, token?: string) => {
            const result = request(app!.getHttpServer())[method](`/api/v1${path}`);
            return token ? result.set('Authorization', `Bearer ${token}`) : result;
          };

          try {
            // The existing Boss is only read as the approved-rate FK; no real account is changed.
            const boss = await tx.user.findFirstOrThrow({ where: { role: 'BOSS', isActive: true }, select: { id: true } });
            const fixtureHash = await hashPassword(randomPassword());
            const fixtureUser = async (role: Role, label: string) => {
              const phone = await uniquePhone(async candidate => !!await tx.user.findUnique({ where: { phone: candidate }, select: { id: true } }));
              const user = await tx.user.create({ data: {
                role, phone, fullName: e2eName(runId, label), passwordHash: fixtureHash,
                isActive: true, mustChangePassword: false, email: `${phone}.${runId}@example.test`, emailVerifiedAt: new Date(),
              } });
              owned.users.push(user.id);
              return user;
            };
            const manager = await fixtureUser('MANAGER', 'Workflow manager');
            const foreignManager = await fixtureUser('MANAGER', 'Other manager');
            const foreignTenant = await fixtureUser('TENANT', 'Other tenant');
            const guest = await fixtureUser('GUEST', 'Guest');
            const managerToken = await tokens.signAccessToken(manager);
            const foreignManagerToken = await tokens.signAccessToken(foreignManager);
            const foreignTenantToken = await tokens.signAccessToken(foreignTenant);
            const guestToken = await tokens.signAccessToken(guest);

            const code = await uniqueBuildingCode(async candidate => !!await tx.building.findUnique({ where: { code: candidate }, select: { id: true } }));
            const building = await tx.building.create({ data: {
              code, name: e2eName(runId, 'Rollback building'), address: '[E2E] Hanoi', district: 'Cầu Giấy', ward: 'Dịch Vọng',
              waterMode: 'PER_M3', managerId: manager.id,
            } });
            owned.buildings.push(building.id);
            for (const kind of ['ELECTRIC', 'WATER'] as const) {
              const rate = await tx.ratePlan.create({ data: {
                buildingId: building.id, kind, effectiveFrom: addDays(todayHanoi(), -1), status: 'APPROVED',
                proposedById: boss.id, reviewedById: boss.id, reviewedAt: new Date(),
                tiers: { create: { tierNo: 1, unitPrice: kind === 'ELECTRIC' ? 3_500 : 15_000 } },
              }, select: { id: true } });
              owned.ratePlans.push(rate.id);
            }
            const room = await tx.room.create({ data: {
              buildingId: building.id, code: 'WF1', floor: 1, areaM2: 25, price: 2_500_000,
            } });
            owned.rooms.push(room.id);

            // MTR-02: the previous tenant closes at 1284; the new tenant starts at
            // 1290 on the same day. Both histories must survive independently.
            const handoverDay = todayHanoi();
            const oldStart = addDays(handoverDay, -100);
            const oldContract = await tx.contract.create({ data: {
              code: `E2EOLD${room.id}`, buildingId: building.id, roomId: room.id, tenantId: foreignTenant.id,
              startDate: oldStart, endDate: contractEndDate(oldStart, 3), termMonths: 3,
              rent: 2_500_000, deposit: 0, status: 'ENDED', createdById: manager.id,
              signedAt: oldStart, movedInAt: oldStart, endedAt: new Date(),
              occupants: { create: { fullName: e2eName(runId, 'Former signer'), isSigner: true, moveInDate: oldStart } },
            }, select: { id: true } });
            owned.contracts.push(oldContract.id);
            for (const [kind, value] of [['ELECTRIC', 1284], ['WATER', 100]] as const) {
              await tx.meterReading.create({ data: {
                roomId: room.id, contractId: oldContract.id, kind, value,
                readOn: handoverDay, isOpening: false, readById: manager.id,
              } });
            }
            const oldReadings = await tx.meterReading.findMany({
              where: { contractId: oldContract.id }, orderBy: { kind: 'asc' },
              select: { id: true, contractId: true, kind: true, value: true, readOn: true, isOpening: true },
            });

            originalSettings = await tx.setting.findMany({
              where: { key: { in: ['bank_account', 'contract_template'] } }, select: { key: true, value: true }, orderBy: { key: 'asc' },
            });
            const bank = { bankBin: '970436', bankName: 'Vietcombank', accountNo: '0000000000', accountName: 'ROOMS E2E' };
            await tx.setting.upsert({ where: { key: 'bank_account' },
              create: { key: 'bank_account', value: bank, updatedById: manager.id }, update: { value: bank, updatedById: manager.id } });
            const draftLabel = 'BẢN NHÁP – chưa dùng để ký';
            const template = `${draftLabel}\n{{tenant.fullName}} | {{room.code}} | {{contract.rent}} | {{contract.startDate}} | {{tenant.idNumberLast4}}`;
            await tx.setting.upsert({ where: { key: 'contract_template' },
              create: { key: 'contract_template', value: template, updatedById: manager.id }, update: { value: template, updatedById: manager.id } });

            const tenantPhone = await uniquePhone(async candidate => !!await tx.user.findUnique({ where: { phone: candidate }, select: { id: true } }));
            const startDate = formatDateOnly(handoverDay);
            const create = remember('create', await api('post', '/contracts', managerToken).send({
              roomId: room.id, signer: { fullName: e2eName(runId, 'Signer'), phone: tenantPhone, idNumber: cccd },
              startDate, termMonths: 3, deposit: 2_500_000,
              serviceIds: [], terms: e2eName(runId, 'Rolled-back contract workflow'),
            }).expect(201));
            const contractId: number = create.body.data.id;
            owned.contracts.push(contractId);
            const tenant = await tx.user.findUniqueOrThrow({ where: { phone: tenantPhone } });
            owned.users.push(tenant.id);
            expect(create.body.data).toMatchObject({ status: 'HOLD', deposit: 2_500_000, tenant: { id: tenant.id } });

            const upload = await api('post', '/files/sign', managerToken).send({ purpose: 'CONTRACT_SCAN', contractId }).expect(201);
            const assetId = `scan-${runId}`;
            const scan = { assetId, publicId: `${upload.body.data.folder}/${upload.body.data.publicId}`, version: 1, format: 'pdf' };
            scanMetadata = { asset_id: assetId, public_id: scan.publicId, asset_folder: upload.body.data.folder,
              version: 1, format: 'pdf', resource_type: 'image', type: 'authenticated' };
            const signed = await api('post', `/contracts/${contractId}/sign`, managerToken).send(scan).expect(201);
            expect(signed.headers['cache-control']).toBe('no-store');
            temporaryPassword = signed.body.data.temporaryPassword;
            expect(typeof temporaryPassword === 'string' && temporaryPassword.length === 10, 'CON-09: one temporary password of length 10').toBe(true);
            expect(provider).toHaveBeenCalledTimes(1);
            const invoiceId: number = signed.body.data.depositInvoice.id;
            owned.invoices.push(invoiceId);
            expect(signed.body.data.depositInvoice).toMatchObject({ status: 'UNPAID', total: 2_500_000,
              vietqr: { bankBin: bank.bankBin, accountNo: bank.accountNo, accountName: bank.accountName,
                amount: 2_500_000, content: `TT${invoiceId}` } });
            const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: {
              lines: true, contract: { select: { tenant: { select: { passwordHash: true } } } },
            } });
            initialHash = invoice.contract.tenant.passwordHash;
            expect(invoice).toMatchObject({ type: 'DEPOSIT', periodNo: 0, total: 2_500_000, status: 'UNPAID' });
            expect(invoice.lines.map(line => ({ kind: line.kind, quantity: line.quantity, unitPrice: line.unitPrice, amount: line.amount })))
              .toEqual([{ kind: 'DEPOSIT', quantity: 1, unitPrice: 2_500_000, amount: 2_500_000 }]);
            remember('repeat sign', await api('post', `/contracts/${contractId}/sign`, managerToken).send(scan).expect(409));

            const moveInBody = { electric: 1290, water: 105, readOn: startDate };
            const beforePayment = remember('move-in before payment', await api('post', `/contracts/${contractId}/move-in`, managerToken)
              .send(moveInBody).expect(409));
            expect(beforePayment.body.error.code).toBe('DEPOSIT_NOT_PAID');
            expect(await tx.meterReading.count({ where: { contractId } })).toBe(0);

            // A real trigger error aborts its PostgreSQL savepoint. Recover before the next
            // HTTP request, without retaining the failed payment or poisoning the outer tx.
            await expect(facade.$transaction(routeTx => routeTx.payment.create({ data: {
              invoiceId, amount: 1, method: 'CASH', source: 'MANUAL', recordedById: manager.id, paidAt: new Date(),
            } }))).rejects.toThrow('PAYMENT_AMOUNT_MISMATCH');
            expect(await tx.payment.count({ where: { invoiceId } })).toBe(0);

            const paymentBody = { method: 'BANK_TRANSFER', paidAt: new Date().toISOString(), note: e2eName(runId, 'Deposit paid') };
            const paymentKey = `workflow-${runId}`;
            const paid = remember('payment', await api('post', `/invoices/${invoiceId}/payment`, managerToken)
              .set('Idempotency-Key', paymentKey).send(paymentBody).expect(201));
            owned.payments.push(paid.body.data.id);
            expect(paid.body.data).toMatchObject({ invoiceId, amount: 2_500_000, method: 'BANK_TRANSFER', source: 'MANUAL', recordedById: manager.id });
            const replay = remember('payment replay', await api('post', `/invoices/${invoiceId}/payment`, managerToken)
              .set('Idempotency-Key', paymentKey).send(paymentBody).expect(201));
            expect(replay.body).toEqual(paid.body);
            const second = remember('repeat payment without key', await api('post', `/invoices/${invoiceId}/payment`, managerToken).send(paymentBody).expect(409));
            expect(second.body.error.code).toBe('INVOICE_NOT_UNPAID');
            expect(await tx.payment.count({ where: { invoiceId } })).toBe(1);
            expect(await tx.auditLog.count({ where: { action: 'payment.record', actorId: manager.id, entityId: paid.body.data.id } })).toBe(1);
            expect((await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { status: true } })).status).toBe('PAID');

            remember('move-in requires both meters', await api('post', `/contracts/${contractId}/move-in`, managerToken)
              .send({ electric: 1290, readOn: startDate }).expect(400));
            const movedIn = remember('move-in', await api('post', `/contracts/${contractId}/move-in`, managerToken)
              .send(moveInBody).expect(201));
            expect(movedIn.body.data).toMatchObject({ id: contractId, status: 'ACTIVE' });
            const active = await tx.contract.findUniqueOrThrow({ where: { id: contractId }, select: { status: true, movedInAt: true } });
            expect(active.status).toBe('ACTIVE');
            expect(active.movedInAt?.toISOString()).toBe(movedIn.body.data.movedInAt);
            const openings = await tx.meterReading.findMany({ where: { contractId }, orderBy: { kind: 'asc' },
              select: { roomId: true, contractId: true, kind: true, value: true, readOn: true, isOpening: true } });
            expect(openings).toEqual([
              { roomId: room.id, contractId, kind: 'ELECTRIC', value: 1290, readOn: handoverDay, isOpening: true },
              { roomId: room.id, contractId, kind: 'WATER', value: 105, readOn: handoverDay, isOpening: true },
            ]);
            expect(await tx.meterReading.findMany({
              where: { contractId: oldContract.id }, orderBy: { kind: 'asc' },
              select: { id: true, contractId: true, kind: true, value: true, readOn: true, isOpening: true },
            })).toEqual(oldReadings);
            const closing = await tx.meterReading.create({ data: {
              roomId: room.id, contractId, kind: 'ELECTRIC', value: 1350, readOn: handoverDay, readById: manager.id,
            }, select: { value: true, isOpening: true, contractId: true, readOn: true } });
            expect(closing).toEqual({ value: 1350, isOpening: false, contractId, readOn: handoverDay });
            // Baseline arithmetic only; the Phase 4 monthly invoice engine is out of scope.
            expect(closing.value - openings[0].value, 'MTR-02: use the new tenant baseline, not the previous closing').toBe(60);
            remember('repeat move-in', await api('post', `/contracts/${contractId}/move-in`, managerToken).send(moveInBody).expect(409));
            expect(await tx.auditLog.count({ where: { action: 'contract.move_in', entity: 'contract', entityId: contractId } })).toBe(1);

            const login = remember('tenant login', await api('post', '/auth/login').send({ phone: tenantPhone, password: temporaryPassword }).expect(200));
            const oldAccess: string = login.body.data.accessToken;
            const currentCookie = cookie(login);
            const forced = remember('forced password change', await api('get', `/me/contracts/${contractId}`, oldAccess).expect(403));
            expect(forced.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
            const changedPassword = randomPassword();
            remember('change password', await api('post', '/auth/change-password', oldAccess).set('Cookie', currentCookie)
              .send({ currentPassword: temporaryPassword, newPassword: changedPassword }).expect(200));
            remember('old access rejected', await api('get', '/auth/me', oldAccess).expect(401));
            const refreshed = remember('refresh kept session', await api('post', '/auth/refresh').set('Cookie', currentCookie).expect(200));
            const tenantToken: string = refreshed.body.data.accessToken;

            const staffDetail = remember('staff detail', await api('get', `/contracts/${contractId}`, managerToken).expect(200));
            const tenantDetail = remember('tenant detail', await api('get', `/me/contracts/${contractId}`, tenantToken).expect(200));
            for (const detail of [staffDetail, tenantDetail]) {
              expect(detail.body.data.depositInvoice).toMatchObject({ id: invoiceId, status: 'PAID', vietqr: null, qrImageUrl: null });
              expect(detail.body.data.occupants[0].idNumberLast4).toBe('6789');
            }
            expect(tenantDetail.headers['cache-control']).toBe('no-store');
            const ownList = remember('tenant list', await api('get', '/me/contracts', tenantToken).expect(200));
            expect(ownList.body.data.map((item: { id: number }) => item.id)).toEqual([contractId]);

            for (const [path, actor] of [[`/contracts/${contractId}/scan`, managerToken], [`/me/contracts/${contractId}/scan`, tenantToken]]) {
              const viewed = remember('authorized scan', await api('get', path, actor).expect(200));
              expect(viewed.headers['cache-control']).toBe('no-store');
              const url = new URL(viewed.body.data.url);
              expect(Number(url.searchParams.get('expires_at')) - Number(url.searchParams.get('timestamp'))).toBe(300);
              expect(new Date(viewed.body.data.expiresAt).getTime()).toBe(Number(url.searchParams.get('expires_at')) * 1_000);
            }
            for (const [path, actor] of [[`/contracts/${contractId}/print`, managerToken], [`/me/contracts/${contractId}/print`, tenantToken]]) {
              const printed = remember('authorized print', await api('get', path, actor).expect(200));
              expect(printed.headers['cache-control']).toBe('no-store');
              expect(printed.body.data.isDraft).toBe(true);
              expect(typeof printed.body.data.content === 'string' && printed.body.data.content.startsWith(draftLabel), 'CON-22: exact draft label').toBe(true);
              expect(printed.body.data.content.split(draftLabel).length, 'CON-22: draft label appears once').toBe(2);
              expect(typeof printed.body.data.content === 'string' && printed.body.data.content.includes('2.500.000 đ'), 'CON-22: formatted rent').toBe(true);
              expect(printed.body.data.content.includes(startDate.split('-').reverse().join('/')), 'CON-22: dd/mm/yyyy business date').toBe(true);
              expect(printed.body.data.content.includes('6789'), 'CON-22: only the signer CCCD last four digits').toBe(true);
            }
            for (const suffix of ['', '/scan', '/print']) {
              const foreign = remember('foreign tenant denied', await api('get', `/me/contracts/${contractId}${suffix}`, foreignTenantToken).expect(404));
              expect(foreign.body.error.code).toBe('NOT_FOUND');
              const forbidden = remember('guest denied', await api('get', `/me/contracts/${contractId}${suffix}`, guestToken).expect(403));
              expect(forbidden.body.error.code).toBe('FORBIDDEN');
              const outside = remember('foreign manager denied', await api('get', `/contracts/${contractId}${suffix}`, foreignManagerToken).expect(403));
              expect(outside.body.error.code).toBe('OUT_OF_SCOPE');
            }
            const scanAudits = await tx.auditLog.findMany({
              where: { action: 'contract.view_scan', entity: 'contract', entityId: contractId }, select: { actorId: true },
            });
            expect(scanAudits.map(row => row.actorId).sort((a, b) => a! - b!)).toEqual([manager.id, tenant.id].sort((a, b) => a - b));
            expect(await tx.auditLog.count({ where: { action: 'contract.sign', entity: 'contract', entityId: contractId } })).toBe(1);

            // CON-12/BIL-17: an already activated tenant keeps the same account and
            // session when a second signed/paid HOLD is cancelled before move-in.
            const cancelRoom = await tx.room.create({ data: {
              buildingId: building.id, code: 'WF2', floor: 1, areaM2: 25, price: 2_500_000,
            } });
            owned.rooms.push(cancelRoom.id);
            const cancelCreate = remember('create cancellation contract', await api('post', '/contracts', managerToken).send({
              roomId: cancelRoom.id, signer: { fullName: e2eName(runId, 'Signer'), phone: tenantPhone },
              startDate, termMonths: 3, deposit: 2_500_000, serviceIds: [],
            }).expect(201));
            const cancelId: number = cancelCreate.body.data.id;
            owned.contracts.push(cancelId);
            const cancelUpload = await api('post', '/files/sign', managerToken)
              .send({ purpose: 'CONTRACT_SCAN', contractId: cancelId }).expect(201);
            const cancelScan = { assetId: `cancel-scan-${runId}`,
              publicId: `${cancelUpload.body.data.folder}/${cancelUpload.body.data.publicId}`, version: 1, format: 'pdf' };
            scanMetadata = { asset_id: cancelScan.assetId, public_id: cancelScan.publicId, asset_folder: cancelUpload.body.data.folder,
              version: 1, format: 'pdf', resource_type: 'image', type: 'authenticated' };
            const cancelSign = remember('sign cancellation contract', await api('post', `/contracts/${cancelId}/sign`, managerToken)
              .send(cancelScan).expect(201));
            expect('temporaryPassword' in cancelSign.body.data, 'CON-09: reused tenant password is not reset').toBe(false);
            const cancelInvoiceId: number = cancelSign.body.data.depositInvoice.id;
            owned.invoices.push(cancelInvoiceId);
            const cancelPayment = remember('pay cancellation deposit', await api('post', `/invoices/${cancelInvoiceId}/payment`, managerToken)
              .set('Idempotency-Key', `cancel-payment-${runId}`)
              .send({ method: 'CASH', paidAt: new Date().toISOString() }).expect(201));
            owned.payments.push(cancelPayment.body.data.id);
            const paidSnapshot = await tx.invoice.findUniqueOrThrow({ where: { id: cancelInvoiceId }, include: { payment: true } });
            const tenantSnapshot = await tx.user.findUniqueOrThrow({ where: { id: tenant.id } });
            const cancelBody = { reason: e2eName(runId, 'Tenant cancelled before move-in'), depositKept: 1_000_000 };
            const cancelKey = `cancel-${runId}`;
            const audit = app.get(AuditService);
            const realAudit = audit.log.bind(audit);
            let cancellationAuditInserted = false;
            const fault = vi.spyOn(audit, 'log').mockImplementationOnce(async (...args) => {
              await realAudit(...args);
              cancellationAuditInserted = true;
              throw new Error('BE-P3-22 simulated cancellation failure after audit INSERT');
            });
            try {
              remember('cancel audit failure', await api('post', `/contracts/${cancelId}/cancel`, managerToken)
                .set('Idempotency-Key', cancelKey).send(cancelBody).expect(500));
            } finally {
              fault.mockRestore();
            }
            expect(cancellationAuditInserted, 'AUD-01: failure injected after the real audit INSERT').toBe(true);
            expect((await tx.contract.findUniqueOrThrow({ where: { id: cancelId }, select: { status: true } })).status).toBe('HOLD');
            expect(await tx.settlement.count({ where: { contractId: cancelId } })).toBe(0);
            expect(await tx.auditLog.count({ where: { action: 'contract.cancel', entity: 'contract', entityId: cancelId } })).toBe(0);
            // The key is stored after the action: a failed action must not cache an error.
            expect(await tx.pricingIdempotencyKey.count({ where: {
              actorId: manager.id, route: 'POST /contracts/:id/cancel', key: cancelKey,
            } })).toBe(0);
            expect(await tx.invoice.findUniqueOrThrow({ where: { id: cancelInvoiceId }, include: { payment: true } })).toEqual(paidSnapshot);
            const outsideCancel = remember('foreign manager cancel denied', await api('post', `/contracts/${cancelId}/cancel`, foreignManagerToken)
              .send(cancelBody).expect(403));
            expect(outsideCancel.body.error.code).toBe('OUT_OF_SCOPE');
            const cancelled = remember('cancel paid HOLD', await api('post', `/contracts/${cancelId}/cancel`, managerToken)
              .set('Idempotency-Key', cancelKey).send(cancelBody).expect(201));
            expect(cancelled.body.data).toMatchObject({ id: cancelId, status: 'CANCELLED', cancelReason: cancelBody.reason,
              depositInvoice: { id: cancelInvoiceId, status: 'PAID' },
              settlement: { deposit: 2_500_000, depositForfeit: 1_000_000, net: 1_500_000, refundPaidAt: null } });
            expect(await tx.settlement.findUniqueOrThrow({ where: { contractId: cancelId }, select: {
              deposit: true, depositForfeit: true, net: true, refundPaidAt: true, finalInvoiceId: true,
              lastPeriodAmount: true, remainingRent: true, previousDebt: true, damages: true,
            } })).toEqual({ deposit: 2_500_000, depositForfeit: 1_000_000, net: 1_500_000,
              refundPaidAt: null, finalInvoiceId: null, lastPeriodAmount: 0, remainingRent: 0, previousDebt: 0, damages: 0 });
            const cancelReplay = remember('cancel replay', await api('post', `/contracts/${cancelId}/cancel`, managerToken)
              .set('Idempotency-Key', cancelKey).send(cancelBody).expect(201));
            expect(cancelReplay.body).toEqual(cancelled.body);
            remember('cancel key different body', await api('post', `/contracts/${cancelId}/cancel`, managerToken)
              .set('Idempotency-Key', cancelKey).send({ ...cancelBody, depositKept: 0 }).expect(409));
            remember('cancel repeat without key', await api('post', `/contracts/${cancelId}/cancel`, managerToken).send(cancelBody).expect(409));
            expect(await tx.settlement.count({ where: { contractId: cancelId } })).toBe(1);
            expect(await tx.auditLog.count({ where: { action: 'contract.cancel', entity: 'contract', entityId: cancelId } })).toBe(1);
            expect(await tx.invoice.findUniqueOrThrow({ where: { id: cancelInvoiceId }, include: { payment: true } })).toEqual(paidSnapshot);
            expect(JSON.stringify(await tx.user.findUniqueOrThrow({ where: { id: tenant.id } })) === JSON.stringify(tenantSnapshot),
              'CON-12: cancellation preserves the reused tenant account').toBe(true);
            expect(await tx.room.findFirst({ where: { id: cancelRoom.id, ...publicRoomWhere(handoverDay) }, select: { id: true } }))
              .toEqual({ id: cancelRoom.id });
            const cancelledDetail = remember('tenant reads cancelled contract', await api('get', `/me/contracts/${cancelId}`, tenantToken).expect(200));
            expect(cancelledDetail.body.data.status).toBe('CANCELLED');
            const activeDetail = remember('tenant keeps active contract', await api('get', `/me/contracts/${contractId}`, tenantToken).expect(200));
            expect(activeDetail.body.data.status).toBe('ACTIVE');

            savedHash = (await tx.user.findUniqueOrThrow({ where: { id: tenant.id }, select: { passwordHash: true } })).passwordHash;
            encryptedCccd = (await tx.occupant.findFirstOrThrow({ where: { contractId, isSigner: true }, select: { idNumberEnc: true } })).idNumberEnc!;
            const auditBodies = await tx.auditLog.findMany({ where: { actorId: { in: owned.users } }, select: { before: true, after: true } });
            for (const { label, body } of responses) {
              const text = JSON.stringify(body);
              expect(assertNoPrivateFields(body), `${label}: forbidden fields`).toBe(false);
              expect([cccd, temporaryPassword, initialHash, savedHash, encryptedCccd].some(value => text.includes(value)), `${label}: private values`).toBe(false);
            }
            for (const [label, value] of [['logs', logs], ['audit payloads', auditBodies]] as const) {
              const text = JSON.stringify(value);
              expect([cccd, temporaryPassword, initialHash, savedHash, encryptedCccd].some(secret => text.includes(secret)), `${label}: private values`).toBe(false);
            }
            expect(mailer.send).not.toHaveBeenCalled();
            workflowFinished = true;
          } finally {
            await app.close();
            app = undefined;
          }
          throw rollback;
        }, { maxWait: 10_000, timeout: 420_000 });
        throw new Error('Workflow outer transaction unexpectedly committed');
      } catch (error) {
        if (error !== rollback) throw error;
      }

      expect(workflowFinished, 'All workflow assertions ran before outer rollback').toBe(true);
      const remaining = await Promise.all([
        prisma.user.count({ where: { id: { in: owned.users } } }),
        prisma.building.count({ where: { id: { in: owned.buildings } } }),
        prisma.room.count({ where: { id: { in: owned.rooms } } }),
        prisma.ratePlan.count({ where: { id: { in: owned.ratePlans } } }),
        prisma.rateTier.count({ where: { ratePlanId: { in: owned.ratePlans } } }),
        prisma.contract.count({ where: { id: { in: owned.contracts } } }),
        prisma.occupant.count({ where: { contractId: { in: owned.contracts } } }),
        prisma.invoice.count({ where: { id: { in: owned.invoices } } }),
        prisma.invoiceLine.count({ where: { invoiceId: { in: owned.invoices } } }),
        prisma.payment.count({ where: { invoiceId: { in: owned.invoices } } }),
        prisma.meterReading.count({ where: { OR: [
          { roomId: { in: owned.rooms } }, { contractId: { in: owned.contracts } },
        ] } }),
        prisma.settlement.count({ where: { contractId: { in: owned.contracts } } }),
        prisma.session.count({ where: { userId: { in: owned.users } } }),
        prisma.auditLog.count({ where: { actorId: { in: owned.users } } }),
        prisma.pricingIdempotencyKey.count({ where: { actorId: { in: owned.users } } }),
      ]);
      const tableNames = ['users', 'buildings', 'rooms', 'ratePlans', 'rateTiers', 'contracts', 'occupants',
        'invoices', 'invoiceLines', 'payments', 'meterReadings', 'settlements', 'sessions', 'auditLogs', 'idempotencyKeys'];
      expect(Object.fromEntries(tableNames.map((name, index) => [name, remaining[index]])), 'No fixture rows or paid deposit liability')
        .toEqual(Object.fromEntries(tableNames.map(name => [name, 0])));
      const restoredSettings = await prisma.setting.findMany({
        where: { key: { in: ['bank_account', 'contract_template'] } }, select: { key: true, value: true }, orderBy: { key: 'asc' },
      });
      expect(JSON.stringify(restoredSettings) === JSON.stringify(originalSettings), 'Bank/template values restored by rollback').toBe(true);
      console.log(`BE-P3-22 ${runId}: outer rollback verified; no fixture rows retained (sequences may advance)`);
    } finally {
      try {
        await app?.close();
      } finally {
        try {
          await prisma?.$disconnect();
        } finally {
          vi.unstubAllGlobals();
          vi.unstubAllEnvs();
        }
      }
    }
  });
});
