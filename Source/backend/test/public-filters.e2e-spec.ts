// BE-EX-15 · e2e on the DEV database, read only: the PUB-06 filters run on real Postgres (including the jsonb
// `array_contains` for amenities, which the in-memory specs cannot prove). Creates and changes nothing.
// Excluded from `npm run test` (name ends in `-spec.ts`).
import { existsSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

if (existsSync('.env')) process.loadEnvFile('.env');
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 }); // remote dev DB, ~0.8 s per query

let app: INestApplication;
const get = (query: string) => request(app.getHttpServer()).get(`/api/v1/public/rooms${query}`);

describe('BE-EX-15: /public/rooms filters on the real database (e2e, read only)', () => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('PUB-06: every filter alone and all together run without a server error and report a numeric meta.total', async () => {
    for (const query of [
      '?minArea=10', '?maxArea=100', '?minOccupants=1', '?floor=1', '?amenities=ELEVATOR', '?amenities=ELEVATOR,PARKING',
      '?balcony=true', '?window=true', '?pets=true', '?roomType=STUDIO', '?sort=newest&balcony=true',
      '?minArea=10&maxArea=100&minOccupants=1&floor=1&amenities=ELEVATOR&balcony=true&window=true&pets=true&roomType=STUDIO',
    ]) {
      const res = await get(query);
      expect(res.status, query).toBe(200);
      expect(typeof res.body.meta.total, query).toBe('number');
    }
  });

  it('PUB-06: every returned room matches the filter that was asked (no false positives, "chưa nhập" never matches)', async () => {
    const balcony = (await get('?balcony=true&limit=100')).body.data as { hasBalcony: boolean | null }[];
    for (const item of balcony) expect(item.hasBalcony).toBe(true);
    const types = (await get('?roomType=LOFT&limit=100')).body.data as { roomType: string | null }[];
    for (const item of types) expect(item.roomType).toBe('LOFT');
    const wanted = (await get('?amenities=ELEVATOR,PARKING&limit=100')).body.data as { buildingAmenities: string[] }[];
    for (const item of wanted) expect(item.buildingAmenities).toEqual(expect.arrayContaining(['ELEVATOR', 'PARKING']));
    const areas = (await get('?minArea=20&maxArea=30&limit=100')).body.data as { areaM2: number }[];
    for (const item of areas) {
      expect(item.areaM2).toBeGreaterThanOrEqual(20);
      expect(item.areaM2).toBeLessThanOrEqual(30);
    }
  });

  it('PUB-06: an unknown amenity code or room type is a 400 VALIDATION_FAILED, and /public/filters answers', async () => {
    const bad = await get('?amenities=SAUNA');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    expect((await get('?roomType=DUPLEX')).status).toBe(400);
    const filters = await request(app.getHttpServer()).get('/api/v1/public/filters');
    expect(filters.status).toBe(200);
    expect(filters.body.data.amenities).toHaveLength(8);
    expect(filters.body.data.roomTypes).toHaveLength(4);
  });
});
