import { ErrorCode } from './error-code.js';
import { DB_ERROR_MAP, mapDbError } from './db-errors.js';

// Pure function, no DB: fakes a minimal Prisma error shape (an outside edge, not the unit under test).
const p2002 = (target: unknown): unknown => ({ code: 'P2002', meta: { target } });
const dbMessage = (message: string): unknown => ({ code: 'P2003', message });

describe('BE-P2-01 / BE-P2-02: mapDbError, one test per row of PLAN 2.2', () => {
  it('BE-P2-01 row 1: P2002 meta.target = "users_phone_key" (string) -> PHONE_TAKEN', () => {
    expect(mapDbError(p2002('users_phone_key'))).toEqual({ code: ErrorCode.PHONE_TAKEN });
  });

  it('BE-P2-01 row 1: P2002 meta.target = ["users_phone_key"] (array form) -> PHONE_TAKEN', () => {
    expect(mapDbError(p2002(['users_phone_key']))).toEqual({ code: ErrorCode.PHONE_TAKEN });
  });

  it('ROOM-06 row 2: P2002 "rooms_building_id_code_key" -> VALIDATION_FAILED + fields.code', () => {
    expect(mapDbError(p2002('rooms_building_id_code_key'))).toEqual({
      code: ErrorCode.VALIDATION_FAILED,
      fields: { code: 'Mã phòng đã có trong tòa (kể cả phòng đã khóa)' },
    });
  });

  it('PRC-02 row 3: P2002 "room_prices_one_pending" -> CONFLICT_STATE', () => {
    expect(mapDbError(p2002('room_prices_one_pending'))).toEqual({
      code: ErrorCode.CONFLICT_STATE,
    });
  });

  it('RATE-01 row 4: P2002 "rate_plans_one_pending" -> CONFLICT_STATE', () => {
    expect(mapDbError(p2002('rate_plans_one_pending'))).toEqual({
      code: ErrorCode.CONFLICT_STATE,
    });
  });

  it('D2-15 row 5: P2002 "rate_plans_one_per_day" -> CONFLICT_STATE', () => {
    expect(mapDbError(p2002('rate_plans_one_per_day'))).toEqual({
      code: ErrorCode.CONFLICT_STATE,
    });
  });

  it('BLD-03 row 6: trigger message "MANAGER_MAX_2_BUILDINGS: ..." -> dedicated ErrorCode.MANAGER_MAX_2_BUILDINGS (spec wins, PLAN 2.2 note)', () => {
    expect(
      mapDbError(dbMessage('MANAGER_MAX_2_BUILDINGS: manager already has 2 buildings')),
    ).toEqual({ code: ErrorCode.MANAGER_MAX_2_BUILDINGS });
  });

  it('BLD-03 row 7: trigger message "BUILDING_MANAGER_ROLE: ..." -> VALIDATION_FAILED + fields.managerId (A2-1)', () => {
    expect(mapDbError(dbMessage('BUILDING_MANAGER_ROLE: not a manager'))).toEqual({
      code: ErrorCode.VALIDATION_FAILED,
      fields: { managerId: 'Người được gán phải là quản lý đang hoạt động' },
    });
  });

  it('BLD-06 row 8: CHECK violation message mentions "buildings_code_format" -> VALIDATION_FAILED + fields.code (A2-2)', () => {
    expect(
      mapDbError(
        dbMessage('new row for relation "buildings" violates check constraint "buildings_code_format"'),
      ),
    ).toEqual({
      code: ErrorCode.VALIDATION_FAILED,
      fields: { code: 'Mã tòa gồm 2–6 ký tự A–Z hoặc 0–9' },
    });
  });

  it('API-04 row 9: unrecognized DB error (P2003 FK on tenant_id) -> null (caller falls back to INTERNAL_ERROR)', () => {
    expect(mapDbError(dbMessage('Foreign key constraint failed on the field: `tenant_id`'))).toBeNull();
  });

  it('API-03: a P2002 whose target is not in the map -> null', () => {
    expect(mapDbError(p2002('some_other_unique_index'))).toBeNull();
  });

  it('API-03: non-object thrown values (null, string) -> null, never throws', () => {
    expect(mapDbError(null)).toBeNull();
    expect(mapDbError('password=SECRET123')).toBeNull();
    expect(mapDbError(undefined)).toBeNull();
  });

  it('API-03: DB_ERROR_MAP has exactly the 8 keys listed in PLAN 2.2, no more no less', () => {
    expect(Object.keys(DB_ERROR_MAP).sort()).toEqual(
      [
        'users_phone_key',
        'rooms_building_id_code_key',
        'room_prices_one_pending',
        'rate_plans_one_pending',
        'rate_plans_one_per_day',
        'MANAGER_MAX_2_BUILDINGS',
        'BUILDING_MANAGER_ROLE',
        'buildings_code_format',
      ].sort(),
    );
  });
});
