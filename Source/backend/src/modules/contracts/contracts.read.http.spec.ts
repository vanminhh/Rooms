import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma, Role } from '@prisma/client';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';

describe('BE-P3-10: staff contract reads', () => {
  let app: INestApplication;
  const roles = new Map<number, Role>([[1, 'BOSS'], [2, 'MANAGER'], [3, 'TENANT'], [4, 'GUEST'], [5, 'MANAGER']]);
  const db = {
    user: { findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
      const role = roles.get(where.id);
      return role ? { id: where.id, role, isActive: true, mustChangePassword: false } : null;
    }) },
    building: { findMany: vi.fn(async ({ where }: { where: { managerId: number } }) =>
      where.managerId === 2 ? [{ id: 7 }, { id: 8 }] : []) },
    contract: {
      count: vi.fn<(args: Prisma.ContractCountArgs) => Promise<number>>(),
      findMany: vi.fn<(args: Prisma.ContractFindManyArgs) => Promise<unknown[]>>(),
      findUnique: vi.fn<(args: Prisma.ContractFindUniqueArgs) => Promise<unknown>>(),
    },
  };
  const startDate = new Date('2026-11-30T00:00:00Z');
  const endDate = new Date('2027-02-27T00:00:00Z');
  const record = {
    id: 123, code: 'HD000123', status: 'ACTIVE', startDate, endDate, termMonths: 3,
    rent: 2_500_000, deposit: 2_500_000, createdAt: new Date('2026-11-17T03:00:00Z'),
    building: { id: 7, code: 'CG01', name: 'Tòa Cầu Giấy' },
    room: { id: 30, code: 'P301' },
    tenant: { id: 15, fullName: 'Nguyễn An', phone: '0912345678', email: null },
  };

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('JWT_SECRET', 'test-only-secret-contract-staff-read');
    const { AppModule } = await import('../../app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(db).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(() => {
    db.contract.count.mockReset().mockResolvedValue(0);
    db.contract.findMany.mockReset().mockResolvedValue([]);
    db.contract.findUnique.mockReset().mockResolvedValue(null);
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  const get = async (path: string, actor: number) => {
    const token = await app.get(TokenService).signAccessToken({ id: actor, role: roles.get(actor)! });
    return request(app.getHttpServer()).get('/api/v1/contracts' + path).set('Authorization', 'Bearer ' + token);
  };

  it('API-02/08: combines the name, phone and room search with status and building, and returns page metadata', async () => {
    db.contract.count.mockResolvedValue(3);
    db.contract.findMany.mockResolvedValue([record]);
    const response = await get('?buildingId=7&status=ACTIVE&q=%20An%20&page=2&limit=1', 2);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      meta: { page: 2, limit: 1, total: 3 },
      data: [{ ...record, startDate: '2026-11-30', endDate: '2027-02-27', createdAt: '2026-11-17T03:00:00.000Z' }],
    });
    const where = {
      buildingId: 7, status: 'ACTIVE',
      OR: [
        { tenant: { fullName: { contains: 'An', mode: 'insensitive' } } },
        { tenant: { phone: { contains: 'An' } } },
        { room: { code: { contains: 'An', mode: 'insensitive' } } },
      ],
    };
    expect(db.contract.count).toHaveBeenCalledWith({ where });
    expect(db.contract.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where, skip: 1, take: 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true, code: true, status: true, startDate: true, endDate: true, termMonths: true, rent: true, deposit: true,
        createdAt: true, room: { select: { id: true, code: true } },
        building: { select: { id: true, code: true, name: true } },
        tenant: { select: { id: true, fullName: true, phone: true, email: true } },
      },
    }));
  });

  it('SCOPE-02: uses assigned buildings for a manager, and no implicit building filter for Boss', async () => {
    expect((await get('', 2)).body).toEqual({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    expect((await get('', 5)).status).toBe(200);
    expect((await get('', 1)).status).toBe(200);
    expect(db.contract.count.mock.calls.map(([args]) => args.where)).toEqual([
      { buildingId: { in: [7, 8] } }, { buildingId: { in: [] } }, {},
    ]);
  });

  it('API-02: uses deterministic ascending order when requested', async () => {
    db.contract.count.mockResolvedValue(1);
    db.contract.findMany.mockResolvedValue([record]);
    expect((await get('?sort=createdAt', 1)).status).toBe(200);
    expect(db.contract.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('API-08: denies an out-of-scope building before listing or counting', async () => {
    const response = await get('?buildingId=9', 2);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.contract.count).not.toHaveBeenCalled();
    expect(db.contract.findMany).not.toHaveBeenCalled();
  });

  it('SCOPE-02: an out-of-scope ID returns 403 and a missing ID returns 404', async () => {
    db.contract.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 123 });
    const outOfScope = await get('/123', 2);
    expect(outOfScope.status).toBe(403);
    expect(outOfScope.body.error.code).toBe('OUT_OF_SCOPE');
    expect(db.contract.findUnique.mock.calls[0][0].where).toEqual({ id: 123, buildingId: { in: [7, 8] } });
    expect(db.contract.findUnique.mock.calls[1][0]).toEqual({ where: { id: 123 }, select: { id: true } });
    expect((await get('/345', 2)).status).toBe(404);
  });

  it.each([3, 4])('SCOPE-05: actor %i cannot query either staff route', async (actor) => {
    expect((await get('', actor)).status).toBe(403);
    expect((await get('/123', actor)).status).toBe(403);
    expect(db.contract.count).not.toHaveBeenCalled();
    expect(db.contract.findUnique).not.toHaveBeenCalled();
  });

  it('API-01/02: rejects invalid IDs and filters with 400 before touching the contract table', async () => {
    expect((await get('/2147483648', 2)).status).toBe(400);
    expect((await get('?status=WON', 2)).status).toBe(400);
    expect((await get('?buildingId=0&limit=101', 2)).status).toBe(400);
    expect(db.contract.count).not.toHaveBeenCalled();
    expect(db.contract.findUnique).not.toHaveBeenCalled();
  });

  it('API-04: rejects a NUL in the search term before passing it to PostgreSQL', async () => {
    const response = await get('?q=An%00', 2);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', fields: { q: expect.any(String) } });
    expect(db.contract.count).not.toHaveBeenCalled();
  });

  const detail = {
    ...record, terms: 'Điều khoản thử nghiệm',
    signedAt: new Date('2026-11-17T04:00:00Z'), movedInAt: null,
    occupants: [{
      id: 50, fullName: 'Nguyễn An', phone: '0912345678', dateOfBirth: new Date('1993-01-02T00:00:00Z'),
      isSigner: true, idNumberLast4: '6789', moveInDate: startDate, moveOutDate: null,
    }],
    vehicles: [{
      id: 60, plate: '29A12345', type: 'MOTORBIKE', serviceId: 8,
      isActive: true, registeredAt: startDate, removedAt: null,
    }],
    services: [{ service: { id: 4, name: 'Internet', unit: 'ROOM' } }],
  };

  it('CON-13/14/16: projects last four CCCD digits and exposes only a deposit invoice summary', async () => {
    db.contract.findUnique.mockResolvedValue({
      ...detail,
      invoices: [{ id: 70, status: 'PAID', total: 2_500_000, issueDate: startDate, dueDate: startDate }],
    });
    const response = await get('/123', 2);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: 123, signedAt: '2026-11-17T04:00:00.000Z', movedInAt: null,
      occupants: [{
        id: 50, isSigner: true, idNumberLast4: '6789', dateOfBirth: '1993-01-02',
        moveInDate: '2026-11-30', moveOutDate: null,
      }],
      vehicles: [{ id: 60, plate: '29A12345', registeredAt: '2026-11-30' }],
      services: [{ id: 4, name: 'Internet', unit: 'ROOM' }],
      depositInvoice: { id: 70, status: 'PAID', total: 2_500_000, issueDate: '2026-11-30', dueDate: '2026-11-30' },
    });
    expect(response.body.data).not.toHaveProperty('invoices');
    const select = db.contract.findUnique.mock.calls[0][0].select!;
    expect(select.tenant).toEqual({ select: { id: true, fullName: true, phone: true, email: true } });
    expect(select.occupants).toMatchObject({ select: {
      id: true, fullName: true, phone: true, dateOfBirth: true,
      isSigner: true, idNumberLast4: true, moveInDate: true, moveOutDate: true,
    } });
    const keys = JSON.stringify([select, response.body]);
    expect(keys).not.toMatch(/idNumberEnc|passwordHash|idFrontAssetId|idBackAssetId|signedScanAssetId|pdfUrl/);
    expect(select.invoices).toMatchObject({ where: { type: 'DEPOSIT' }, take: 1 });
  });

  it('BE-P3-10: returns a null summary when a deposit invoice does not exist yet', async () => {
    db.contract.findUnique.mockResolvedValue({ ...detail, invoices: [] });
    const response = await get('/123', 1);
    expect(response.status).toBe(200);
    expect(response.body.data.depositInvoice).toBeNull();
    expect(db.contract.findUnique.mock.calls[0][0].where).toEqual({ id: 123 });
  });
});
