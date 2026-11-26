import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { PrismaService } from './common/prisma/prisma.service.js';

const query = vi.fn();
let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({ $queryRaw: query })
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
});

afterAll(async () => { await app?.close(); });

it('DEP-10: an anonymous health check returns 200 after a successful database probe', async () => {
  query.mockResolvedValueOnce([{ value: 1 }]);
  await request(app.getHttpServer()).get('/api/v1/health')
    .expect('Cache-Control', 'no-store').expect(200, { status: 'ok' });
  expect(query).toHaveBeenLastCalledWith(['SELECT 1']);
});

it('DEP-10: a failed database probe returns an uncached 503 without database details', async () => {
  query.mockRejectedValueOnce(new Error('private database details'));
  await request(app.getHttpServer()).get('/api/v1/health')
    .expect('Cache-Control', 'no-store').expect(503, { status: 'unavailable' });
});
