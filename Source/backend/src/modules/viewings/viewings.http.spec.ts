import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { configureApp } from '../../app.setup.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TokenService } from '../auth/token.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import { viewingPrisma, NOW, HOUR } from '../../../test/fixtures/viewing-prisma.js';

describe('BE-EX-19..23 /me and staff HTTP contract', () => {
  let app: INestApplication, tokens: TokenService;
  const db = viewingPrisma();
  beforeAll(async () => {
    vi.stubEnv('JWT_SECRET', 'viewing-http-test-only-0123456789abcdef');
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW);
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db.prisma)
      .overrideProvider(MailerService).useValue({ send: vi.fn(async () => {}) }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init(); tokens = module.get(TokenService);
  });
  afterAll(async () => { await app?.close(); vi.useRealTimers(); vi.unstubAllEnvs(); });
  beforeEach(() => { db.rows.splice(0); db.prisma.viewing.create.mockClear(); });
  async function auth(id: number) { return `Bearer ${await tokens.signAccessToken({ id } as any)}`; }
  const body = { roomId: 101, visitAt: HOUR };

  it.each(['/me/viewings', '/me/viewings/1', '/me/rooms/101/viewing-times?from=2026-11-16&to=2026-11-16'])('SCOPE-01: GET %s requires authentication', async path => {
    await request(app.getHttpServer()).get(`/api/v1${path}`).expect(401);
  });
  it.each([1, 2])('SCOPE-03: staff %s cannot access guest routes', async id => {
    const token = await auth(id);
    await request(app.getHttpServer()).post('/api/v1/me/viewings').set('Authorization', token).send(body).expect(403);
    await request(app.getHttpServer()).get('/api/v1/me/viewings').set('Authorization', token).expect(403);
  });
  it.each([4, 5])('VIEW-01: guest/tenant %s can book and get no-store owned data', async id => {
    const token = await auth(id);
    const created = await request(app.getHttpServer()).post('/api/v1/me/viewings').set('Authorization', token).send(body).expect(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const read = await request(app.getHttpServer()).get(`/api/v1/me/viewings/${created.body.data.id}`).set('Authorization', token).expect(200);
    expect(read.headers['cache-control']).toBe('no-store'); expect(read.body.data.status).toBe('NEW');
    expect(read.body.data).not.toHaveProperty('handledById');
  });
  it.each(['guestPhone', 'guestName', 'userId', 'status', 'website', 'visitDate', 'timeSlot'])('VIEW-01/12: account booking rejects caller override %s', async key => {
    const response = await request(app.getHttpServer()).post('/api/v1/me/viewings').set('Authorization', await auth(4)).send({ ...body, [key]: 'override' }).expect(400);
    expect(response.body.error.fields[key]).toBeTruthy(); expect(db.prisma.viewing.create).not.toHaveBeenCalled();
  });
  it.each([null, '', '2026-11-16T03:30:00Z', '2026-11-16T03:00:00', '2026-02-30T03:00:00Z'])('VIEW-08/LOC-02: invalid visitAt %s has an English field error', async visitAt => {
    const response = await request(app.getHttpServer()).post('/api/v1/me/viewings').set('Authorization', await auth(4)).set('Accept-Language', 'en').send({ ...body, visitAt }).expect(400);
    expect(response.body.error.fields.visitAt).toBeTruthy(); expect(response.body.error.fields.visitAt).not.toMatch(/[\u0080-\uffff]/);
  });
  it('VIEW-20: another owner and a matching manual phone both return 404', async () => {
    const row = db.add({ userId: 5, guestPhone: '0900000004' });
    const manual = db.add({ guestPhone: '0900000004' });
    for (const id of [row.id, manual.id]) {
      await request(app.getHttpServer()).get(`/api/v1/me/viewings/${id}`).set('Authorization', await auth(4)).expect(404);
      await request(app.getHttpServer()).post(`/api/v1/me/viewings/${id}/cancel`).set('Authorization', await auth(4)).expect(404);
    }
  });
  it('VIEW-18: cancellation response no-store and clears old handler', async () => {
    const row = db.add({ userId: 4, status: 'CONFIRMED', handledById: 2 });
    const response = await request(app.getHttpServer()).post(`/api/v1/me/viewings/${row.id}/cancel`).set('Authorization', await auth(4)).expect(201);
    expect(response.headers['cache-control']).toBe('no-store'); expect(row.handledById).toBeNull();
  });
  it.each(['get', 'post', 'patch'] as const)('SCOPE-02: %s staff viewings refuses a guest', async method => {
    const path = method === 'patch' ? '/viewings/1' : '/viewings';
    await request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', await auth(4)).send(body).expect(403);
  });
  it('VIEW-03/15: manual creation, PHONE confirmation; PATCH cannot bypass confirmation or set WON', async () => {
    const token = await auth(2);
    const created = await request(app.getHttpServer()).post('/api/v1/viewings').set('Authorization', token).send({ ...body, guestName: 'Khách', guestPhone: '0911111111' }).expect(201);
    const id = created.body.data.id;
    await request(app.getHttpServer()).patch(`/api/v1/viewings/${id}`).set('Authorization', token).send({ status: 'CONFIRMED' }).expect(409);
    await request(app.getHttpServer()).post(`/api/v1/viewings/${id}/confirm`).set('Authorization', token).send({ via: 'PHONE' }).expect(201);
    await request(app.getHttpServer()).patch(`/api/v1/viewings/${id}`).set('Authorization', token).send({ status: 'WON' }).expect(409);
  });
  it('VIEW-04/LOC-01: staff cancellation requires Vietnamese note error even with English header', async () => {
    const row = db.add();
    const response = await request(app.getHttpServer()).patch(`/api/v1/viewings/${row.id}`).set('Authorization', await auth(1)).set('Accept-Language', 'en').send({ status: 'CANCELLED' }).expect(400);
    expect(response.body.error.fields.note).toBe('Cần ghi chú khi hủy lịch hẹn');
  });
  it.each(['0', '-1', 'abc', '2147483648'])('API-03: invalid id %s rejected before reading DB', async id => {
    await request(app.getHttpServer()).get(`/api/v1/me/viewings/${id}`).set('Authorization', await auth(4)).expect(400);
  });
});
