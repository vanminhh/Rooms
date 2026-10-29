import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

// Real AppModule (PrismaService is built but never connects). The tests run with
// dummy DATABASE_URL / DIRECT_URL values, so no database is touched.
describe('API-01..04: AppModule + configureApp (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('API-01 / API-03: GET /api/v1/khong-co -> 404 NOT_FOUND error body', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/khong-co');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' },
    });
  });

  it('API-01: the old Hello World route GET / is gone (404 NOT_FOUND)', async () => {
    const res = await request(app.getHttpServer()).get('/');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' },
    });
  });

  it.each(['/api', '/api/v1x', '/healthz'])(
    'API-01 / API-03 (D6): GET %s on the real AppModule -> 404 NOT_FOUND JSON, no HTML',
    async (path) => {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' },
      });
      expect(res.text).not.toMatch(/<html|Cannot GET/i);
    },
  );

  it('API-01 / API-03 (D6): POST / on the real AppModule -> 404 NOT_FOUND JSON', async () => {
    const res = await request(app.getHttpServer()).post('/').send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' },
    });
  });

  it('API-03 / API-04 (D8): a JSON body over 100 kB on the real AppModule -> 400 VALIDATION_FAILED (413 mapped), not 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/khong-co')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ pad: 'a'.repeat(110_000) }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Dữ liệu không hợp lệ' },
    });
    expect(res.text).not.toMatch(/too large|INTERNAL_ERROR/i);
  });

  it('BE-LOGIN-05 / BE-LOGIN-07: the app boots without a DB and closes cleanly ($disconnect on a never-connected client)', async () => {
    await expect(app.close()).resolves.toBeUndefined();
  });
});
