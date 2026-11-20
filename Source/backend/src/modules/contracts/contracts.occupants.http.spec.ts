import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import { createDecipheriv } from 'node:crypto';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { MailerService } from '../mailer/mailer.service.js';

// A cold Windows transform of the full Nest module graph can exceed 10 seconds.
vi.setConfig({ hookTimeout: 60_000 });

const roles = new Map<number, Role>([[1, 'BOSS'], [2, 'MANAGER'], [3, 'TENANT'], [4, 'TENANT'], [5, 'GUEST'], [6, 'MANAGER']]);
const DATE = '2026-11-20';
const BODY = { fullName: 'Roommate fixture', moveInDate: DATE };
const ID_NUMBER = '001234567890';
const KEY = Buffer.alloc(32, 81);

interface FixtureOccupant {
  id: number;
  contractId: number;
  fullName: string;
  phone: string | null;
  dateOfBirth: Date | null;
  idNumberEnc: string | null;
  idNumberLast4: string | null;
  idFrontAssetId: string | null;
  idBackAssetId: string | null;
  isSigner: boolean;
  moveInDate: Date;
  moveOutDate: Date | null;
  createdAt: Date;
}

function occupant(overrides: Partial<FixtureOccupant> = {}): FixtureOccupant {
  return { id: 90, contractId: 42, fullName: 'Signer fixture', phone: '0912345678',
    dateOfBirth: null, idNumberEnc: 'v1:private-signer-fixture', idNumberLast4: '6789',
    idFrontAssetId: 'private-signer-front', idBackAssetId: 'private-signer-back', isSigner: true,
    moveInDate: new Date('2026-11-01'), moveOutDate: null, createdAt: new Date('2026-11-01T00:00:00Z'), ...overrides };
}

function initialState() {
  return {
    users: new Map([...roles].map(([id, role]) => [id, { id, role, isActive: true, mustChangePassword: false,
      passwordHash: `test-only-occupant-hash-${id}`, fullName: `Fixture ${id}`, phone: `090000000${id}`, email: null }])),
    buildings: new Map<number, any>([
      [7, { id: 7, managerId: 2, isActive: true, waterMode: 'PER_PERSON', code: 'CG01', name: 'Building A' }],
      [8, { id: 8, managerId: 6, isActive: true, waterMode: 'PER_M3', code: 'DD01', name: 'Building B' }],
    ]),
    rooms: new Map<number, any>([
      [30, { id: 30, buildingId: 7, code: 'P301', maxOccupants: 3, price: 2_500_000, isActive: true }],
      [31, { id: 31, buildingId: 8, code: 'P101', maxOccupants: 2, price: 2_500_000, isActive: true }],
    ]),
    contracts: new Map<number, any>([
      [42, { id: 42, code: 'HD000042', roomId: 30, buildingId: 7, tenantId: 3, status: 'ACTIVE',
        startDate: new Date('2026-11-01'), endDate: new Date('2027-01-31'), termMonths: 3, rent: 2_500_000,
        deposit: 2_500_000, terms: null, createdAt: new Date('2026-11-01T00:00:00Z'),
        signedAt: new Date('2026-11-01T00:00:00Z'), movedInAt: new Date('2026-11-01T00:00:00Z') }],
      [43, { id: 43, code: 'HD000043', roomId: 31, buildingId: 8, tenantId: 4, status: 'ACTIVE',
        startDate: new Date('2026-11-01'), endDate: new Date('2027-01-31'), termMonths: 3, rent: 2_500_000,
        deposit: 0, terms: null, createdAt: new Date('2026-11-01T00:00:00Z') }],
    ]),
    occupants: [occupant(), occupant({ id: 91, contractId: 43, fullName: 'Other signer', idNumberLast4: '1111' })],
    audits: [] as any[],
  };
}

const comparable = (value: any): any => value instanceof Date ? value.getTime() : value;
const group = (value: any): any[] => Array.isArray(value) ? value : [value];
function matches(row: any, where: any = {}): boolean {
  if (row === null || row === undefined) return false;
  return Object.entries(where).every(([field, expected]: [string, any]) => {
    if (expected === undefined) return true;
    if (field === 'AND') return group(expected).every(value => matches(row, value));
    if (field === 'OR') return group(expected).some(value => matches(row, value));
    if (field === 'NOT') return group(expected).every(value => !matches(row, value));
    const actual = row[field];
    if (expected instanceof Date || expected === null || typeof expected !== 'object') return comparable(actual) === comparable(expected);
    return Object.entries(expected).every(([operator, value]: [string, any]) => {
      if (operator === 'equals') return comparable(actual) === comparable(value);
      if (operator === 'not') return !matches({ actual }, { actual: value });
      if (operator === 'in') return value.includes(actual);
      if (operator === 'notIn') return !value.includes(actual);
      if (operator === 'is') return matches(actual, value);
      if (operator === 'some') return actual.some((item: any) => matches(item, value));
      if (operator === 'none') return !actual.some((item: any) => matches(item, value));
      if (['lt', 'lte', 'gt', 'gte'].includes(operator)) {
        if (actual === null || actual === undefined) return false;
        const left = comparable(actual), right = comparable(value);
        return operator === 'lt' ? left < right : operator === 'lte' ? left <= right : operator === 'gt' ? left > right : left >= right;
      }
      return matches(actual, expected);
    });
  });
}

function ordered(rows: any[], orderBy: any): any[] {
  if (!orderBy) return rows;
  return [...rows].sort((a, b) => {
    for (const clause of group(orderBy)) for (const [field, direction] of Object.entries(clause)) {
      const left = comparable(a[field]), right = comparable(b[field]);
      if (left !== right) return (left < right ? -1 : 1) * (direction === 'desc' ? -1 : 1);
    }
    return 0;
  });
}

// Restrict the mock edge to the actual SELECT, including nested relation filters.
function project(row: any, select: any): any {
  if (row === null || row === undefined) return row;
  if (Array.isArray(row)) return row.map(item => project(item, select));
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([field, policy]: [string, any]) => {
    if (policy === true) return [field, row[field]];
    let relation = row[field];
    if (Array.isArray(relation)) relation = ordered(relation.filter(value => matches(value, policy.where)), policy.orderBy)
      .slice(policy.skip ?? 0, policy.take === undefined ? undefined : (policy.skip ?? 0) + policy.take);
    return [field, project(relation, policy.select)];
  }));
}

describe('BE-P3-23 / CON-13/15/16 / DB-B6: occupants over HTTP', () => {
  let app: INestApplication;
  let state = initialState();
  let queue = Promise.resolve();
  let failAudit = false;
  let failOccupantWrite = false;
  let reassignAtTransaction = false;
  let reassignAfterProvider = false;
  const logs: unknown[][] = [];
  const loggerFn = (...args: unknown[]) => { logs.push(args); };
  const logger: LoggerService = { log: loggerFn, warn: loggerFn, error: loggerFn, debug: loggerFn, verbose: loggerFn };
  const mailer = { send: vi.fn(async () => {}) };
  const metadata = new Map<string, Record<string, unknown>>();
  const contractRow = (id: number): any => {
    const row = state.contracts.get(id);
    if (!row) return null;
    const building = state.buildings.get(row.buildingId);
    return { ...row, building: { ...building, manager: state.users.get(building.managerId) ?? null },
      room: state.rooms.get(row.roomId), tenant: state.users.get(row.tenantId),
      occupants: state.occupants.filter(value => value.contractId === id), vehicles: [], services: [], invoices: [] };
  };
  const occupantRows = () => state.occupants.map(row => ({ ...row, contract: contractRow(row.contractId) }));
  const lookupContract = async ({ where, select }: any) => {
    const row = [...state.contracts.keys()].map(contractRow).find(value => matches(value, where));
    return project(row ?? null, select);
  };
  const db: any = {
    user: { findUnique: vi.fn(async ({ where, select }: any) => project(state.users.get(where.id) ?? null, select)) },
    building: { findMany: vi.fn(async ({ where, select }: any) => [...state.buildings.values()].filter(row => matches(row, where)).map(row => project(row, select))) },
    room: { findUnique: vi.fn(async ({ where, select }: any) => project(state.rooms.get(where.id) ?? null, select)) },
    contract: { findUnique: vi.fn(lookupContract), findFirst: vi.fn(lookupContract), findUniqueOrThrow: vi.fn(async (args: any) => {
      const row = await lookupContract(args); if (!row) throw new Error('Fixture contract not found'); return row;
    }) },
    occupant: {
      findUnique: vi.fn(async ({ where, select }: any) => project(occupantRows().find(row => matches(row, where)) ?? null, select)),
      findFirst: vi.fn(async ({ where, select, orderBy }: any) => project(ordered(occupantRows().filter(row => matches(row, where)), orderBy)[0] ?? null, select)),
      findMany: vi.fn(async ({ where, select, orderBy }: any = {}) => ordered(occupantRows().filter(row => matches(row, where)), orderBy).map(row => project(row, select))),
      count: vi.fn(async ({ where }: any) => occupantRows().filter(row => matches(row, where)).length),
      create: vi.fn(async ({ data, select }: any) => {
        if (failOccupantWrite) throw new Error(`Prisma write failure: ${ID_NUMBER}; idNumberEnc=v1:private; idFrontAssetId=private`);
        const row = occupant({ id: Math.max(...state.occupants.map(value => value.id)) + 1, phone: null,
          idNumberEnc: null, idNumberLast4: null, idFrontAssetId: null, idBackAssetId: null, isSigner: false, ...data });
        state.occupants.push(row); return project(row, select);
      }),
      update: vi.fn(async ({ where, data, select }: any) => {
        const row = state.occupants.find(value => matches(value, where));
        if (!row) throw new Error('Fixture occupant not found'); Object.assign(row, data); return project(row, select);
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = state.occupants.filter(value => matches(value, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length };
      }),
    },
    setting: { findUnique: vi.fn(async () => null) },
    auditLog: { create: vi.fn(async ({ data }: any) => {
      state.audits.push(structuredClone(data));
      if (failAudit) throw new Error('BE-P3-23 simulated failure after audit insert');
      return data;
    }) },
    $queryRaw: vi.fn(async () => []),
  };
  // Serialized fixture transactions prove route rollback decisions, not PostgreSQL lock contention.
  db.$transaction = vi.fn((work: (tx: typeof db) => Promise<unknown>) => {
    const task = queue.then(async () => {
      if (reassignAtTransaction) { state.buildings.get(7).managerId = 6; reassignAtTransaction = false; }
      const before = structuredClone(state);
      try { return await work(db); } catch (error) { state = before; throw error; }
    });
    queue = task.then(() => {}, () => {}); return task;
  });
  const provider = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const data = metadata.get(decodeURIComponent(url.split('/').at(-1)!));
    if (!url.startsWith('https://api.cloudinary.com/v1_1/occupant-fixture/resources/')) throw new Error('Unexpected outbound request');
    if (reassignAfterProvider) { state.buildings.get(7).managerId = 6; reassignAfterProvider = false; }
    return new Response(data ? JSON.stringify(data) : '{}', { status: data ? 200 : 404 });
  });

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', 'test-only-occupant-http-jwt-secret-0123456789');
    vi.stubEnv('CCCD_KEY', KEY.toString('base64'));
    vi.stubEnv('CLOUDINARY_URL', 'cloudinary://fixture-key:fixture-secret@occupant-fixture');
    vi.stubEnv('MAIL_PROVIDER', '');
    const { AppModule } = await import('../../app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db).overrideProvider(MailerService).useValue(mailer).compile();
    app = module.createNestApplication(); app.useLogger(logger); configureApp(app); await app.init();
  });
  beforeEach(() => {
    state = initialState(); queue = Promise.resolve(); failAudit = false; failOccupantWrite = false; reassignAtTransaction = false;
    reassignAfterProvider = false; metadata.clear(); logs.length = 0; vi.clearAllMocks(); vi.stubGlobal('fetch', provider);
  });
  afterAll(async () => { await app?.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  async function api(method: 'get' | 'post' | 'patch', path: string, actor = 2, body?: unknown, lang = 'vi') {
    const token = await app.get(TokenService).signAccessToken({ id: actor, role: roles.get(actor)! });
    const call = request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`).set('Accept-Language', lang);
    return body === undefined ? call : call.send(body as object);
  }
  const path = '/contracts/42/occupants';
  const add = (body: unknown = BODY, actor = 2) => api('post', actor === 3 || actor === 4 ? '/me/contracts/42/occupants' : path, actor, body);
  function roommate(overrides: Partial<FixtureOccupant> = {}) {
    const row = occupant({ id: 100 + state.occupants.length, fullName: 'Existing roommate', isSigner: false,
      phone: null, idNumberEnc: null, idNumberLast4: null, idFrontAssetId: null, idBackAssetId: null, ...overrides });
    state.occupants.push(row); return row;
  }
  function image(assetId = 'roommate-front', contractId = 42) {
    const upload = { assetId, publicId: `contracts/7/${contractId}/id-photo-${assetId}`, version: 1, format: 'jpg' };
    metadata.set(assetId, { asset_id: assetId, public_id: upload.publicId, asset_folder: `contracts/7/${contractId}`,
      version: 1, format: 'jpg', resource_type: 'image', type: 'authenticated' });
    return upload;
  }
  function privateOutput(value: unknown) {
    const text = JSON.stringify(value);
    expect(text.includes(ID_NUMBER), 'Full CCCD must not be exposed').toBe(false);
    for (const secret of ['idNumberEnc', 'idFrontAssetId', 'idBackAssetId', 'private-signer-front', 'private-signer-back']) {
      expect(text.includes(secret), 'Private fields/assets must not be exposed').toBe(false);
    }
  }

  it('CON-13: staff lists occupants with safe dates, last4 and no private asset/ciphertext fields', async () => {
    const res = await api('get', path);
    expect(res.status).toBe(200); expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: 90, fullName: 'Signer fixture', isSigner: true,
      idNumberLast4: '6789', moveInDate: '2026-11-01', moveOutDate: null });
    privateOutput(res.body);
  });
  it('CON-13: staff adds an optional-ID roommate without changing the signer, account, rent or water mode', async () => {
    const users = JSON.stringify([...state.users]); const contract = structuredClone(state.contracts.get(42));
    const result = await add(); expect(result.status).toBe(201); expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data).toMatchObject({ fullName: BODY.fullName, moveInDate: DATE, isSigner: false, idNumberLast4: null });
    expect(state.occupants.filter(row => row.contractId === 42 && row.isSigner)).toHaveLength(1);
    expect(JSON.stringify([...state.users])).toBe(users); expect(state.contracts.get(42)).toEqual(contract);
    expect(state.buildings.get(7).waterMode).toBe('PER_PERSON'); expect(mailer.send).not.toHaveBeenCalled();
    privateOutput(result.body); privateOutput(state.audits);
  });
  it('CON-15 owner 20/11: owning tenant directly adds a roommate without CCCD or approval', async () => {
    const result = await add(BODY, 3); expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ fullName: BODY.fullName, isSigner: false, idNumberLast4: null });
    expect(state.audits).toHaveLength(1); expect(state.audits[0].actorId).toBe(3);
    expect(state.occupants.filter(row => row.contractId === 42)).toHaveLength(2);
  });
  it('CON-04/13: supplied CCCD is encrypted and only last4 reaches staff response', async () => {
    const result = await add({ ...BODY, idNumber: ID_NUMBER }); expect(result.status).toBe(201);
    const row = state.occupants.find(value => value.id === result.body.data.id)!;
    const [version, iv, cipher, tag] = row.idNumberEnc!.split(':'); expect(version).toBe('v1');
    const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(cipher, 'base64')), decipher.final()]).toString('utf8');
    expect(plaintext === ID_NUMBER, 'Stored ciphertext contains the supplied identity').toBe(true);
    expect(result.body.data.idNumberLast4).toBe('7890'); privateOutput(result.body); privateOutput(state.audits); privateOutput(logs);
  });
  it('CON-16: adding tenant does not gain readback of a roommate identity', async () => {
    const result = await add({ ...BODY, idNumber: ID_NUMBER }, 3); expect(result.status).toBe(201);
    expect(result.body.data.idNumberLast4).toBeNull(); privateOutput(result.body);
    const detail = await api('get', '/me/contracts/42', 3); expect(detail.status).toBe(200);
    expect(detail.body.data.occupants.find((value: any) => value.id === result.body.data.id).idNumberLast4).toBeNull();
    privateOutput(detail.body);
  });
  it('CON-13: staff edits roommate information and clears optional identity without deleting the row', async () => {
    const row = roommate({ idNumberEnc: 'old-private-cipher', idNumberLast4: '1234', idFrontAssetId: 'old-front' });
    const result = await api('patch', `${path}/${row.id}`, 2, { fullName: ' Corrected roommate ', phone: null,
      dateOfBirth: null, idNumber: null, idFront: null, moveOutDate: '2026-11-25' });
    expect(result.status).toBe(200); expect(result.body.data).toMatchObject({ id: row.id, fullName: 'Corrected roommate',
      phone: null, dateOfBirth: null, idNumberLast4: null, moveOutDate: '2026-11-25' });
    expect(state.occupants.some(value => value.id === row.id)).toBe(true);
    expect(state.occupants.find(value => value.id === row.id)).toMatchObject({ idNumberEnc: null, idFrontAssetId: null, isSigner: false });
    privateOutput(result.body); privateOutput(state.audits);
  });
  it.each(['HOLD', 'ACTIVE'])('CON-13: %s accepts staff/own-tenant additions', async status => {
    state.contracts.get(42).status = status; expect((await add()).status).toBe(201);
  });
  it.each(['ENDED', 'CANCELLED'])('CON-13: %s remains readable and refuses mutations', async status => {
    state.contracts.get(42).status = status;
    expect((await api('get', path)).status).toBe(200);
    for (const actor of [2, 3]) expect((await add(BODY, actor)).status).toBe(409);
    expect((await api('patch', `${path}/90`, 2, { phone: '0911111111' })).status).toBe(409);
    expect(db.occupant.create).not.toHaveBeenCalled(); expect(db.occupant.update).not.toHaveBeenCalled();
  });
  it('DB-B6/CON-13: move-out day still counts; new admission is allowed the following day', async () => {
    state.rooms.get(30).maxOccupants = 2;
    roommate({ moveOutDate: new Date('2026-11-25') });
    expect((await add({ ...BODY, moveInDate: '2026-11-25' })).status).toBe(409);
    expect(state.occupants.filter(value => value.contractId === 42)).toHaveLength(2);
    expect((await add({ ...BODY, moveInDate: '2026-11-26' })).status).toBe(201);
  });
  it('DB-B6: future scheduled overlap is rejected even when the room is not full today', async () => {
    state.rooms.get(30).maxOccupants = 2;
    roommate({ moveInDate: new Date('2026-12-01'), moveOutDate: new Date('2026-12-10') });
    const result = await add({ ...BODY, moveInDate: '2026-12-05', moveOutDate: '2026-12-06' });
    expect(result.status).toBe(409); expect(result.body.error.code).toBe('CONFLICT_STATE');
  });
  it('DB-B6: a scheduled HOLD also enforces the room limit', async () => {
    state.contracts.get(42).status = 'HOLD'; state.rooms.get(30).maxOccupants = 1;
    expect((await add()).status).toBe(409);
  });
  it('DB-B6: extending a recorded departure into an occupied day is rejected and restored', async () => {
    state.rooms.get(30).maxOccupants = 2;
    const old = roommate({ moveOutDate: new Date('2026-11-24') });
    roommate({ moveInDate: new Date('2026-11-25') });
    const result = await api('patch', `${path}/${old.id}`, 2, { moveOutDate: '2026-11-25' });
    expect(result.status).toBe(409);
    expect(state.occupants.find(row => row.id === old.id)!.moveOutDate).toEqual(new Date('2026-11-24'));
  });
  it('DB-B6: two concurrent serialized edge requests cannot exceed the limit (not PostgreSQL concurrency proof)', async () => {
    state.rooms.get(30).maxOccupants = 2;
    const results = await Promise.all([add({ ...BODY, fullName: 'First' }), add({ ...BODY, fullName: 'Second' })]);
    expect(results.map(value => value.status).sort((a, b) => a - b)).toEqual([201, 409]);
    expect(state.occupants.filter(row => row.contractId === 42)).toHaveLength(2);
    expect(state.audits).toHaveLength(1);
  });
  it('AUD-01: failure after audit INSERT restores the roommate and audit atomically', async () => {
    failAudit = true;
    const before = structuredClone(state.occupants);
    const result = await add({ ...BODY, idNumber: ID_NUMBER }); expect(result.status).toBe(500);
    expect(state.occupants).toEqual(before); expect(state.audits).toEqual([]);
    privateOutput(result.body); privateOutput(logs);
  });
  it('AUD-02: patch audit lists only supplied fields, including explicit null', async () => {
    const row = roommate();
    expect((await api('patch', `${path}/${row.id}`, 2, { fullName: 'Corrected name' })).status).toBe(200);
    expect(state.audits[0].after.fields).toEqual(['fullName']);
    expect((await api('patch', `${path}/${row.id}`, 2, { phone: null })).status).toBe(200);
    expect(state.audits[1].after.fields).toEqual(['phone']);
  });
  it('AUD-01: failed update restores the old identity and departure', async () => {
    const row = roommate(); const before = structuredClone(state.occupants); failAudit = true;
    const result = await api('patch', `${path}/${row.id}`, 2, { idNumber: ID_NUMBER, moveOutDate: DATE });
    expect(result.status).toBe(500); expect(state.occupants).toEqual(before); expect(state.audits).toEqual([]); privateOutput(logs);
  });
  it('CON-16: raw Prisma write failures cannot leak CCCD, ciphertext or asset fields through server logs', async () => {
    failOccupantWrite = true;
    const before = structuredClone(state.occupants);
    const result = await add({ ...BODY, idNumber: ID_NUMBER });
    expect(result.status).toBe(500); expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(state.occupants).toEqual(before); expect(state.audits).toEqual([]);
    privateOutput(result.body); privateOutput(logs);
  });
  it('CON-13: name and phone whitespace are normalized without changing the tenant account phone', async () => {
    const phone = state.users.get(3)!.phone;
    const result = await add({ ...BODY, fullName: '  Roommate fixture  ', phone: ' 0911111111 ' }, 3);
    expect(result.status).toBe(201); expect(result.body.data).toMatchObject({ fullName: 'Roommate fixture', phone: '0911111111' });
    expect(state.users.get(3)!.phone).toBe(phone);
  });
  it('CON-13/FILE-02: verified ID_PHOTO assets are stored without returning their IDs or URLs', async () => {
    const front = image(), back = image('roommate-back');
    const result = await add({ ...BODY, idFront: front, idBack: back }); expect(result.status).toBe(201);
    const row = state.occupants.find(value => value.id === result.body.data.id)!;
    expect(row).toMatchObject({ idFrontAssetId: front.assetId, idBackAssetId: back.assetId });
    expect(result.body.data).toMatchObject({ hasIdFront: true, hasIdBack: true });
    expect(JSON.stringify(result.body).includes(front.assetId), 'Asset ID is private').toBe(false);
    privateOutput(result.body); privateOutput(state.audits);
  });
  it.each(['upload', 'private'])('FILE-02: %s delivery type is not an authenticated ID_PHOTO', async type => {
    const front = image(); metadata.get(front.assetId)!.type = type;
    expect((await add({ ...BODY, idFront: front })).status).toBe(400); expect(db.occupant.create).not.toHaveBeenCalled();
  });
  it('FILE-02: another contract photo is rejected before a write', async () => {
    const front = image('other-contract', 43);
    expect((await add({ ...BODY, idFront: front })).status).toBe(400); expect(db.occupant.create).not.toHaveBeenCalled();
  });
  it('FILE-02: a CONTRACT_SCAN asset cannot be attached as an ID_PHOTO', async () => {
    const front = image(); front.publicId = 'contracts/7/42/contract-scan-fixture';
    expect((await add({ ...BODY, idFront: front })).status).toBe(400); expect(db.occupant.create).not.toHaveBeenCalled();
  });
  it('SCOPE-02: current building assignment is checked after provider verification', async () => {
    const front = image(); reassignAfterProvider = true;
    const result = await add({ ...BODY, idFront: front }); expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('OUT_OF_SCOPE'); expect(db.occupant.create).not.toHaveBeenCalled();
  });
  it('SCOPE-02: current building assignment is rechecked at transaction entry', async () => {
    reassignAtTransaction = true;
    expect((await add()).status).toBe(403); expect(db.occupant.create).not.toHaveBeenCalled();
  });
  it('CON-13: Boss may manage another manager building', async () => {
    state.buildings.get(7).managerId = 6; expect((await add(BODY, 1)).status).toBe(201);
  });
  it('SCOPE-03: foreign and nonexistent tenant contracts are indistinguishable', async () => {
    const foreign = await add(BODY, 4);
    const missing = await api('post', '/me/contracts/999/occupants', 4, BODY);
    expect(foreign.status).toBe(404); expect(missing.status).toBe(404); expect(foreign.body).toEqual(missing.body);
    expect(db.occupant.create).not.toHaveBeenCalled();
  });
  it('SCOPE-02: staff outside the building is denied', async () => {
    const result = await add(BODY, 6); expect(result.status).toBe(403); expect(result.body.error.code).toBe('OUT_OF_SCOPE');
  });
  it('SCOPE-03: an occupant from another contract cannot be patched through an owned contract', async () => {
    const result = await api('patch', `${path}/91`, 2, { fullName: 'Wrong person' });
    expect(result.status).toBe(404); expect(state.occupants.find(row => row.id === 91)!.fullName).toBe('Other signer');
  });
  it.each([3, 4, 5])('CON-15: role actor %i cannot use staff occupant routes', async actor => {
    expect((await api('get', path, actor)).status).toBe(403);
    expect((await api('post', path, actor, BODY)).status).toBe(403);
    expect((await api('patch', `${path}/90`, actor, { phone: '0911111111' })).status).toBe(403);
  });
  it.each([1, 2, 5, 6])('SCOPE-01: actor %i is not a tenant on the self-add route', async actor => {
    expect((await api('post', '/me/contracts/42/occupants', actor, BODY)).status).toBe(403);
  });
  it('AUTH-01: missing credentials cannot read or write', async () => {
    for (const method of ['get', 'post', 'patch'] as const) {
      const target = method === 'patch' ? `${path}/90` : path;
      expect((await request(app.getHttpServer())[method](`/api/v1${target}`).send(BODY)).status).toBe(401);
    }
  });
  it.each([
    { isSigner: true }, { isSigner: false }, { contractId: 43 }, { tenantId: 4 }, { id: 300 },
    { idNumberEnc: 'ciphertext' }, { idNumberLast4: '7890' }, { idFrontAssetId: 'raw-private-asset' },
  ])('CON-13/API-03: client cannot assign protected fields %j', async extra => {
    expect((await add({ ...BODY, ...extra })).status).toBe(400);
    expect((await api('patch', `${path}/90`, 2, extra)).status).toBe(400);
    expect(db.occupant.create).not.toHaveBeenCalled();
  });
  it.each([
    { fullName: '' }, { fullName: '  ' }, { fullName: null }, { fullName: 'x'.repeat(101) },
    { moveInDate: '2026-02-30' }, { moveInDate: '2026-11-20T00:00:00Z' }, { moveInDate: null },
    { moveOutDate: '2026-11-19' }, { dateOfBirth: '9999-12-31' },
    { phone: '123' }, { idNumber: '12345678901' }, { idNumber: 123456789012 },
    { idFront: { assetId: 'a' } },
  ])('CON-13 validation: invalid create/update payload %j is refused', async extra => {
    expect((await add({ ...BODY, ...extra })).status).toBe(400);
    const row = roommate({ moveInDate: new Date(DATE) });
    expect((await api('patch', `${path}/${row.id}`, 2, extra)).status).toBe(400);
  });
  it.each(['0', '-1', '1.5', '2147483648', 'abc'])('API-03: invalid contract id %s is rejected', async id => {
    expect((await api('get', `/contracts/${id}/occupants`)).status).toBe(400);
    expect((await api('post', `/contracts/${id}/occupants`, 2, BODY)).status).toBe(400);
  });
  it.each(['0', '-1', '1.5', '2147483648', 'abc'])('API-03: invalid occupant id %s is rejected', async id => {
    expect((await api('patch', `${path}/${id}`, 2, { phone: null })).status).toBe(400);
  });
  it('CON-04: corrupted history with no signer cannot be expanded', async () => {
    state.occupants = state.occupants.filter(row => row.contractId !== 42);
    expect((await add()).status).toBe(409); expect(db.occupant.create).not.toHaveBeenCalled();
  });
  it('LOC-01/CON-15: tenant English validation localizes a missing occupant name', async () => {
    const result = await api('post', '/me/contracts/42/occupants', 3, { moveInDate: DATE }, 'en-US');
    expect(result.status).toBe(400);
    expect(result.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Invalid input',
      fields: { fullName: 'Invalid full name' } });
  });
  it('LOC-01/CON-15: tenant English validation localizes a blank occupant name', async () => {
    const result = await api('post', '/me/contracts/42/occupants', 3, { ...BODY, fullName: ' ' }, 'en');
    expect(result.status).toBe(400);
    expect(result.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Invalid input',
      fields: { fullName: "Please enter the occupant's full name" } });
  });
  it('LOC-01/CON-15: tenant English validation localizes an impossible calendar day', async () => {
    const result = await api('post', '/me/contracts/42/occupants', 3, { ...BODY, moveInDate: '2026-02-30' }, 'en');
    expect(result.status).toBe(400);
    expect(result.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Invalid input',
      fields: { moveInDate: 'Invalid date; use YYYY-MM-DD' } });
  });
  it('LOC-01/DB-B6: tenant English capacity conflict localizes the business-rule field', async () => {
    state.rooms.get(30).maxOccupants = 1;
    const result = await api('post', '/me/contracts/42/occupants', 3, BODY, 'en-GB');
    expect(result.status).toBe(409);
    expect(result.body.error).toMatchObject({ code: 'CONFLICT_STATE', message: 'This action is not available in the current state',
      fields: { maxOccupants: 'The number of occupants exceeds the room limit during the selected dates' } });
  });
  it.each([
    { extra: { moveOutDate: '2026-11-19' }, field: 'moveOutDate', message: 'The move-out date must be on or after the move-in date' },
    { extra: { dateOfBirth: '9999-12-31' }, field: 'dateOfBirth', message: 'Invalid date of birth' },
  ])('LOC-01/CON-15: tenant English business-date errors localize $field', async ({ extra, field, message }) => {
    const result = await api('post', '/me/contracts/42/occupants', 3, { ...BODY, ...extra }, 'en');
    expect(result.status).toBe(400);
    expect(result.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Invalid input', fields: { [field]: message } });
  });
  it('LOC-01/CON-13: staff validation remains Vietnamese even when the request accepts English', async () => {
    const result = await api('post', path, 2, { ...BODY, fullName: 'x'.repeat(101) }, 'en');
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
    expect(result.body.error.fields.fullName).toBe('Họ và tên tối đa 100 ký tự');
  });
  it('LOC-01/FILE-02: tenant photo metadata errors are English without disclosing asset metadata', async () => {
    const front = image(); metadata.get(front.assetId)!.type = 'upload';
    const result = await api('post', '/me/contracts/42/occupants', 3, { ...BODY, idFront: front }, 'en');
    expect(result.status).toBe(400);
    expect(result.body.error).toMatchObject({ code: 'VALIDATION_FAILED', message: 'Invalid input',
      fields: { assetId: 'Invalid private Cloudinary asset' } });
    expect(JSON.stringify(result.body).includes(front.assetId), 'Asset ID must not be echoed by validation').toBe(false);
  });
});
