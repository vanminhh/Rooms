import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { createFakePrisma } from '../../../test/fixtures/fake-prisma.js';

describe('AUD-04 Boss audit history', () => {
  let app: INestApplication;
  let boss: string, manager: string;
  const count = vi.fn(), findMany = vi.fn();
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'test-only-audit-history');
    const db = await createFakePrisma();
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService)
      .useValue({ ...db, auditLog: { count, findMany } }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    const tokens = app.get(TokenService);
    boss = await tokens.signAccessToken({ id: 1, role: 'BOSS' });
    manager = await tokens.signAccessToken({ id: 2, role: 'MANAGER' });
  });
  afterAll(async () => { await app.close(); vi.unstubAllEnvs(); });
  const get = (query: string, token = boss) => request(app.getHttpServer()).get('/api/v1/audit-logs' + query)
    .set('Authorization', 'Bearer ' + token);

  it('rejects manager access and invalid or inverted dates', async () => {
    await get('', manager).expect(403);
    await get('?from=2026-02-30').expect(400);
    await get('?from=2026-03-02&to=2026-03-01').expect(400);
    expect(count).not.toHaveBeenCalled();
  });
  it('filters by Hanoi days, keeps exact IDs and strips nested sensitive fields', async () => {
    count.mockResolvedValue(2);
    findMany.mockResolvedValue([{ id: 9007199254740993n, actor: null, before: null,
      after: { occupants: [{ id_number: '012345678901', idNumberLast4: '8901' }], passwordHash: 'hidden',
        nested: { temporaryPassword: 'hidden', status: 'ACTIVE' } } }]);
    const res = await get('?entity=occupant&entityId=7&actorId=1&from=2026-11-25&to=2026-11-25&page=2&limit=1').expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data[0]).toEqual({ id: '9007199254740993', actor: null, before: null,
      after: { occupants: [{ idNumberLast4: '8901' }], nested: { status: 'ACTIVE' } } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 1, take: 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], where: { entity: 'occupant', entityId: 7, actorId: 1,
        createdAt: { gte: new Date('2026-11-24T17:00:00Z'), lt: new Date('2026-11-25T17:00:00Z') } } }));
  });
});
