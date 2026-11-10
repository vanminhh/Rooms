import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { WaterMode } from '@prisma/client';
import {
  BuildingIdParamsDto,
  BuildingsQueryDto,
  CreateBuildingDto,
  UpdateBuildingDto,
} from './buildings.dto.js';

async function errorsFor<T extends object>(type: new () => T, value: object): Promise<string[]> {
  const instance = plainToInstance(type, value);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return errors.flatMap((error) => [
    ...(error.constraints ? Object.values(error.constraints) : []),
    ...Object.values(error.children ?? {}).flatMap((child) =>
      child.constraints ? Object.values(child.constraints) : [],
    ),
  ]);
}

const validCreate = {
  code: 'AB', name: 'Tòa', address: '1 phố', district: 'Ba Đình', ward: 'Phúc Xá',
  waterMode: WaterMode.PER_M3,
};

describe('building DTO validation', () => {
  it.each([
    ['ab', 'AB'],
    ['a1b2c3', 'A1B2C3'],
  ])('BLD-06: normalizes valid code %s to %s', async (code, expected) => {
    const dto = plainToInstance(CreateBuildingDto, { ...validCreate, code });
    expect(dto.code).toBe(expected);
    expect(await errorsFor(CreateBuildingDto, { ...validCreate, code })).toEqual([]);
  });

  it.each(['A', 'ABCDEFG', 'AB 1', 'A-1', 'éA', ''])('BLD-06: rejects invalid code %s at code field', async (code) => {
    const errors = await validate(plainToInstance(CreateBuildingDto, { ...validCreate, code }));
    expect(errors.map(({ property }) => property)).toContain('code');
  });

  it.each([1, 31])('BLD-01: accepts dueDays boundary %i', async (dueDays) => {
    expect(await errorsFor(CreateBuildingDto, { ...validCreate, dueDays })).toEqual([]);
  });

  it.each([0, 32, 1.5, null, '5'])('BLD-01: rejects dueDays %s', async (dueDays) => {
    expect((await validate(plainToInstance(CreateBuildingDto, { ...validCreate, dueDays })))
      .map(({ property }) => property)).toContain('dueDays');
  });

  it('BLD-01: enforces name, address, district and ward maximum lengths at their boundaries', async () => {
    expect(await errorsFor(CreateBuildingDto, {
      ...validCreate, name: 'N'.repeat(100), address: 'A'.repeat(255),
      district: 'D'.repeat(50), ward: 'W'.repeat(50),
    })).toEqual([]);
    for (const [field, limit] of [['name', 100], ['address', 255], ['district', 50], ['ward', 50]] as const) {
      const errors = await validate(plainToInstance(CreateBuildingDto, { ...validCreate, [field]: 'X'.repeat(limit + 1) }));
      expect(errors.map(({ property }) => property), `${field} over limit`).toContain(field);
    }
  });

  it('BLD-02: accepts empty/string amenities and nullable description', async () => {
    expect(await errorsFor(UpdateBuildingDto, { amenities: [], description: null })).toEqual([]);
    expect(await errorsFor(UpdateBuildingDto, { amenities: ['Thang máy', 'Wifi'], description: 'Mô tả' })).toEqual([]);
  });

  it.each([{ amenities: null }, { amenities: {} }, { amenities: ['Wifi', 1] }])('BLD-02: rejects malformed amenities %#', async (patch) => {
    expect((await validate(plainToInstance(UpdateBuildingDto, patch))).map(({ property }) => property)).toContain('amenities');
  });

  it.each([
    { page: '0' }, { limit: '0' }, { limit: '101' }, { buildingId: '0' },
    { buildingId: '1.5' }, { sort: 'random' }, { includeInactive: 'yes' },
  ])('API-02/API-08/BLD-07: rejects invalid list query %#', async (query) => {
    expect(await errorsFor(BuildingsQueryDto, query)).not.toEqual([]);
  });

  it('API-02/API-08/BLD-07: transforms valid boundary query values without changing false to true', async () => {
    const dto = plainToInstance(BuildingsQueryDto, { page: '1', limit: '100', buildingId: '1', includeInactive: 'false' });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ page: 1, limit: 100, buildingId: 1, includeInactive: false });
  });

  it('BLD-02: rejects unknown manager-edit DTO properties when whitelist validation is enabled', async () => {
    const errors = await validate(plainToInstance(UpdateBuildingDto, { amenities: [], injected: true }), {
      whitelist: true, forbidNonWhitelisted: true,
    });
    expect(errors.map(({ property }) => property)).toContain('injected');
  });

  it.each(['0', '2147483648', '1.2'])('API-03/API-04: rejects building id outside positive int32: %s', async (id) => {
    expect((await validate(plainToInstance(BuildingIdParamsDto, { id }))).map(({ property }) => property)).toContain('id');
  });
});
