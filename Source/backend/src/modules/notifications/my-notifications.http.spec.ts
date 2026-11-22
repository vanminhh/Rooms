import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import { TokenService } from '../auth/token.service.js';

// BE-P4-14b · NOTI-11 staff inbox, NOTI-01 tenant inbox. Only the DB is faked; guards, DTOs, controller and service are real.
describe('NOTI-11 · /me/notifications HTTP contract', () => {
  let app: INestApplication;
  let tokens: TokenService;
  const users = new Map<number, any>([1, 2, 3, 4].map((id, i) =>
    [id, { id, role: ['BOSS', 'MANAGER', 'TENANT', 'GUEST'][i], isActive: true, mustChangePassword: false }]));
  let rows: any[] = [];
  const at = (s: string) => new Date(s);
  const matches = (r: any, where: any) => r.userId === where.userId && (where.id === undefined || r.id === where.id)
    && (!('readAt' in where) || r.readAt === where.readAt);
  const fakePrisma: any = {
    user: { findUnique: vi.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    building: { findMany: vi.fn(async () => []) }, // manager scope lookup in the auth guard
    notification: {
      findMany: vi.fn(async ({ where, skip, take, select }: any) => rows.filter(r => matches(r, where))
        .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id).slice(skip, skip + take)
        .map(r => Object.fromEntries(Object.keys(select).map(k => [k, r[k]])))),
      count: vi.fn(async ({ where }: any) => rows.filter(r => matches(r, where)).length),
      findFirst: vi.fn(async ({ where }: any) => { const r = rows.find(x => matches(x, where)); return r ? { id: r.id, readAt: r.readAt } : null; }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hit = rows.filter(r => matches(r, where));
        hit.forEach(r => { r.readAt = data.readAt; });
        return { count: hit.length };
      }),
    },
  };
  fakePrisma.$transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(fakePrisma));
  const server = () => app.getHttpServer();
  const auth = async (id: number) => `Bearer ${await tokens.signAccessToken({ id, role: users.get(id).role } as any)}`;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'draft-only-test-secret-never-used-outside-this-process';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(fakePrisma)
      .overrideProvider(MailerService).useValue({ send: vi.fn() }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    tokens = moduleRef.get(TokenService);
  });
  afterAll(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });
  beforeEach(() => {
    rows = [
      { id: 1, userId: 1, kind: 'ANNOUNCEMENT', title: 'Còn 2 hóa đơn tháng chờ chỉ số', body: null, link: '/ql/chi-so', readAt: null, createdAt: at('2026-11-02T01:00:00Z') },
      { id: 2, userId: 1, kind: 'INVOICE_OVERDUE', title: 'Hóa đơn TT9 phòng P9 đã quá hạn 1 ngày', body: 'x', link: '/ql/hoa-don/9', readAt: at('2026-11-01T02:00:00Z'), createdAt: at('2026-11-01T01:00:00Z') },
      { id: 3, userId: 1, kind: 'CONTRACT_EXPIRING', title: 'Hợp đồng HD1 phòng P1 hết hạn ngày 22/12/2026', body: null, link: '/ql/hop-dong/1', readAt: null, createdAt: at('2026-11-02T01:00:00Z') },
      { id: 4, userId: 2, kind: 'CONTRACT_EXPIRING', title: 'manager row', body: null, link: null, readAt: null, createdAt: at('2026-11-02T01:00:00Z') },
      { id: 5, userId: 3, kind: 'INVOICE_OVERDUE', title: 'tenant row', body: null, link: '/thue/hoa-don/9', readAt: null, createdAt: at('2026-11-02T01:00:00Z') },
    ];
  });

  it('NOTI-11: Boss gets own rows newest first (read rows kept), unreadCount over all rows, no-store', async () => {
    const res = await request(server()).get('/api/v1/me/notifications').set('Authorization', await auth(1));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data.map((r: any) => r.id)).toEqual([3, 1, 2]);
    expect(res.body.data[2].readAt).toBe('2026-11-01T02:00:00.000Z');
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 3, unreadCount: 2 });
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['body', 'createdAt', 'id', 'kind', 'link', 'readAt', 'title']);
  });

  it('NOTI-11, SCOPE-03: a manager and a tenant see only their own rows', async () => {
    for (const [id, expected] of [[2, [4]], [3, [5]]] as const) {
      const res = await request(server()).get('/api/v1/me/notifications').set('Authorization', await auth(id));
      expect(res.body.data.map((r: any) => r.id)).toEqual(expected);
    }
  });

  it('NOTI-11: unread=true lists only unread rows; page 2 keeps the total; limit is checked (API-02)', async () => {
    const unread = await request(server()).get('/api/v1/me/notifications?unread=true').set('Authorization', await auth(1));
    expect(unread.body.data.map((r: any) => r.id)).toEqual([3, 1]);
    const page2 = await request(server()).get('/api/v1/me/notifications?page=2&limit=2').set('Authorization', await auth(1));
    expect(page2.body.data.map((r: any) => r.id)).toEqual([2]);
    expect(page2.body.meta).toMatchObject({ page: 2, limit: 2, total: 3, unreadCount: 2 });
    for (const q of ['limit=0', 'limit=101', 'page=0', 'unread=maybe']) {
      const bad = await request(server()).get(`/api/v1/me/notifications?${q}`).set('Authorization', await auth(1));
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('D-34, API-07: guests have no inbox (403); no token → 401', async () => {
    expect((await request(server()).get('/api/v1/me/notifications').set('Authorization', await auth(4))).status).toBe(403);
    expect((await request(server()).get('/api/v1/me/notifications')).status).toBe(401);
  });

  it('NOTI-11: read marks the row once and keeps it; a second read keeps the first time; another user\'s row is 404', async () => {
    const first = await request(server()).post('/api/v1/me/notifications/1/read').set('Authorization', await auth(1));
    expect(first.status).toBe(201);
    const readAt = first.body.data.readAt;
    expect(readAt).toEqual(expect.any(String));
    const again = await request(server()).post('/api/v1/me/notifications/1/read').set('Authorization', await auth(1));
    expect(again.body.data).toEqual({ id: 1, readAt });
    expect(rows).toHaveLength(5);
    for (const id of [4, 999]) {
      const res = await request(server()).post(`/api/v1/me/notifications/${id}/read`).set('Authorization', await auth(1));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
    expect(rows.find(r => r.id === 4).readAt).toBeNull();
  });

  it('NOTI-11: read-all marks only the caller\'s unread rows; a second call updates 0', async () => {
    const res = await request(server()).post('/api/v1/me/notifications/read-all').set('Authorization', await auth(1));
    expect(res.body.data).toEqual({ updated: 2 });
    expect(rows.filter(r => r.readAt === null).map(r => r.id)).toEqual([4, 5]);
    expect((await request(server()).post('/api/v1/me/notifications/read-all').set('Authorization', await auth(1))).body.data).toEqual({ updated: 0 });
  });
});
