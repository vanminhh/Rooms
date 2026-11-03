import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { UpdateBuildingDto } from '../../../src/modules/buildings/dto/buildings.dto.js';
import { assertBuildingPatchFields as mainAssertBuildingPatchFields } from '../../../src/modules/buildings/building-write.guard.js';
import { assertBuildingPatchFields } from '../src/modules/buildings/building-write.guard.js';

const manager = { role: 'MANAGER' } as const;

describe('BLD-02: manager PATCH fields after DTO transformation', () => {
  it('accepts amenities and description even when optional DTO fields exist as undefined', () => {
    const dto = plainToInstance(UpdateBuildingDto, {
      amenities: ['Thang máy', 'Camera'],
      description: 'Tòa do quản lý cập nhật',
    });
    expect(Object.keys(dto)).toContain('address');
    expect(() => mainAssertBuildingPatchFields(manager, dto)).toThrow();
    expect(() => assertBuildingPatchFields(manager, dto)).not.toThrow();
  });

  it('rejects a supplied forbidden field', () => {
    expect(() => assertBuildingPatchFields(manager, { address: 'Địa chỉ mới' })).toThrow();
  });
});
