import { Controller, Get, INestApplication, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../app.setup.js';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  PaginationQuery,
  pageParams,
  paginated,
} from './pagination.js';

describe('BE-P2-03: pageParams / paginated, pure-function scenarios of PLAN 2.3', () => {
  it('BE-P2-03: DEFAULT_LIMIT is 20 and MAX_LIMIT is 100', () => {
    expect(DEFAULT_LIMIT).toBe(20);
    expect(MAX_LIMIT).toBe(100);
  });

  it('BE-P2-03 scenario 7: no page/limit -> defaults page 1, limit 20', () => {
    expect(pageParams({})).toEqual({ page: 1, limit: 20, skip: 0, take: 20 });
  });

  it('BE-P2-03 scenario 11: page=2, limit=25 -> skip 25, take 25', () => {
    expect(pageParams({ page: 2, limit: 25 })).toEqual({ page: 2, limit: 25, skip: 25, take: 25 });
  });

  it('BE-P2-03: paginated() builds the ListMeta from page/limit/total', () => {
    expect(paginated([{ id: 1 }], 2, 20, 41)).toEqual({
      data: [{ id: 1 }],
      meta: { page: 2, limit: 20, total: 41 },
    });
  });
});

// A test controller mounted on a real Nest HTTP app (real ValidationPipe with transform:true,
// real filter, real interceptor) — the only way to prove @Type(() => Number) + class-validator
// actually reject bad query strings end to end, which a call to pageParams() alone cannot show.
@Controller('t')
class PaginationTestController {
  @Get('list')
  list(@Query() q: PaginationQuery) {
    return { query: q, params: pageParams(q) };
  }
}

describe('BE-P2-03 / API-02 / API-04: PaginationQuery validated by the real app pipeline (A2-9: transform: true)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaginationTestController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('BE-P2-03 scenario 7: no query string -> page 1, limit 20 through the real DTO', async () => {
    const res = await http().get('/api/v1/t/list');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { query: {}, params: { page: 1, limit: 20, skip: 0, take: 20 } },
    });
  });

  it('BE-P2-03 scenario 9: limit=1 (lower boundary) is valid', async () => {
    const res = await http().get('/api/v1/t/list?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.data.params).toEqual({ page: 1, limit: 1, skip: 0, take: 1 });
  });

  it('BE-P2-03 scenario 9: limit=100 (upper boundary) is valid', async () => {
    const res = await http().get('/api/v1/t/list?limit=100');
    expect(res.status).toBe(200);
    expect(res.body.data.params.limit).toBe(100);
  });

  it('BE-P2-03 scenario 11: ?page=2&limit=25 -> transform:true turns query strings into numbers', async () => {
    const res = await http().get('/api/v1/t/list?page=2&limit=25');
    expect(res.status).toBe(200);
    expect(res.body.data.query).toEqual({ page: 2, limit: 25 });
    expect(res.body.data.params).toEqual({ page: 2, limit: 25, skip: 25, take: 25 });
  });

  it.each(['0', '-1', 'abc'])(
    'BE-P2-03 scenario 8: ?page=%s -> 400 VALIDATION_FAILED + fields.page',
    async (value) => {
      const res = await http().get(`/api/v1/t/list?page=${value}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.fields.page).toBe('Trang không hợp lệ');
    },
  );

  it.each(['0', '101'])(
    'BE-P2-03 scenario 10: ?limit=%s -> 400 VALIDATION_FAILED + fields.limit',
    async (value) => {
      const res = await http().get(`/api/v1/t/list?limit=${value}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.fields.limit).toBe('Số dòng mỗi trang phải từ 1 đến 100');
    },
  );

  it('BE-P2-03 scenario 12: ?page=1.5 -> 400 VALIDATION_FAILED (@IsInt rejects a non-integer)', async () => {
    const res = await http().get('/api/v1/t/list?page=1.5');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.page).toBe('Trang không hợp lệ');
  });
});
