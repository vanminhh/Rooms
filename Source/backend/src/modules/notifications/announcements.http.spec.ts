import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Announcement, ContractStatus, Prisma, Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { MailerService } from '../mailer/mailer.service.js';

const endpoint = '/api/v1/announcements';
const content = { title: 'Bảo trì thang máy', body: 'Bảo trì từ 9 giờ.\nVui lòng dùng thang bộ.' };
const people: { id: number; role: Role; fullName: string }[] = [
  { id: 1, role: 'BOSS', fullName: 'Chủ tòa' },
  { id: 2, role: 'MANAGER', fullName: 'Quản lý A' },
  { id: 3, role: 'TENANT', fullName: 'Người thuê 1' },
  { id: 4, role: 'TENANT', fullName: 'Người thuê 2' },
  { id: 5, role: 'TENANT', fullName: 'Người thuê 3' },
  { id: 6, role: 'TENANT', fullName: 'Người thuê 4' },
  { id: 7, role: 'GUEST', fullName: 'Khách' },
];
const buildings = [
  { id: 10, name: 'Tòa A', managerId: 2, isActive: true },
  { id: 20, name: 'Tòa B', managerId: null, isActive: true },
];
const rooms = [
  { id: 101, buildingId: 10, code: 'P101' },
  { id: 102, buildingId: 10, code: 'P102' },
  { id: 201, buildingId: 20, code: 'P201' },
  { id: 202, buildingId: 20, code: 'P202' },
];
const contracts: { tenantId: number; buildingId: number; roomId: number; status: ContractStatus }[] = [
  { tenantId: 3, buildingId: 10, roomId: 101, status: 'ACTIVE' },
  // Synthetic same-room case from BE-P5-01. The current DB limits a room to one ACTIVE contract.
  { tenantId: 4, buildingId: 10, roomId: 101, status: 'ACTIVE' },
  { tenantId: 3, buildingId: 20, roomId: 201, status: 'ACTIVE' },
  { tenantId: 5, buildingId: 20, roomId: 202, status: 'ACTIVE' },
  { tenantId: 6, buildingId: 10, roomId: 102, status: 'HOLD' },
  { tenantId: 6, buildingId: 10, roomId: 101, status: 'ENDED' },
];
type Notice = Prisma.NotificationCreateManyInput & { id: number; readAt: Date | null };
type Assignment = { managerId: number; isActive: boolean; manager: { isActive: boolean } };
type ListWhere = { buildingId?: number | { in: number[] }; building?: Assignment };

describe('BE-P5-01..02 · staff announcements HTTP contract', () => {
  let app: INestApplication;
  let tokens: TokenService;
  let announcements: Announcement[] = [];
  let notifications: Notice[] = [];

  function announcementView(row: Announcement) {
    const author = people.find(person => person.id === row.authorId)!;
    const building = buildings.find(record => record.id === row.buildingId);
    const room = rooms.find(record => record.id === row.roomId);
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      author: { id: author.id, fullName: author.fullName },
      building: building ? { id: building.id, name: building.name } : null,
      room: room ? { id: room.id, code: room.code } : null,
    };
  }

  function matchesAssignment(building: typeof buildings[number], where: Assignment) {
    return building.managerId === where.managerId && building.isActive === where.isActive && where.manager.isActive;
  }

  function matchesAnnouncement(row: Announcement, where: ListWhere) {
    const buildingId = where.buildingId;
    if (typeof buildingId === 'number' && row.buildingId !== buildingId) return false;
    if (typeof buildingId === 'object' && (row.buildingId === null || !buildingId.in.includes(row.buildingId))) return false;
    const building = buildings.find(record => record.id === row.buildingId);
    return !where.building || (building !== undefined && matchesAssignment(building, where.building));
  }

  const tx = {
    $queryRaw: vi.fn(async () => []),
    building: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
        const building = buildings.find(record => record.id === where.id);
        return building ? { ...building, manager: building.managerId === null ? null : { isActive: true } } : null;
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: number } & Assignment }) =>
        buildings.find(building => building.id === where.id && matchesAssignment(building, where)) ?? null),
    },
    room: {
      findUnique: vi.fn(async ({ where }: { where: { id_buildingId: { id: number; buildingId: number } } }) =>
        rooms.find(room => room.id === where.id_buildingId.id && room.buildingId === where.id_buildingId.buildingId) ?? null),
    },
    announcement: {
      create: vi.fn(async ({ data }: { data: Omit<Announcement, 'id' | 'createdAt'> }) => {
        const row = { ...data, id: announcements.length + 1, createdAt: new Date('2026-11-24T02:00:00Z') };
        announcements.push(row);
        return announcementView(row);
      }),
      count: vi.fn(async ({ where }: { where: ListWhere }) => announcements.filter(row => matchesAnnouncement(row, where)).length),
      findMany: vi.fn(async ({ where, orderBy, skip, take }: {
        where: ListWhere; orderBy: [{ createdAt: 'asc' | 'desc' }, { id: 'asc' | 'desc' }]; skip: number; take: number;
      }) => announcements.filter(row => matchesAnnouncement(row, where))
        .sort((a, b) => (orderBy[0].createdAt === 'asc' ? 1 : -1) * (a.createdAt.getTime() - b.createdAt.getTime())
          || (orderBy[1].id === 'asc' ? a.id - b.id : b.id - a.id))
        .slice(skip, skip + take).map(announcementView)),
    },
    contract: {
      groupBy: vi.fn(async ({ where }: { where: { status: ContractStatus; buildingId?: number; roomId?: number; tenant?: { role: Role } } }) => {
        const matching = contracts.filter(row => row.status === where.status
          && (where.buildingId === undefined || row.buildingId === where.buildingId)
          && (where.roomId === undefined || row.roomId === where.roomId)
          && (where.tenant === undefined || people.find(person => person.id === row.tenantId)?.role === where.tenant.role));
        return [...new Set(matching.map(row => row.tenantId))].map(tenantId => ({ tenantId }));
      }),
    },
    notification: {
      createMany: vi.fn(async ({ data }: { data: Prisma.NotificationCreateManyInput[] }) => {
        const nextId = notifications.length + 1;
        notifications.push(...data.map((row, index) => ({ ...row, id: nextId + index, readAt: null })));
        return { count: data.length };
      }),
      groupBy: vi.fn(async ({ where }: { where: { announcementId: { in: number[] } } }) =>
        where.announcementId.in.flatMap(announcementId => {
          const matching = notifications.filter(row => row.announcementId === announcementId);
          if (matching.length === 0) return [];
          return [{ announcementId, _count: { _all: matching.length, readAt: matching.filter(row => row.readAt !== null).length } }];
        })),
    },
  };
  const prisma = {
    user: { findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
      const person = people.find(record => record.id === where.id);
      return person ? { ...person, isActive: true, mustChangePassword: false, passwordHash: '' } : null;
    }) },
    building: { findMany: vi.fn(async ({ where }: { where: { managerId: number; isActive: boolean } }) =>
      buildings.filter(record => record.managerId === where.managerId && record.isActive === where.isActive)) },
    notification: {
      findFirst: vi.fn(async ({ where }: { where: { id: number; userId: number } }) => {
        const row = notifications.find(notice => notice.id === where.id && notice.userId === where.userId);
        return row ? { id: row.id, readAt: row.readAt } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: number; userId: number; readAt: null }; data: { readAt: Date };
      }) => {
        const row = notifications.find(notice => notice.id === where.id && notice.userId === where.userId && notice.readAt === where.readAt);
        if (!row) return { count: 0 };
        row.readAt = data.readAt;
        return { count: 1 };
      }),
    },
    $transaction: vi.fn(async (work: (db: typeof tx) => Promise<unknown>) => {
      const announcementCount = announcements.length;
      const notificationCount = notifications.length;
      try {
        return await work(tx);
      } catch (error) {
        announcements.length = announcementCount;
        notifications.length = notificationCount;
        throw error;
      }
    }),
  };
  const sendMail = vi.fn();

  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'announcements-test-secret');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(MailerService).useValue({ send: sendMail }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    tokens = module.get(TokenService);
  });
  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    buildings[0].managerId = 2;
    announcements = [];
    notifications = [];
  });

  async function auth(id: number) {
    const person = people.find(record => record.id === id)!;
    return `Bearer ${await tokens.signAccessToken({ ...person, passwordHash: '' })}`;
  }

  async function post(authorId: number, fields: Record<string, unknown>) {
    return request(app.getHttpServer()).post(endpoint).set('Authorization', await auth(authorId)).send({ ...content, ...fields });
  }

  async function list(userId: number, query = '') {
    return request(app.getHttpServer()).get(endpoint + query).set('Authorization', await auth(userId));
  }

  it('NOTI-02, NOTI-03, A-12, PUB-05: manager sends the original text to the selected room with no-store', async () => {
    const response = await post(2, { buildingId: 10, roomId: 101 });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toEqual({
      id: 1, ...content, createdAt: '2026-11-24T02:00:00.000Z',
      author: { id: 2, fullName: 'Quản lý A' }, building: { id: 10, name: 'Tòa A' }, room: { id: 101, code: 'P101' },
      readCount: 0, recipientCount: 2,
    });
    expect(tx.notification.createMany).toHaveBeenCalledWith({ data: [3, 4].map(userId => ({
      userId, ...content, kind: 'ANNOUNCEMENT', link: '/thue/thong-bao', announcementId: 1,
    })) });
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('NOTI-02, NOTI-03: building send selects only that building, including all its rooms', async () => {
    const response = await post(1, { buildingId: 20 });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ recipientCount: 2, room: null });
    expect(notifications.map(row => row.userId)).toEqual([3, 5]);
  });

  it('NOTI-03, D-45: Boss can notify all buildings once per tenant, through the inbox', async () => {
    const response = await post(1, { buildingId: null });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ building: null, room: null, recipientCount: 3 });
    expect(notifications.map(row => row.userId)).toEqual([3, 4, 5]);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('NOTI-03: a room with only a HOLD contract still gets a saved announcement with zero recipients', async () => {
    const response = await post(2, { buildingId: 10, roomId: 102 });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ readCount: 0, recipientCount: 0 });
    expect(announcements).toHaveLength(1);
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it('NOTI-02, SCOPE-02: manager cannot send chain-wide or use another building; tenant and guest cannot send', async () => {
    for (const [authorId, buildingId, expected] of [
      [2, null, 'FORBIDDEN'], [2, 20, 'OUT_OF_SCOPE'], [3, 10, 'FORBIDDEN'], [7, 10, 'FORBIDDEN'],
    ] as const) {
      const response = await post(authorId, { buildingId });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(expected);
    }
    expect(tx.announcement.create).not.toHaveBeenCalled();
  });

  it('SCOPE-02: a manager whose building was reassigned after the guard cannot send', async () => {
    tx.building.findUnique.mockResolvedValueOnce({ ...buildings[0], managerId: 8, manager: { isActive: true } });
    const response = await post(2, { buildingId: 10 });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('OUT_OF_SCOPE');
    expect(tx.announcement.create).not.toHaveBeenCalled();
  });

  it('NOTI-02, API-03: validates the exact room/building pair and rejects malformed inputs before sending', async () => {
    for (const [fields, field] of [
      [{ buildingId: 10, roomId: 201 }, 'roomId'],
      [{ buildingId: null, roomId: 101 }, 'roomId'],
      [{}, 'buildingId'],
      [{ buildingId: 2_147_483_648 }, 'buildingId'],
      [{ buildingId: 10, title: 'a'.repeat(151) }, 'title'],
      [{ buildingId: 10, body: 'abc\0def' }, 'body'],
      [{ buildingId: 10, body: '   ' }, 'body'],
      [{ buildingId: 10, authorId: 2 }, 'authorId'],
    ] as const) {
      const response = await post(1, fields);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({ code: 'VALIDATION_FAILED', fields: { [field]: expect.any(String) } });
    }
    expect(tx.announcement.create).not.toHaveBeenCalled();
  });

  it('NOTI-03: a failed bulk insert rolls back the announcement too', async () => {
    tx.notification.createMany.mockRejectedValueOnce(new Error('synthetic insert failure'));
    const response = await post(1, { buildingId: null });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(tx.announcement.create).toHaveBeenCalledTimes(1);
    expect(announcements).toEqual([]);
    expect(notifications).toEqual([]);
  });

  it('NOTI-02, SCOPE-02, API-08, PUB-05: staff see announcements within scope with no-store', async () => {
    expect((await post(2, { buildingId: 10, roomId: 101 })).status).toBe(201);
    expect((await post(1, { buildingId: 20 })).status).toBe(201);
    expect((await post(1, { buildingId: null })).status).toBe(201);
    expect((await post(1, { buildingId: 10 })).status).toBe(201);

    for (const [userId, query, ids] of [
      [1, '', [4, 3, 2, 1]], [2, '', [4, 1]], [1, '?buildingId=20', [2]], [2, '?buildingId=10', [4, 1]],
    ] as const) {
      const response = await list(userId, query);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.data.map((row: Announcement) => row.id)).toEqual(ids);
      expect(response.body.meta).toEqual({ page: 1, limit: 20, total: ids.length });
    }
    for (const [userId, query, code] of [
      [2, '?buildingId=20', 'OUT_OF_SCOPE'], [3, '', 'FORBIDDEN'], [7, '', 'FORBIDDEN'],
    ] as const) {
      const response = await list(userId, query);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(code);
    }
  });

  it('SCOPE-02: a stale manager scope cannot list a building after reassignment', async () => {
    expect((await post(2, { buildingId: 10 })).status).toBe(201);
    const oldBuilding = { ...buildings[0] };
    buildings[0].managerId = 8;

    prisma.building.findMany.mockResolvedValueOnce([oldBuilding]);
    const unfiltered = await list(2);
    expect(unfiltered.status).toBe(200);
    expect(unfiltered.body.data).toEqual([]);

    prisma.building.findMany.mockResolvedValueOnce([oldBuilding]);
    const filtered = await list(2, '?buildingId=10');
    expect(filtered.status).toBe(403);
    expect(filtered.body.error.code).toBe('OUT_OF_SCOPE');
  });

  it('NOTI-03: staff count only reads of this announcement after a tenant uses the inbox', async () => {
    expect((await post(2, { buildingId: 10, roomId: 101 })).status).toBe(201);
    expect((await post(2, { buildingId: 10, roomId: 102 })).status).toBe(201);
    const before = await list(2);
    expect(before.status).toBe(200);
    expect(before.body.data).toMatchObject([
      { id: 2, readCount: 0, recipientCount: 0 },
      { id: 1, readCount: 0, recipientCount: 2 },
    ]);

    const read = await request(app.getHttpServer()).post('/api/v1/me/notifications/1/read').set('Authorization', await auth(3));
    expect(read.status).toBe(201);
    expect(read.body.data.readAt).toEqual(expect.any(String));

    const after = await list(2);
    expect(after.status).toBe(200);
    expect(after.body.data).toMatchObject([
      { id: 2, readCount: 0, recipientCount: 0 },
      { id: 1, readCount: 1, recipientCount: 2 },
    ]);
  });

  it('API-02: staff pagination clamps the returned rows to the requested page and keeps the scoped total', async () => {
    for (let index = 0; index < 3; index += 1) {
      expect((await post(2, { buildingId: 10 })).status).toBe(201);
    }
    for (const [query, ids, page, limit] of [
      ['?page=2&limit=2&sort=-createdAt', [1], 2, 2],
      ['?limit=2&sort=createdAt', [1, 2], 1, 2],
      ['?page=2147483647&limit=2', [], 2147483647, 2],
    ] as const) {
      const response = await list(2, query);
      expect(response.status).toBe(200);
      expect(response.body.data.map((row: Announcement) => row.id)).toEqual(ids);
      expect(response.body.meta).toEqual({ page, limit, total: 3 });
    }
    const bad = await list(1, '?limit=101&sort=body');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('D-45: sent announcements have no edit or delete route', async () => {
    expect((await post(1, { buildingId: null })).status).toBe(201);
    const authorization = await auth(1);
    for (const method of ['patch', 'delete'] as const) {
      const response = await request(app.getHttpServer())[method](`${endpoint}/1`).set('Authorization', authorization);
      expect(response.status).toBe(404);
    }
    expect(announcements).toHaveLength(1);
  });
});
