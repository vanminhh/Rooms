import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';

const DRAFT_LABEL = 'BẢN NHÁP – chưa dùng để ký'; // CON-22 / Q-15.
const PRIVATE_SCAN = 'private-scan-42';
const PRIVATE_CIPHERTEXT = 'v1:private-identity-ciphertext-fixture';
const FULL_ID_NUMBER = '001234566789';
const roles = new Map<number, Role>([[1, 'BOSS'], [2, 'MANAGER'], [3, 'TENANT'], [4, 'TENANT'], [5, 'GUEST'], [6, 'MANAGER']]);

function initialState() {
  return {
    users: new Map([...roles].map(([id, role]) => [id, { id, role, isActive: true, mustChangePassword: false,
      passwordHash: `test-only-password-hash-${id}`, fullName: 'Mutable account profile name', phone: `090000000${id}`, email: null }])),
    buildings: new Map<number, any>([
      [7, { id: 7, managerId: 2, isActive: true, code: 'CG01', name: 'Tòa Cầu Giấy', address: '12 Phố A', ward: 'Dịch Vọng', district: 'Cầu Giấy' }],
      [8, { id: 8, managerId: 6, isActive: true, code: 'DD01', name: 'Tòa Đống Đa' }],
    ]),
    contract: { id: 42, code: 'HD000042', buildingId: 7, tenantId: 4, status: 'HOLD', signedScanAssetId: PRIVATE_SCAN as string | null,
      startDate: new Date('2027-01-31'), endDate: new Date('2027-04-29'), termMonths: 3, rent: 2_500_000, deposit: 2_500_000,
      createdAt: new Date('2026-11-01T03:00:00Z'), signedAt: new Date('2026-11-02T03:00:00Z'), movedInAt: null,
      terms: 'Giữ yên tĩnh sau 22 giờ',
    },
    occupants: [
      { id: 90, isSigner: true, fullName: 'Nguyễn Văn An trên hợp đồng', phone: '0912345678' as string | null,
        dateOfBirth: new Date('1995-01-02') as Date | null, idNumberLast4: '6789' as string | null,
        idNumberEnc: PRIVATE_CIPHERTEXT, idPhotoFrontAssetId: 'private-id-front', idPhotoBackAssetId: 'private-id-back',
        moveInDate: new Date('2027-01-31'), moveOutDate: null },
      { id: 91, isSigner: false, fullName: 'Người cùng ở', phone: '0911111111', dateOfBirth: null,
        idNumberLast4: '2222', idNumberEnc: 'v1:other-occupant-ciphertext', idPhotoFrontAssetId: 'private-other-id-front',
        moveInDate: new Date('2027-01-31'), moveOutDate: null },
    ],
    template: undefined as unknown,
    audits: [] as any[],
  };
}

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => value && typeof value === 'object' && 'in' in value
    ? value.in.includes(row[key]) : row[key] === value);
}

// Project the real SELECT, including relation filters, so print cannot read extra identity fields from a fake.
function project(row: any, select: any): any {
  if (row === null || row === undefined) return row;
  if (Array.isArray(row)) return row.map(value => project(value, select));
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).filter(([, value]) => value).map(([key, value]: [string, any]) => {
    if (value === true) return [key, row[key]];
    let relation = row[key];
    if (Array.isArray(relation)) {
      relation = relation.filter(item => matches(item, value.where));
      if (value.take !== undefined) relation = relation.slice(0, value.take);
    }
    return [key, project(relation, value.select)];
  }));
}

describe('BE-P3-18 / CON-16 / CON-22: contract scans and printable documents over HTTP', () => {
  let app: INestApplication;
  let state = initialState();
  let queue = Promise.resolve();
  let reassignOnTransaction = false;
  const row = () => {
    const building = state.buildings.get(state.contract.buildingId);
    return { ...state.contract, building: { ...building, manager: state.users.get(building.managerId) ?? null },
      tenant: state.users.get(state.contract.tenantId), room: { id: 30, code: 'P301' },
      occupants: state.occupants, vehicles: [], services: [], invoices: [],
    };
  };
  const lookup = async ({ where, select }: any) => matches(state.contract, where) ? project(row(), select) : null;
  const db: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => state.users.get(where.id) ?? null) },
    building: { findMany: vi.fn(async ({ where }: any) => [...state.buildings.values()]
      .filter(building => matches(building, where)).map(building => ({ id: building.id }))) },
    contract: {
      findUnique: vi.fn(lookup), findFirst: vi.fn(lookup),
      findUniqueOrThrow: vi.fn(async (args: any) => {
        const result = await lookup(args);
        if (!result) throw new Error('Missing fixture contract');
        return result;
      }),
      count: vi.fn(async ({ where }: any) => Number(matches(state.contract, where))),
      findMany: vi.fn(async ({ where, select, skip = 0 }: any) => matches(state.contract, where) && skip === 0 ? [project(row(), select)] : []),
    },
    setting: { findUnique: vi.fn(async ({ where }: any) => where.key === 'contract_template' && state.template !== undefined
      ? { value: state.template } : null) },
    auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return data; }) },
    $queryRaw: vi.fn(async () => []),
  };
  db.$transaction = vi.fn((work: (tx: typeof db) => Promise<unknown>) => {
    const task = queue.then(async () => {
      if (reassignOnTransaction) { state.buildings.get(7).managerId = 6; reassignOnTransaction = false; }
      const before = structuredClone(state);
      try { return await work(db); } catch (error) { state = before; throw error; }
    });
    queue = task.then(() => {}, () => {});
    return task;
  });

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', 'test-only-document-routes-0123456789abcdef');
    vi.stubEnv('MAIL_PROVIDER', '');
    vi.stubEnv('CLOUDINARY_URL', 'cloudinary://document-key:document-secret@document-cloud');
    const { AppModule } = await import('../../app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  beforeEach(() => {
    state = initialState();
    queue = Promise.resolve();
    reassignOnTransaction = false;
    vi.clearAllMocks();
    vi.stubEnv('CLOUDINARY_URL', 'cloudinary://document-key:document-secret@document-cloud');
  });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });

  async function token(id: number) {
    return app.get(TokenService).signAccessToken({ id, role: roles.get(id)! });
  }
  async function get(path: string, actor = 2) {
    return request(app.getHttpServer()).get(`/api/v1${path}`).set('Authorization', `Bearer ${await token(actor)}`);
  }

  it.each([
    ['/contracts/42/scan', 2], ['/contracts/42/scan', 1], ['/me/contracts/42/scan', 4],
  ] as const)('CON-16: %s actor %s gets a signed URL valid for 300 seconds and one audit', async (path, actor) => {
    const before = Math.floor(Date.now() / 1000);
    const result = await get(path, actor);
    const after = Math.floor(Date.now() / 1000);
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(Object.keys(result.body.data).sort()).toEqual(['expiresAt', 'url']);
    const url = new URL(result.body.data.url);
    expect(url.origin).toBe('https://api.cloudinary.com');
    expect(url.pathname).toBe('/v1_1/document-cloud/asset/download');
    expect(url.searchParams.get('asset_id')).toBe(PRIVATE_SCAN);
    expect(url.searchParams.get('api_key')).toBe('document-key');
    const timestamp = Number(url.searchParams.get('timestamp'));
    const expires = Number(url.searchParams.get('expires_at'));
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
    expect(expires - timestamp).toBe(300);
    expect(result.body.data.expiresAt).toBe(new Date(expires * 1000).toISOString());
    const signature = createHash('sha1').update(`asset_id=${PRIVATE_SCAN}&expires_at=${expires}&timestamp=${timestamp}document-secret`).digest('hex');
    expect(url.searchParams.get('signature')).toBe(signature);
    expect(JSON.stringify(result.body)).not.toContain('document-secret');
    expect(state.audits).toEqual([expect.objectContaining({ actorId: actor, action: 'contract.view_scan', entity: 'contract', entityId: 42 })]);
    expect(state.audits[0]).not.toHaveProperty('after');
  });

  it('CON-16/AUD-01: each successful scan view is audited even when the same caller reads it twice', async () => {
    expect((await get('/contracts/42/scan')).status).toBe(200);
    expect((await get('/contracts/42/scan')).status).toBe(200);
    expect((await get('/me/contracts/42/scan', 4)).status).toBe(200);
    expect(state.audits.map(audit => audit.actorId)).toEqual([2, 2, 4]);
    expect(state.audits.every(audit => audit.action === 'contract.view_scan')).toBe(true);
  });

  it('CON-16: a contract without a stored scan returns 404 and creates no audit', async () => {
    state.contract.signedScanAssetId = null;
    const result = await get('/contracts/42/scan');
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe('NOT_FOUND');
    expect(state.audits).toEqual([]);
  });

  it('CON-16/AUD-01: an audit write failure returns no URL and rolls back its attempted audit', async () => {
    db.auditLog.create.mockImplementationOnce(async ({ data }: any) => {
      state.audits.push(data);
      throw new Error('fixture document audit failure');
    });
    const result = await get('/me/contracts/42/scan', 4);
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(result.body).not.toHaveProperty('data');
    expect(JSON.stringify(result.body)).not.toContain('cloudinary');
    expect(JSON.stringify(result.body)).not.toContain(PRIVATE_SCAN);
    expect(state.audits).toEqual([]);
  });

  it('CON-16: missing provider configuration returns 503 and rolls back the view audit', async () => {
    vi.stubEnv('CLOUDINARY_URL', '');
    const result = await get('/contracts/42/scan');
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('UPLOAD_NOT_CONFIGURED');
    expect(result.body).not.toHaveProperty('data');
    expect(state.audits).toEqual([]);
    expect(db.auditLog.create).toHaveBeenCalledOnce();
  });

  it.each(['/contracts/42/print', '/me/contracts/42/print'])('CON-22/Q-15: %s prints the signer snapshot with Vietnamese money and dates', async path => {
    const result = await get(path, path.startsWith('/me/') ? 4 : 2);
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data.isDraft).toBe(true);
    const content = result.body.data.content;
    expect(content.startsWith(DRAFT_LABEL)).toBe(true);
    for (const value of ['Nguyễn Văn An trên hợp đồng', '0912345678', '02/01/1995', '31/01/2027', '29/04/2027', '2.500.000 đ', '6789', '12 Phố A']) {
      expect(content).toContain(value);
    }
    for (const privateValue of ['Mutable account profile name', PRIVATE_SCAN, PRIVATE_CIPHERTEXT, FULL_ID_NUMBER, 'private-id-front', 'private-id-back', '2222', 'test-only-password-hash']) {
      expect(content).not.toContain(privateValue);
    }
    const printQuery = db.contract.findUniqueOrThrow.mock.calls[0][0];
    expect(printQuery.select).not.toHaveProperty('tenant');
    expect(printQuery.select).not.toHaveProperty('signedScanAssetId');
    expect(printQuery.select.occupants).toMatchObject({ where: { isSigner: true }, take: 1 });
    expect(printQuery.select.occupants.select).not.toHaveProperty('idNumberEnc');
    expect(printQuery.select.occupants.select).not.toHaveProperty('idPhotoFrontAssetId');
    expect(state.audits).toEqual([]);
  });

  it('CON-22: an approved template fills stable snapshots even when the current tenant account changed', async () => {
    state.users.get(4)!.fullName = 'Changed account name';
    state.template = { content: '{{tenant.fullName}} | {{tenant.phone}} | {{tenant.idNumberLast4}} | {{contract.rent}} | {{contract.startDate}}', isDraft: false };
    const result = await get('/me/contracts/42/print', 4);
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({
      content: 'Nguyễn Văn An trên hợp đồng | 0912345678 | 6789 | 2.500.000 đ | 31/01/2027', isDraft: false,
    });
  });

  it('CON-22: missing optional signer details do not leak null or old data, while zero deposit remains formatted money', async () => {
    Object.assign(state.occupants[0], { phone: null, dateOfBirth: null, idNumberLast4: null });
    state.contract.deposit = 0;
    state.template = { content: '{{tenant.phone}} / {{tenant.dateOfBirth}} / {{tenant.idNumberLast4}} / {{contract.deposit}}', isDraft: false };
    const result = await get('/contracts/42/print');
    expect(result.status).toBe(200);
    expect(result.body.data.isDraft).toBe(false);
    expect(result.body.data.content).toContain('0 đ');
    expect(result.body.data.content).not.toMatch(/null|undefined|6789|0912345678|02\/01\/1995/);
  });

  it('CON-22/D-46: a waiting renewal prints its own terms and the source signer', async () => {
    const [signer] = state.occupants;
    Object.assign(state.contract, { roomId: 30, previousContract: {
      roomId: 30, buildingId: 7, tenantId: 4, occupants: [signer],
    } });
    state.contract.terms = 'Renewal terms';
    state.occupants = [];
    const result = await get('/contracts/42/print');
    expect(result.status).toBe(200);
    expect(result.body.data.content).toContain(signer.fullName);
    expect(result.body.data.content).toContain('Renewal terms');
    expect(result.body.data.content).not.toContain(PRIVATE_CIPHERTEXT);
  });

  it.each(['missing signer', 'invalid last4'])('CON-22: %s fails closed rather than printing unsafe identity data', async invalid => {
    if (invalid === 'missing signer') state.occupants = [];
    else state.occupants[0].idNumberLast4 = FULL_ID_NUMBER;
    const result = await get('/contracts/42/print');
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(result.body).not.toHaveProperty('data');
    expect(JSON.stringify(result.body)).not.toContain(FULL_ID_NUMBER);
  });

  it('CON-22: invalid configured placeholders return a constant error without identity or template contents', async () => {
    state.template = { content: 'private-template-value {{tenant.idNumberEnc}}', isDraft: false };
    const result = await get('/me/contracts/42/print', 4);
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(result.body)).not.toContain('private-template-value');
    expect(JSON.stringify(result.body)).not.toContain(PRIVATE_CIPHERTEXT);
  });

  it.each(['scan', 'print'])('SCOPE-02/SCOPE-03: %s distinguishes foreign staff scope from foreign tenant ownership', async document => {
    const staff = await get(`/contracts/42/${document}`, 6);
    expect(staff.status).toBe(403);
    expect(staff.body.error.code).toBe('OUT_OF_SCOPE');
    const tenant = await get(`/me/contracts/42/${document}`, 3);
    expect(tenant.status).toBe(404);
    expect(tenant.body.error.code).toBe('NOT_FOUND');
    expect(db.contract.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(state.audits).toEqual([]);
  });

  it.each(['scan', 'print'])('API-07: guests and mismatched route groups cannot access %s', async document => {
    for (const [path, actor] of [
      [`/contracts/42/${document}`, 5], [`/me/contracts/42/${document}`, 5],
      [`/contracts/42/${document}`, 4], [`/me/contracts/42/${document}`, 2],
    ] as const) {
      const result = await get(path, actor);
      expect(result.status).toBe(403);
      expect(result.body.error.code).toBe('FORBIDDEN');
    }
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(['scan', 'print'])('SCOPE-02: current assignment is rechecked under the mapping lock for %s', async document => {
    reassignOnTransaction = true;
    const result = await get(`/contracts/42/${document}`);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.contract.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(state.audits).toEqual([]);
  });

  it.each(['scan', 'print'])('SCOPE-02: a manager cannot gain newly assigned request scope mid-flight for %s', async document => {
    state.buildings.get(7).managerId = 6;
    db.building.findMany.mockImplementationOnce(async () => {
      state.buildings.get(7).managerId = 2;
      return [];
    });
    const result = await get(`/contracts/42/${document}`);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.contract.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it.each(['scan', 'print'])('CON-16/CON-22: missing IDs return 404 and malformed IDs return 400 for %s', async document => {
    expect((await get(`/contracts/999/${document}`)).status).toBe(404);
    expect((await get(`/me/contracts/999/${document}`, 4)).status).toBe(404);
    for (const id of ['0', '-1', '1.5', '2147483648', 'invalid']) {
      expect((await get(`/contracts/${id}/${document}`)).status).toBe(400);
    }
    expect(state.audits).toEqual([]);
  });

  it('SCOPE-03/CON-16: tenant list/detail keep ownership and hide non-signer identity suffixes', async () => {
    const list = await get('/me/contracts?page=1&limit=20', 4);
    expect(list.status).toBe(200);
    expect(list.body.meta).toEqual({ page: 1, limit: 20, total: 1 });
    expect(list.body.data.map((contract: any) => contract.id)).toEqual([42]);
    expect(list.headers['cache-control']).toBe('no-store');
    const detail = await get('/me/contracts/42', 4);
    expect(detail.status).toBe(200);
    expect(detail.body.data.occupants).toEqual([
      expect.objectContaining({ id: 90, idNumberLast4: '6789' }),
      expect.objectContaining({ id: 91, idNumberLast4: null }),
    ]);
    for (const value of [list.body, detail.body]) {
      const text = JSON.stringify(value);
      for (const privateValue of [PRIVATE_SCAN, PRIVATE_CIPHERTEXT, FULL_ID_NUMBER, 'private-id-front', 'test-only-password-hash']) {
        expect(text).not.toContain(privateValue);
      }
    }
    expect((await get('/me/contracts/42', 3)).status).toBe(404);
    const foreignList = await get('/me/contracts', 3);
    expect(foreignList.body.data).toEqual([]);
    expect(foreignList.body.meta.total).toBe(0);
    expect((await get('/me/contracts', 5)).status).toBe(403);
  });

  it('API-07: anonymous document requests fail before any transaction or audit', async () => {
    for (const path of ['/contracts/42/scan', '/me/contracts/42/print']) {
      const result = await request(app.getHttpServer()).get(`/api/v1${path}`);
      expect(result.status).toBe(401);
    }
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(state.audits).toEqual([]);
  });
});
