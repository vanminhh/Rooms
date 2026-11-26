import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { viewingPrisma, NOW, HOUR } from '../../../test/fixtures/viewing-prisma.js';

describe('BE-EX-20/21 public route removal and availability', () => {
  let app: INestApplication, token: string;
  const db = viewingPrisma();
  const range = '?from=2026-11-16&to=2026-11-16';
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'viewing-public-test-only-0123456789abcdef');
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db.prisma).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
    token = `Bearer ${await module.get(TokenService).signAccessToken({ id: 4 } as any)}`;
  });
  afterAll(async () => { await app?.close(); vi.useRealTimers(); vi.unstubAllEnvs(); });
  beforeEach(() => db.rows.splice(0));

  it('DEP-06/PUB-05: only GET of a public resource receives the shared 60-second TTL', async () => {
    const api = request(app.getHttpServer());
    const path = '/api/v1/public/filters';
    await api.get(path).expect(200).expect('Cache-Control', 'public, max-age=0, s-maxage=60')
      .expect('Vary', /Accept-Language/i);
    await api.head(path).expect(200).expect('Cache-Control', 'no-store');
    await api.get('/api/v1/me/viewings').expect(401).expect('Cache-Control', 'no-store');
  });

  it('VIEW-01/11/12: old POST /public/viewings is 404, regardless of authentication', async () => {
    for (const auth of ['', token]) await request(app.getHttpServer()).post('/api/v1/public/viewings').set('Authorization', auth).send({}).expect('Cache-Control', 'no-store').expect(404);
  });
  it('PUB-05/DEP-06/VIEW-21: public cache stays anonymous and identical with an account token; private is no-store', async () => {
    for (const phone of ['0900000004', '0911111111', '0922222222']) db.add({ guestPhone: phone });
    const anonymous = await request(app.getHttpServer()).get(`/api/v1/public/rooms/102/viewing-times${range}`).expect(200);
    const signedIn = await request(app.getHttpServer()).get(`/api/v1/public/rooms/102/viewing-times${range}`).set('Authorization', token).expect(200);
    expect(signedIn.body).toEqual(anonymous.body);
    expect(anonymous.headers['cache-control']).toBe('public, max-age=0, s-maxage=60');
    expect(anonymous.body.data[0].hours).not.toContain(HOUR);
    const own = await request(app.getHttpServer()).get(`/api/v1/me/rooms/102/viewing-times${range}`).set('Authorization', token).expect(200);
    expect(own.headers['cache-control']).toBe('no-store'); expect(own.body.data[0].hours).toContain(HOUR);
    expect(Object.keys(own.body.data[0]).sort()).toEqual(['date', 'hours']);
  });
  it.each(['guestPhone', 'phone', 'userId', 'accountId'])('VIEW-21: both routes refuse identity override %s', async key => {
    for (const prefix of ['public', 'me']) await request(app.getHttpServer()).get(`/api/v1/${prefix}/rooms/101/viewing-times${range}&${key}=0900000004`).set('Authorization', token).expect(400);
  });
  it.each(['?from=2026-11-16', '?from=2026-02-30&to=2026-03-01', '?from=2026-11-17&to=2026-11-16', '?from=2026-11-15&to=2026-12-16'])('VIEW-21: invalid range %s is 400', async query => {
    await request(app.getHttpServer()).get(`/api/v1/public/rooms/101/viewing-times${query}`).expect('Cache-Control', 'no-store').expect(400);
  });
});
