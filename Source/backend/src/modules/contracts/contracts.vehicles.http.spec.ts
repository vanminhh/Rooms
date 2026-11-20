import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { formatDateOnly, todayHanoi } from '../../common/date/today.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import { ContractVehiclesService } from './contract-vehicles.service.js';

vi.setConfig({ hookTimeout: 60_000 });
const roles = new Map<number, Role>([[1, 'BOSS'], [2, 'MANAGER'], [3, 'TENANT'], [4, 'TENANT'], [5, 'GUEST'], [6, 'MANAGER']]);
const BODY = { plate: '30f-234.56', type: 'MOTORBIKE', serviceId: 10 };
const vehicle = (extra: Record<string, unknown> = {}): any => ({ id: 80, contractId: 42, buildingId: 7,
  plate: '29A-123.45', type: 'MOTORBIKE', serviceId: 10, isActive: true,
  registeredAt: new Date('2026-10-01'), removedAt: null, ...extra });
function initialState() {
  return {
    users: new Map([...roles].map(([id, role]) => [id, { id, role, isActive: true, mustChangePassword: false,
      passwordHash: `test-only-vehicle-hash-${id}`, fullName: `Fixture ${id}`, phone: `090000000${id}`, email: null }])),
    buildings: new Map<number, any>([
      [7, { id: 7, code: 'CG01', name: 'Building A', managerId: 2, isActive: true }],
      [8, { id: 8, code: 'DD01', name: 'Building B', managerId: 6, isActive: true }],
    ]),
    contracts: new Map<number, any>([
      [42, { id: 42, code: 'HD000042', roomId: 30, buildingId: 7, tenantId: 3, status: 'HOLD' }],
      [43, { id: 43, code: 'HD000043', roomId: 31, buildingId: 8, tenantId: 4, status: 'ACTIVE' }],
      [44, { id: 44, code: 'HD000044', roomId: 32, buildingId: 7, tenantId: 3, status: 'ACTIVE' }],
    ]),
    services: [{ id: 10, buildingId: 7, name: 'Motorcycle parking', unit: 'VEHICLE', isActive: true },
      { id: 11, buildingId: 7, name: 'Wifi', unit: 'ROOM', isActive: true },
      { id: 12, buildingId: 7, name: 'Waste collection', unit: 'PERSON', isActive: true },
      { id: 13, buildingId: 7, name: 'Old parking', unit: 'VEHICLE', isActive: false },
      { id: 14, buildingId: 7, name: 'Car parking', unit: 'VEHICLE', isActive: true },
      { id: 20, buildingId: 8, name: 'Other parking', unit: 'VEHICLE', isActive: true }],
    vehicles: [vehicle(), vehicle({ id: 81, contractId: 43, buildingId: 8, serviceId: 20, plate: '30B99999' }),
      vehicle({ id: 82, plate: '29C76543', isActive: false, removedAt: new Date('2026-10-31') }),
      vehicle({ id: 83, contractId: 44, plate: '29D12345' })],
    audits: [] as any[],
  };
}
const group = (value: any): any[] => Array.isArray(value) ? value : [value];
const scalar = (value: any): any => value instanceof Date ? value.getTime() : value;
function matches(row: any, where: any = {}): boolean {
  if (row === null || row === undefined) return false;
  return Object.entries(where).every(([field, expected]: [string, any]) => {
    if (expected === undefined) return true;
    if (field === 'AND') return group(expected).every(item => matches(row, item));
    if (field === 'OR') return group(expected).some(item => matches(row, item));
    const actual = row[field];
    if (expected === null || expected instanceof Date || typeof expected !== 'object') return scalar(actual) === scalar(expected);
    if ('in' in expected) return expected.in.includes(actual);
    if ('contains' in expected) return typeof actual === 'string' && actual.includes(expected.contains.replace(/\\([\\%_])/g, '$1'));
    if ('is' in expected) return matches(actual, expected.is);
    return matches(actual, expected);
  });
}
function ordered(rows: any[], orderBy: any): any[] {
  return [...rows].sort((a, b) => {
    for (const clause of group(orderBy ?? { id: 'asc' })) for (const [field, direction] of Object.entries(clause)) {
      const left = scalar(a[field]), right = scalar(b[field]);
      if (left !== right) return (left < right ? -1 : 1) * (direction === 'desc' ? -1 : 1);
    }
    return 0;
  });
}
// Project actual SELECTs, never pass extra identity fields through a fake relation.
function project(row: any, select: any): any {
  if (row === null || row === undefined) return row;
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([field, value]: [string, any]) =>
    [field, value === true ? row[field] : project(row[field], value.select)]));
}

describe('BE-P3-25 / CON-14 / DB-B5: vehicle registration and scoped lookup over HTTP', () => {
  let app: INestApplication;
  let state = initialState(); let queue = Promise.resolve();
  let failAudit = false, reassignAtTransaction = false;
  const logs: unknown[][] = [];
  const log = (...args: unknown[]) => { logs.push(args); };
  const logger: LoggerService = { log, warn: log, error: log, debug: log, verbose: log };
  const contractRow = (id: number): any => {
    const row = state.contracts.get(id); if (!row) return null;
    const building = state.buildings.get(row.buildingId);
    return { ...row, room: { id: row.roomId, code: `P${row.roomId}` },
      building: { ...building, manager: state.users.get(building.managerId) }, tenant: state.users.get(row.tenantId),
      idNumberEnc: 'private-vehicle-identity-cipher', signedScanAssetId: 'private-vehicle-scan' };
  };
  const vehicleRows = () => state.vehicles.map(row => ({ ...row, contract: contractRow(row.contractId) }));
  const unique = (plate: string, except?: number) => {
    if (state.vehicles.some(row => row.plate === plate && row.isActive && row.id !== except)) {
      throw Object.assign(new Error('Unique active vehicle plate; private conflicting registration'), { code: 'P2002', meta: { target: ['plate'] } });
    }
  };
  const db: any = {
    user: { findUnique: vi.fn(async ({ where, select }: any) => project(state.users.get(where.id) ?? null, select)) },
    building: { findMany: vi.fn(async ({ where, select }: any) => [...state.buildings.values()].filter(row => matches(row, where)).map(row => project(row, select))) },
    contract: { findUnique: vi.fn(async ({ where, select }: any) => project([...state.contracts.keys()].map(contractRow).find(row => matches(row, where)) ?? null, select)) },
    service: { findFirst: vi.fn(async ({ where, select }: any) => project(state.services.find(row => matches(row, where)) ?? null, select)) },
    vehicle: {
      findMany: vi.fn(async ({ where, select, orderBy, skip = 0, take }: any) => ordered(vehicleRows().filter(row => matches(row, where)), orderBy)
        .slice(skip, take === undefined ? undefined : skip + take).map(row => project(row, select))),
      findFirst: vi.fn(async ({ where, select }: any) => project(vehicleRows().find(row => matches(row, where)) ?? null, select)),
      count: vi.fn(async ({ where }: any) => vehicleRows().filter(row => matches(row, where)).length),
      create: vi.fn(async ({ data, select }: any) => {
        unique(data.plate); const row = vehicle({ id: Math.max(...state.vehicles.map(row => row.id)) + 1, ...data });
        state.vehicles.push(row); return project(row, select);
      }),
      update: vi.fn(async ({ where, data, select }: any) => {
        const row = state.vehicles.find(row => matches(row, where)); if (!row) throw new Error('Missing fixture vehicle');
        if (data.plate !== undefined) unique(data.plate, row.id);
        const { service, ...fields } = data; Object.assign(row, fields, service ? { serviceId: service.connect.id } : {});
        return project(row, select);
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => {
      state.audits.push(structuredClone(data));
      if (failAudit) throw new Error('Audit fixture failure with idNumberEnc=private and private-vehicle-scan');
      return data;
    }) },
    $queryRaw: vi.fn(async () => []),
  };
  // Serialized fake proves HTTP decisions/rollback, not actual PostgreSQL lock contention.
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
    vi.stubEnv('JWT_SECRET', 'test-only-vehicle-http-0123456789abcdef');
    vi.stubEnv('CCCD_KEY', Buffer.alloc(32, 85).toString('base64'));
    const { AppModule } = await import('../../app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db).overrideProvider(MailerService).useValue(mailer).compile();
    app = module.createNestApplication(); app.useLogger(logger); configureApp(app); await app.init();
  });
  beforeEach(() => { state = initialState(); queue = Promise.resolve(); failAudit = false; reassignAtTransaction = false; logs.length = 0; vi.clearAllMocks(); });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });
  const path = '/contracts/42/vehicles';
  async function api(method: 'get' | 'post' | 'patch', url: string, actor = 2, body?: unknown) {
    const token = await app.get(TokenService).signAccessToken({ id: actor, role: roles.get(actor)! });
    const call = request(app.getHttpServer())[method](`/api/v1${url}`).set('Authorization', `Bearer ${token}`);
    return body === undefined ? call : call.send(body as object);
  }
  const add = (body: unknown = BODY, actor = 2) => api('post', path, actor, body);
  function safe(value: unknown) {
    const text = JSON.stringify(value);
    for (const secret of ['idNumberEnc', 'passwordHash', 'signedScanAssetId', 'private-vehicle', 'idFrontAssetId', 'idBackAssetId']) {
      expect(text.includes(secret), 'Private identity fields must not reach response/log').toBe(false);
    }
  }

  it('CON-14: normalizes uppercase/whitespace, preserves punctuation and creates one audited registration', async () => {
    const before = structuredClone({ users: state.users, contracts: state.contracts });
    const result = await add({ ...BODY, plate: ' \t30 f-234.56\n\u00a0' });
    expect(result.status).toBe(201); expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data).toEqual({ id: 84, plate: '30F-234.56', type: 'MOTORBIKE', serviceId: 10,
      isActive: true, registeredAt: formatDateOnly(todayHanoi()), removedAt: null });
    expect(state.vehicles.at(-1)).toMatchObject({ contractId: 42, buildingId: 7 });
    expect(state.audits).toHaveLength(1); expect(state.audits[0]).toMatchObject({ actorId: 2, action: 'vehicle.create', entity: 'vehicle', entityId: 84, ip: expect.any(String) });
    expect({ users: state.users, contracts: state.contracts }).toEqual(before); expect(mailer.send).not.toHaveBeenCalled(); safe(result.body);
  });
  it.each(['MOTORBIKE', 'E_BIKE', 'BICYCLE', 'CAR', 'OTHER'])('CON-14: accepts schema vehicle type %s', async type => {
    expect((await add({ ...BODY, type })).status).toBe(201);
  });
  it.each(['HOLD', 'ACTIVE'])('CON-14 Q-P3-19: %s accepts registrations', async status => {
    state.contracts.get(42).status = status; expect((await add()).status).toBe(201);
  });
  it.each(['ENDED', 'CANCELLED'])('CON-14 Q-P3-19: %s stays readable but rejects vehicle writes', async status => {
    state.contracts.get(42).status = status;
    expect((await api('get', path)).status).toBe(200);
    expect((await add()).status).toBe(409); expect((await api('patch', `${path}/80`, 2, { isActive: false })).status).toBe(409);
    expect(db.vehicle.create).not.toHaveBeenCalled(); expect(db.vehicle.update).not.toHaveBeenCalled(); expect(state.audits).toHaveLength(0);
  });
  it('CON-14: list includes removal history with date-only strings', async () => {
    const result = await api('get', path); expect(result.status).toBe(200);
    expect(result.body.data.map((row: any) => row.id)).toEqual([80, 82]);
    expect(result.body.data[1]).toMatchObject({ isActive: false, registeredAt: '2026-10-01', removedAt: '2026-10-31' }); safe(result.body);
  });
  it('CON-14/DB-B5: edits an active vehicle and uses a different VEHICLE service of the same building', async () => {
    const result = await api('patch', `${path}/80`, 2, { plate: '29 a 55555', type: 'CAR', serviceId: 14, registeredAt: '2026-11-01' });
    expect(result.status).toBe(200); expect(result.body.data).toMatchObject({ plate: '29A55555', type: 'CAR', serviceId: 14, registeredAt: '2026-11-01' });
    expect(state.audits[0]).toMatchObject({ action: 'vehicle.update', entityId: 80 }); safe(result.body);
  });
  it('CON-14 Q-P3-20: stops a vehicle, keeps its interval for month-end billing and never deletes history', async () => {
    const result = await api('patch', `${path}/80`, 2, { isActive: false, removedAt: '2026-11-15' });
    expect(result.status).toBe(200); expect(result.body.data).toMatchObject({ isActive: false, removedAt: '2026-11-15' });
    expect(state.vehicles).toHaveLength(4); expect(state.vehicles[0].registeredAt).toEqual(new Date('2026-10-01'));
    expect(state.audits[0].action).toBe('vehicle.remove');
    expect((await api('get', path)).body.data.find((row: any) => row.id === 80).removedAt).toBe('2026-11-15');
  });
  it('CON-14/A-27: omission uses today for removal even when the assigned service is now inactive', async () => {
    state.services[0].isActive = false;
    const result = await api('patch', `${path}/80`, 2, { isActive: false });
    expect(result.status).toBe(200); expect(result.body.data.removedAt).toBe(formatDateOnly(todayHanoi()));
    expect(db.service.findFirst).not.toHaveBeenCalled();
  });
  it('CON-14: a removed plate can be registered again as a new interval without overwriting the old row', async () => {
    const old = structuredClone(state.vehicles[2]);
    const result = await add({ ...BODY, plate: '29 c76543' }); expect(result.status).toBe(201);
    expect(result.body.data.id).not.toBe(82); expect(state.vehicles[2]).toEqual(old);
  });
  it('CON-14: already stopped history cannot be edited or reactivated', async () => {
    expect((await api('patch', `${path}/82`, 2, { plate: '29NEW' })).status).toBe(409);
    expect((await api('patch', `${path}/82`, 2, { isActive: true })).status).toBe(400); expect(state.audits).toHaveLength(0);
  });
  it('CON-14: a plate already active in another building gives only a generic friendly plate error', async () => {
    const result = await add({ ...BODY, plate: '30 b 99999' }); expect(result.status).toBe(400);
    expect(result.body.error).toMatchObject({ code: 'VALIDATION_FAILED', fields: { plate: 'Biển số đang được đăng ký gửi xe' } });
    expect(JSON.stringify(result.body).includes('HD000043')).toBe(false); expect(state.audits).toHaveLength(0); safe(logs);
  });
  it('CON-14: editing to another active plate is rejected and the previous registration is preserved', async () => {
    const before = structuredClone(state.vehicles);
    const result = await api('patch', `${path}/80`, 2, { plate: '29 d 12345' }); expect(result.status).toBe(400);
    expect(state.vehicles).toEqual(before); expect(state.audits).toHaveLength(0);
  });
  it.each(['vehicles_plate_active', ['vehicles_plate_active'], 'plate', ['plate']])('CON-14: concurrent DB unique target %j is mapped', async target => {
    db.vehicle.create.mockRejectedValueOnce(Object.assign(new Error('Private duplicate row metadata'), { code: 'P2002', meta: { target } }));
    const result = await add(); expect(result.status).toBe(400);
    expect(result.body.error.fields.plate).toBe('Biển số đang được đăng ký gửi xe'); safe(result.body); safe(logs);
  });
  it('CON-14: simultaneous registrations of the normalized same plate yield one success and one conflict', async () => {
    const results = await Promise.all([add({ ...BODY, plate: '30f 23456' }), api('post', '/contracts/44/vehicles', 2, { ...BODY, plate: '30F23456' })]);
    expect(results.map(row => row.status).sort((a, b) => a - b)).toEqual([201, 400]);
    expect(state.vehicles.filter(row => row.plate === '30F23456')).toHaveLength(1); expect(state.audits).toHaveLength(1);
  });
  it.each([11, 12, 13, 20, 999])('DB-B5: ROOM/PERSON/inactive/foreign/missing service %s is refused for create and update', async serviceId => {
    const first = await add({ ...BODY, serviceId }); const second = await api('patch', `${path}/80`, 2, { serviceId });
    for (const result of [first, second]) { expect(result.status).toBe(400); expect(result.body.error.fields.serviceId).toBe('Chọn dịch vụ gửi xe đang hoạt động của tòa'); }
    expect(db.vehicle.create).not.toHaveBeenCalled(); expect(db.vehicle.update).not.toHaveBeenCalled();
  });
  it.each([81, 999])('SCOPE-02/CON-14: a foreign or missing vehicle %s cannot be patched through the current contract', async vid => {
    expect((await api('patch', `${path}/${vid}`, 2, { isActive: false })).status).toBe(404); expect(db.vehicle.update).not.toHaveBeenCalled();
  });
  it('SCOPE-02: manager outside the building is denied before reading vehicles; Boss can use that building', async () => {
    const denied = await api('get', path, 6); expect(denied.status).toBe(403); expect(denied.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.vehicle.findMany).not.toHaveBeenCalled();
    const boss = await api('post', '/contracts/43/vehicles', 1, { ...BODY, serviceId: 20 }); expect(boss.status).toBe(201);
  });
  it.each(['list', 'create', 'update', 'lookup'])('SCOPE-02: reassignment after guard evaluation revokes %s access', async operation => {
    reassignAtTransaction = true;
    const result = operation === 'list' ? await api('get', path) : operation === 'create' ? await add()
      : operation === 'update' ? await api('patch', `${path}/80`, 2, { isActive: false }) : await api('get', '/vehicles');
    expect(result.status).toBe(operation === 'lookup' ? 200 : 403);
    if (operation === 'lookup') expect(result.body.data).toEqual([]); else expect(result.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.vehicle.create).not.toHaveBeenCalled(); expect(db.vehicle.update).not.toHaveBeenCalled();
  });
  it('SCOPE-02: manager deactivation after the guard is rechecked before vehicle mutations', async () => {
    db.$queryRaw.mockImplementationOnce(async () => { state.users.get(2)!.isActive = false; return []; });
    const result = await add(); expect(result.status).toBe(403); expect(db.vehicle.create).not.toHaveBeenCalled();
  });
  it.each([3, 4, 5])('CON-15: tenant/guest actor %s cannot list, add, edit or look up vehicles', async actor => {
    for (const call of [api('get', path, actor), add(BODY, actor), api('patch', `${path}/80`, actor, { isActive: false }), api('get', '/vehicles', actor)]) {
      const result = await call; expect(result.status).toBe(403); expect(result.body.error.code).toBe('FORBIDDEN');
    }
    expect(db.vehicle.findMany).not.toHaveBeenCalled(); expect(db.vehicle.create).not.toHaveBeenCalled(); expect(db.vehicle.update).not.toHaveBeenCalled();
  });
  it('CON-15: direct service calls enforce staff roles and the tenant namespace has no vehicle write route', async () => {
    await expect(app.get(ContractVehiclesService).create({ id: 3, role: 'TENANT', buildingIds: [], mustChangePassword: false }, 42, BODY as any))
      .rejects.toMatchObject({ status: 403 });
    expect((await api('post', '/me/contracts/42/vehicles', 3, BODY)).status).toBe(404);
  });
  it('AUTH-01: anonymous requests are refused without reading vehicles', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/vehicles')).status).toBe(401); expect(db.vehicle.findMany).not.toHaveBeenCalled();
  });
  it('CON-14: no-op patches do not create misleading audit rows', async () => {
    expect((await api('patch', `${path}/80`, 2, {})).status).toBe(200); expect(state.audits).toHaveLength(0);
  });
  it('CON-14: partial plate lookup is normalized, scoped, paginated and projects safe contact fields', async () => {
    const result = await api('get', '/vehicles?plate=29%20a'); expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store'); expect(result.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
    expect(result.body.data[0]).toMatchObject({ id: 80, contract: { id: 42, code: 'HD000042', building: { id: 7 }, room: { id: 30 }, tenant: { id: 3 } } });
    const page = await api('get', '/vehicles?limit=1&page=2'); expect(page.body.data.map((row: any) => row.id)).toEqual([83]);
    expect(page.body.meta).toEqual({ page: 2, limit: 1, total: 2 });
    expect((await api('get', '/vehicles?limit=1&page=3')).body.data).toEqual([]);
    expect((await api('get', '/vehicles?plate=30b')).body.data).toEqual([]); safe(result.body);
  });
  it('CON-14: inactive history is searchable explicitly, while default lookup shows active registrations', async () => {
    const result = await api('get', '/vehicles?isActive=false'); expect(result.status).toBe(200);
    expect(result.body.data.map((row: any) => row.id)).toEqual([82]);
    expect((await api('get', '/vehicles', 1)).body.meta.total).toBe(3);
  });
  it.each(['%', '_', '\\'])('CON-14/API-03: lookup treats %s as literal plate text rather than SQL LIKE syntax', async character => {
    state.vehicles.push(vehicle({ id: 84, plate: `29${character}001` }));
    const result = await api('get', `/vehicles?plate=${encodeURIComponent(character)}`);
    expect(result.status).toBe(200); expect(result.body.data.map((row: any) => row.id)).toEqual([84]);
  });
  it.each(['create', 'update', 'remove'])('CON-14/AUD-01: audit failure rolls back %s and never leaks raw private error details', async operation => {
    const before = structuredClone(state); failAudit = true;
    const result = operation === 'create' ? await add() : await api('patch', `${path}/80`, 2, operation === 'remove' ? { isActive: false } : { plate: 'NEW001' });
    expect(result.status).toBe(500); expect(result.body.error.code).toBe('INTERNAL_ERROR'); expect(state).toEqual(before);
    safe(result.body); safe(logs);
  });
  it.each([
    { plate: null }, { plate: '' }, { plate: '  ' }, { plate: 'x'.repeat(16) }, { plate: '29\0A' }, { plate: 29 },
    { type: null }, { type: 'BUS' }, { serviceId: null }, { serviceId: 0 }, { serviceId: '10' }, { serviceId: 1.5 }, { serviceId: 2147483648 },
    { registeredAt: null }, { registeredAt: '2026-02-30' }, { registeredAt: '9999-01-01' }, { registeredAt: '2026-11-01T00:00:00Z' },
  ])('CON-14/API-03: invalid create/update fields %j fail before writing', async extra => {
    expect((await add({ ...BODY, ...extra })).status).toBe(400);
    expect((await api('patch', `${path}/80`, 2, extra)).status).toBe(400);
    expect(db.vehicle.create).not.toHaveBeenCalled(); expect(db.vehicle.update).not.toHaveBeenCalled();
  });
  it.each(['plate', 'type', 'serviceId'])('CON-14: create requires %s', async field => {
    const body: Record<string, unknown> = { ...BODY }; delete body[field]; expect((await add(body)).status).toBe(400);
  });
  it.each([{ removedAt: '2026-11-15' }, { isActive: false, removedAt: '2000-01-01' }, { isActive: false, removedAt: '9999-01-01' },
    { isActive: false, removedAt: null }, { isActive: false, removedAt: '2026-02-30' }, { isActive: 'false' }])('CON-14/A-27: invalid removal %j is refused', async body => {
    expect((await api('patch', `${path}/80`, 2, body)).status).toBe(400); expect(db.vehicle.update).not.toHaveBeenCalled();
  });
  it.each(['contractId', 'buildingId', 'id', 'unexpected'])('CON-14/API-03: client cannot overwrite internal field %s', async field => {
    expect((await add({ ...BODY, [field]: 43 })).status).toBe(400);
    expect((await api('patch', `${path}/80`, 2, { [field]: 43 })).status).toBe(400);
  });
  it.each(['0', '-1', '1.5', '2147483648', 'abc'])('API-03: invalid contract or vehicle id %s is refused', async id => {
    expect((await api('get', `/contracts/${id}/vehicles`)).status).toBe(400);
    expect((await api('patch', `${path}/${id}`, 2, { isActive: false })).status).toBe(400);
  });
  it.each(['plate=', 'plate=%00', 'limit=101', 'page=0', 'isActive=yes', 'unknown=value'])('API-03: invalid lookup query %s is refused', async query => {
    expect((await api('get', `/vehicles?${query}`)).status).toBe(400); expect(db.vehicle.findMany).not.toHaveBeenCalled();
  });
});
