import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.js';
import { assertBuildingPatchFields } from './building-write.guard.js';

describe('building write field authorization', () => {
  it.each(['code', 'address', 'managerId', 'manager_id', 'waterMode', 'isActive', 'unknown'])('BLD-02: rejects manager field %s before validation', (field) => {
    expect(() => assertBuildingPatchFields({ role: 'MANAGER' } as never, { [field]: null })).toThrow(ForbiddenException);
    try {
      assertBuildingPatchFields({ role: 'MANAGER' } as never, { [field]: null });
    } catch (error) {
      // This unit exercises the guard before HTTP exception filtering; Nest's raw ForbiddenException
      // carries the API error code as its message. The AllExceptionsFilter builds the API-03 envelope.
      expect(error).toMatchObject({ response: { message: ErrorCode.FORBIDDEN } });
    }
  });

  it('BLD-02: allows manager amenities and description, including empty and null values', () => {
    expect(() => assertBuildingPatchFields({ role: 'MANAGER' } as never, { amenities: [], description: null })).not.toThrow();
  });

  it.each(['BOSS', 'TENANT'])('BLD-02: manager field allowlist does not apply to role %s', (role) => {
    expect(() => assertBuildingPatchFields({ role } as never, { code: 'AB', unknown: true })).not.toThrow();
  });

  it('BLD-02: treats non-object and null request bodies as having no forbidden fields', () => {
    expect(() => assertBuildingPatchFields({ role: 'MANAGER' } as never, null)).not.toThrow();
    expect(() => assertBuildingPatchFields({ role: 'MANAGER' } as never, ['amenities'])).not.toThrow();
  });
});
