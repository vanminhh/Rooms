import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { todayHanoi } from '../../common/date/today.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import { ContractServicesService } from './contract-services.service.js';

vi.setConfig({ hookTimeout: 60_000 });
const roles = new Map<number, Role>([[1, 'BOSS'], [2, 'MANAGER'], [3, 'TENANT'], [4, 'TENANT'], [5, 'GUEST'], [6, 'MANAGER']]);
const TODAY = todayHanoi();
const dateOffset = (days: number) => new Date(TODAY.getTime() + days * 86400000);
const rate = (extra: Record<string, unknown> = {}) => ({ kind: 'SERVICE', status: 'APPROVED', effectiveFrom: dateOffset(-30), ...extra });
const service = (id: number, extra: Record<string, unknown> = {}): any => ({ id, buildingId: 7, name: `Service ${id}`,
  unit: 'ROOM', isActive: true, ratePlans: [rate()], ...extra });
function initialState() {
  return {
    users: new Map([...roles].map(([id, role]) => [id, { id, role, isActive: true, mustChangePassword: false,
      passwordHash: `test-only-contract-service-hash-${id}`, fullName: `Fixture ${id}`, phone: `090000000${id}` }])),
    buildings: new Map<number, any>([
      [7, { id: 7, managerId: 2, isActive: true }], [8, { id: 8, managerId: 6, isActive: true }],
    ]),
    contracts: new Map<number, any>([
      [42, { id: 42, buildingId: 7, tenantId: 3, status: 'HOLD', startDate: dateOffset(10), rent: 2500000, deposit: 2500000 }],
      [43, { id: 43, buildingId: 8, tenantId: 4, status: 'ACTIVE', startDate: dateOffset(-20), rent: 2500000, deposit: 0 }],
      [44, { id: 44, buildingId: 7, tenantId: 3, status: 'ACTIVE', startDate: dateOffset(-20), rent: 2500000, deposit: 0 }],
    ]),
    services: [service(10), service(11, { unit: 'PERSON' }), service(12, { unit: 'VEHICLE' }),
      service(13, { buildingId: 8 }), service(14, { isActive: false }), service(15, { ratePlans: [] }),
      service(16, { ratePlans: [rate({ status: 'PENDING' })] }), service(17, { ratePlans: [rate({ effectiveFrom: dateOffset(20) })] }),
      service(18, { ratePlans: [rate({ effectiveFrom: dateOffset(10) })] }), service(19, { ratePlans: [rate({ effectiveFrom: dateOffset(-1) })] }),
      service(20, { ratePlans: [rate({ effectiveFrom: TODAY })] }), service(21, { ratePlans: [rate({ status: 'REJECTED' })] }),
      service(22, { isActive: false, unit: 'PERSON', ratePlans: [] }), service(23, { ratePlans: [rate({ kind: 'WATER' })] })],
    memberships: [{ contractId: 42, buildingId: 7, serviceId: 10 }, { contractId: 43, buildingId: 8, serviceId: 13 },
      { contractId: 44, buildingId: 7, serviceId: 10 }],
    audits: [] as any[],
  };
}
const scalar = (value: any): any => value instanceof Date ? value.getTime() : value;
const group = (value: any): any[] => Array.isArray(value) ? value : [value];
function matches(row: any, where: any = {}): boolean {
  if (row === undefined || row === null) return false;
  return Object.entries(where).every(([field, expected]: [string, any]) => {
    if (expected === undefined) return true;
    if (field === 'AND') return group(expected).every(item => matches(row, item));
    if (field === 'OR') return group(expected).some(item => matches(row, item));
    const actual = row[field];
    if (expected === null || expected instanceof Date || typeof expected !== 'object') return scalar(actual) === scalar(expected);
    if ('in' in expected) return expected.in.includes(actual);
    if ('lte' in expected) return scalar(actual) <= scalar(expected.lte);
    if ('some' in expected) return actual.some((item: any) => matches(item, expected.some));
    return matches(actual, expected);
  });
}
function project(row: any, select: any): any {
  if (row === undefined || row === null) return row;
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([field, value]: [string, any]) =>
    [field, value === true ? row[field] : project(row[field], value.select)]));
}
function ordered(rows: any[], orderBy: any): any[] {
  if (!orderBy) return rows;
  const [field, direction] = Object.entries(orderBy)[0];
  return [...rows].sort((a, b) => (scalar(a[field]) < scalar(b[field]) ? -1 : scalar(a[field]) > scalar(b[field]) ? 1 : 0) * (direction === 'desc' ? -1 : 1));
}

describe('BE-P3-26 / D-07 / DB-B5: selected contract services over HTTP', () => {
  let app: INestApplication;
  let state = initialState(), queue = Promise.resolve();
  let reassignAtTransaction = false, failAudit = false, failCreate = false, conflictCreate = false, conflictDelete = false;
  const logs: unknown[][] = [];
  const log = (...args: unknown[]) => { logs.push(args); };
  const logger: LoggerService = { log, warn: log, error: log, debug: log, verbose: log };
  const contractRow = (id: number): any => {
    const row = state.contracts.get(id); if (!row) return null;
    const building = state.buildings.get(row.buildingId);
    return { ...row, building: { ...building, manager: state.users.get(building.managerId) },
      tenant: state.users.get(row.tenantId), idNumberEnc: 'private-contract-service-identity', signedScanAssetId: 'private-contract-service-scan' };
  };
  const db: any = {
    user: { findUnique: vi.fn(async ({ where, select }: any) => project(state.users.get(where.id) ?? null, select)) },
    building: { findMany: vi.fn(async ({ where, select }: any) => [...state.buildings.values()].filter(row => matches(row, where)).map(row => project(row, select))) },
    contract: { findUnique: vi.fn(async ({ where, select }: any) => project([...state.contracts.keys()].map(contractRow).find(row => matches(row, where)) ?? null, select)) },
    service: { findMany: vi.fn(async ({ where, select, orderBy }: any) => ordered(state.services.filter(row => matches(row, where)), orderBy).map(row => project(row, select))) },
    contractService: {
      findMany: vi.fn(async ({ where, select, orderBy }: any) => ordered(state.memberships.filter(row => matches(row, where)), orderBy)
        .map(row => project({ ...row, service: state.services.find(value => value.id === row.serviceId) }, select))),
      deleteMany: vi.fn(async ({ where }: any) => {
        const rows = state.memberships.filter(row => matches(row, where));
        state.memberships = state.memberships.filter(row => !matches(row, where));
        return { count: rows.length - (conflictDelete ? 1 : 0) };
      }),
      createMany: vi.fn(async ({ data }: any) => {
        for (const row of data) {
          if (state.memberships.some(value => value.contractId === row.contractId && value.serviceId === row.serviceId)) throw new Error('Duplicate fixture membership');
          state.memberships.push(structuredClone(row));
        }
        if (failCreate) throw new Error('Write failed; idNumberEnc=private-contract-service-identity');
        return { count: data.length - (conflictCreate ? 1 : 0) };
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => {
      state.audits.push(structuredClone(data));
      if (failAudit) throw new Error('Audit failed; idNumberEnc=private-contract-service-identity');
      return data;
    }) },
    $queryRaw: vi.fn(async () => []),
  };
  // Serialized fake verifies HTTP decisions/rollback, not PostgreSQL lock contention.
  db.$transaction = vi.fn((work: (tx: typeof db) => Promise<unknown>) => {
    const task = queue.then(async () => {
      if (reassignAtTransaction) { state.buildings.get(7).managerId = 6; reassignAtTransaction = false; }
      const before = structuredClone(state);
      try { return await work(db); } catch (error) { state = before; throw error; }
    });
    queue = task.then(() => {}, () => {}); return task;
  });
  const mailer = { send: vi.fn(async () => {}) };
  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('MAIL_PROVIDER', '');
    vi.stubEnv('JWT_SECRET', 'test-only-contract-services-0123456789abcdef');
    vi.stubEnv('CCCD_KEY', Buffer.alloc(32, 88).toString('base64'));
    const { AppModule } = await import('../../app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db).overrideProvider(MailerService).useValue(mailer).compile();
    app = module.createNestApplication(); app.useLogger(logger); configureApp(app); await app.init();
  });
  beforeEach(() => {
    state = initialState(); queue = Promise.resolve(); reassignAtTransaction = false; failAudit = false;
    failCreate = false; conflictCreate = false; conflictDelete = false; logs.length = 0; vi.clearAllMocks();
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });
  const path = '/contracts/42/services';
  async function api(method: 'get' | 'patch', url = path, actor = 2, body?: unknown) {
    const token = await app.get(TokenService).signAccessToken({ id: actor, role: roles.get(actor)! });
    const call = request(app.getHttpServer())[method](`/api/v1${url}`).set('Authorization', `Bearer ${token}`);
    return body === undefined ? call : call.send(body as object);
  }
  const patch = (serviceIds: unknown, actor = 2) => api('patch', path, actor, { serviceIds });
  const ids = () => state.memberships.filter(row => row.contractId === 42).map(row => row.serviceId).sort((a, b) => a - b);
  function safe(value: unknown) {
    const text = JSON.stringify(value);
    for (const secret of ['idNumberEnc', 'passwordHash', 'signedScanAssetId', 'private-contract-service', 'ratePlans', 'reviewNote']) {
      expect(text.includes(secret), 'Private identity and price-review data must not leak').toBe(false);
    }
  }

  it('D-07: lists only the selected safe service fields without auditing a view', async () => {
    const result = await api('get'); expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data).toEqual([{ id: 10, name: 'Service 10', unit: 'ROOM', isActive: true }]);
    expect(state.audits).toHaveLength(0); safe(result.body);
  });
  it('D-07/DB-B5: applies a complete ROOM/PERSON selection and audits only the authorized contract', async () => {
    const master = structuredClone({ users: state.users, services: state.services, contracts: state.contracts });
    const other = structuredClone(state.memberships.filter(row => row.contractId !== 42));
    const result = await patch([11, 10]); expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data.map((row: any) => row.id)).toEqual([10, 11]); expect(ids()).toEqual([10, 11]);
    expect(state.memberships.filter(row => row.contractId !== 42)).toEqual(other);
    expect({ users: state.users, services: state.services, contracts: state.contracts }).toEqual(master);
    expect(state.audits).toEqual([{ actorId: 2, action: 'contract.update_services', entity: 'contract', entityId: 42,
      ip: expect.any(String), before: { serviceIds: [10] }, after: { serviceIds: [10, 11] } }]);
    expect(mailer.send).not.toHaveBeenCalled(); safe(result.body); safe(state.audits);
  });
  it('D-07/A-28: replacing a service preserves the old selection in audit history', async () => {
    const result = await patch([11]); expect(result.status).toBe(200); expect(ids()).toEqual([11]);
    expect(state.audits[0]).toMatchObject({ before: { serviceIds: [10] }, after: { serviceIds: [11] } });
    expect(state.services.some(row => row.id === 10)).toBe(true);
  });
  it('D-07/A-28: empty selection clears current membership without deleting catalog services', async () => {
    const catalog = structuredClone(state.services); const result = await patch([]);
    expect(result.status).toBe(200); expect(result.body.data).toEqual([]); expect(ids()).toEqual([]); expect(state.services).toEqual(catalog);
    expect(state.audits[0]).toMatchObject({ before: { serviceIds: [10] }, after: { serviceIds: [] } });
    expect((await api('get')).body.data).toEqual([]);
  });
  it('D-07/A-28: unchanged and order-only selections do not write or create an audit', async () => {
    state.memberships.push({ contractId: 42, buildingId: 7, serviceId: 11 });
    expect((await patch([11, 10])).status).toBe(200); expect((await patch([10, 11])).status).toBe(200);
    expect(db.contractService.deleteMany).not.toHaveBeenCalled(); expect(db.contractService.createMany).not.toHaveBeenCalled(); expect(state.audits).toHaveLength(0);
  });
  it('D-07/A-28: archived retained services remain selected while a new service is added', async () => {
    state.memberships.push({ contractId: 42, buildingId: 7, serviceId: 22 });
    const result = await patch([10, 11, 22]); expect(result.status).toBe(200);
    expect(result.body.data.find((row: any) => row.id === 22).isActive).toBe(false); expect(ids()).toEqual([10, 11, 22]);
  });
  it('D-07/A-28: removing an archived service is allowed, but selecting it again is a new inactive assignment', async () => {
    state.memberships.push({ contractId: 42, buildingId: 7, serviceId: 22 });
    expect((await patch([10])).status).toBe(200); expect((await patch([10, 22])).status).toBe(400); expect(ids()).toEqual([10]);
  });
  it.each(['HOLD', 'ACTIVE'])('D-07: %s allows an eligible new service', async status => {
    state.contracts.get(42).status = status; expect((await patch([10, 11])).status).toBe(200);
  });
  it.each(['ENDED', 'CANCELLED'])('D-07/A-28: %s history remains readable and refuses changes', async status => {
    state.contracts.get(42).status = status; expect((await api('get')).status).toBe(200);
    expect((await patch([11])).status).toBe(409); expect(db.contractService.deleteMany).not.toHaveBeenCalled(); expect(state.audits).toHaveLength(0);
  });
  it.each([12, 13, 999])('DB-B5: VEHICLE/foreign/missing service %s is refused before removing the previous selection', async serviceId => {
    const result = await patch([10, serviceId]); expect(result.status).toBe(400); expect(result.body.error.code).toBe('VALIDATION_FAILED');
    expect(result.body.error.fields.serviceIds).toBe('Dịch vụ phải cùng tòa và tính theo phòng hoặc theo người');
    expect(ids()).toEqual([10]); expect(db.contractService.deleteMany).not.toHaveBeenCalled(); expect(db.contractService.createMany).not.toHaveBeenCalled();
  });
  it.each([14, 15, 16, 17, 21, 23])('D-07/Q-P3-22: inactive/unpriced/unapproved/future/wrong-kind service %s is refused', async serviceId => {
    const result = await patch([10, serviceId]); expect(result.status).toBe(400);
    expect(result.body.error.fields.serviceIds).toBe('Dịch vụ thêm mới phải đang hoạt động và có giá đã duyệt tại ngày áp dụng');
    expect(ids()).toEqual([10]); expect(db.contractService.deleteMany).not.toHaveBeenCalled(); expect(state.audits).toHaveLength(0);
  });
  it('D-07/Q-P3-22: HOLD accepts a rate effective exactly on its start date, not only rates effective today', async () => {
    expect((await patch([10, 18])).status).toBe(200); expect(ids()).toEqual([10, 18]);
  });
  it('D-07/Q-P3-22: HOLD refuses a rate that begins after that contract start date', async () => {
    state.contracts.get(42).startDate = dateOffset(9); expect((await patch([10, 18])).status).toBe(400);
  });
  it('D-07/Q-P3-22: ACTIVE accepts prices effective today even though they did not exist at the original start', async () => {
    state.contracts.get(42).status = 'ACTIVE'; state.contracts.get(42).startDate = dateOffset(-20);
    expect((await patch([10, 20])).status).toBe(200); expect(ids()).toEqual([10, 20]);
  });
  it('D-07/Q-P3-22: ACTIVE refuses a future approved price', async () => {
    state.contracts.get(42).status = 'ACTIVE'; expect((await patch([10, 18])).status).toBe(400);
  });
  it('SCOPE-02: another manager is denied before reading memberships; Boss can edit that building', async () => {
    const denied = await api('get', path, 6); expect(denied.status).toBe(403); expect(denied.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.contractService.findMany).not.toHaveBeenCalled();
    state.services.push(service(24, { buildingId: 8 }));
    expect((await api('patch', '/contracts/43/services', 1, { serviceIds: [13, 24] })).status).toBe(200);
    expect(ids()).toEqual([10]);
  });
  it.each(['get', 'patch'] as const)('SCOPE-02: reassignment after guard evaluation revokes %s access', async method => {
    reassignAtTransaction = true; const result = await api(method, path, 2, method === 'patch' ? { serviceIds: [11] } : undefined);
    expect(result.status).toBe(403); expect(result.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.contractService.findMany).not.toHaveBeenCalled(); expect(db.contractService.deleteMany).not.toHaveBeenCalled();
  });
  it('SCOPE-02: manager deactivation after guard evaluation is checked inside the transaction', async () => {
    db.$queryRaw.mockImplementationOnce(async () => { state.users.get(2)!.isActive = false; return []; });
    expect((await patch([11])).status).toBe(403); expect(db.contractService.findMany).not.toHaveBeenCalled();
  });
  it('SCOPE-02: inactive building and missing contract return safe failures without reading selections', async () => {
    state.buildings.get(7).isActive = false; const denied = await api('get'); expect(denied.status).toBe(403);
    expect((await api('get', '/contracts/999/services')).status).toBe(404); expect(db.contractService.findMany).not.toHaveBeenCalled();
  });
  it.each([3, 4, 5])('D-07/SCOPE-03: tenant/guest actor %s cannot read or replace contract services', async actor => {
    for (const method of ['get', 'patch'] as const) {
      const result = await api(method, path, actor, method === 'patch' ? { serviceIds: [11] } : undefined);
      expect(result.status).toBe(403); expect(result.body.error.code).toBe('FORBIDDEN');
    }
    expect(db.contractService.findMany).not.toHaveBeenCalled(); expect(db.contractService.createMany).not.toHaveBeenCalled();
  });
  it('D-07: service guard also refuses a direct tenant call and there is no me-services route', async () => {
    await expect(app.get(ContractServicesService).update({ id: 3, role: 'TENANT', buildingIds: [], mustChangePassword: false }, 42, { serviceIds: [11] }))
      .rejects.toMatchObject({ status: 403 });
    expect((await api('patch', '/me/contracts/42/services', 3, { serviceIds: [11] })).status).toBe(404);
  });
  it('AUTH-01: an anonymous request cannot read or change selections', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/contracts/42/services')).status).toBe(401);
    expect((await request(app.getHttpServer()).patch('/api/v1/contracts/42/services').send({ serviceIds: [11] })).status).toBe(401);
    expect(db.contractService.findMany).not.toHaveBeenCalled();
  });
  it.each([[11], [], [10, 11]].map(serviceIds => ({ serviceIds })))('D-07/AUD-01: audit failure rolls back replacement $serviceIds and keeps all historical audit rows', async ({ serviceIds }) => {
    const before = structuredClone(state); failAudit = true; const result = await patch(serviceIds);
    expect(result.status).toBe(500); expect(result.body.error.code).toBe('INTERNAL_ERROR'); expect(state).toEqual(before); safe(result.body); safe(logs);
  });
  it('D-07: a create failure after removing an old link rolls back the full selection', async () => {
    const before = structuredClone(state); failCreate = true; expect((await patch([11])).status).toBe(500); expect(state).toEqual(before); safe(logs);
  });
  it.each(['delete', 'create'])('D-07: unexpected %s affected-row count rolls back the entire update', async stage => {
    const before = structuredClone(state); conflictDelete = stage === 'delete'; conflictCreate = stage === 'create';
    expect((await patch([11])).status).toBe(409); expect(state).toEqual(before);
  });
  it('D-07: unexpected membership read errors are sanitized before the global logger', async () => {
    db.contractService.findMany.mockRejectedValueOnce(new Error('Read failed; idNumberEnc=private-contract-service-identity'));
    const result = await api('get'); expect(result.status).toBe(500); safe(result.body); safe(logs);
  });
  it('D-07: simultaneous full-set updates keep a complete selection and a consistent audit chain', async () => {
    const results = await Promise.all([patch([10, 11]), patch([10, 19])]); expect(results.map(row => row.status)).toEqual([200, 200]);
    expect(state.audits).toHaveLength(2); expect(state.audits[1].before).toEqual(state.audits[0].after);
    expect(ids()).toEqual(state.audits[1].after.serviceIds); expect(ids()).toHaveLength(2);
  });
  it.each([undefined, null, '10', 10, [10, 10], [0], [-1], [1.5], [2147483648], ['10'], [null], [true]].map(serviceIds => ({ serviceIds })))('API-03/DB-B5: invalid serviceIds $serviceIds is refused', async ({ serviceIds }) => {
    expect((await patch(serviceIds)).status).toBe(400); expect(db.contractService.findMany).not.toHaveBeenCalled();
  });
  it.each(['contractId', 'buildingId', 'unit', 'unexpected'])('API-03: internal field %s cannot be supplied by a client', async field => {
    expect((await api('patch', path, 2, { serviceIds: [11], [field]: 8 })).status).toBe(400); expect(db.contractService.findMany).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1.5', '2147483648', 'abc'])('API-03: invalid contract id %s is refused for read and update', async id => {
    expect((await api('get', `/contracts/${id}/services`)).status).toBe(400);
    expect((await api('patch', `/contracts/${id}/services`, 2, { serviceIds: [11] })).status).toBe(400); expect(db.contractService.findMany).not.toHaveBeenCalled();
  });
});
