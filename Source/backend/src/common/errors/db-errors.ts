import { ErrorCode } from './error-code.js';

export interface DbErrorMapping {
  code: ErrorCode;
  fields?: Record<string, string>;
}

// The service supplies the table context when Prisma reports a column instead of an index name.
export function isUniqueOn(error: unknown, ...names: string[]): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
  if (code !== 'P2002') return false;
  const targets: unknown[] = Array.isArray(meta?.target) ? meta.target : [meta?.target];
  return targets.length === 1 && names.some(name => name === targets[0]);
}

// Keys: constraint, index and trigger names from prisma/constraints.sql and the init migration.
// Trigger messages start with the key ("MANAGER_MAX_2_BUILDINGS: ..."). The [ASSUMPTION] wordings are from the plan.
export const DB_ERROR_MAP: Record<string, DbErrorMapping> = {
  INVOICE_NOT_UNPAID: { code: ErrorCode.INVOICE_NOT_UNPAID },
  PAYMENT_AMOUNT_MISMATCH: { code: ErrorCode.PAYMENT_AMOUNT_MISMATCH },
  users_phone_key: { code: ErrorCode.PHONE_TAKEN },
  users_email_key: { code: ErrorCode.EMAIL_TAKEN },
  vehicles_plate_active: { code: ErrorCode.VALIDATION_FAILED, fields: { plate: 'Biển số đang được đăng ký gửi xe' } },
  viewings_one_open_per_user_room: { code: ErrorCode.CONFLICT_STATE },
  meter_readings_contract_opening_key: { code: ErrorCode.CONFLICT_STATE },
  meter_readings_contract_daily_key: { code: ErrorCode.CONFLICT_STATE },
  meter_readings_room_daily_unassigned_key: { code: ErrorCode.CONFLICT_STATE },
  meter_readings_opening_contract: { code: ErrorCode.CONFLICT_STATE },
  rooms_building_id_code_key: {
    code: ErrorCode.VALIDATION_FAILED,
    fields: { code: 'Mã phòng đã có trong tòa (kể cả phòng đã khóa)' },
  },
  room_prices_one_pending: { code: ErrorCode.CONFLICT_STATE },
  rate_plans_one_pending: { code: ErrorCode.CONFLICT_STATE },
  rate_plans_one_per_day: { code: ErrorCode.CONFLICT_STATE },
  invoices_one_per_period: { code: ErrorCode.CONFLICT_STATE }, // BIL-21 racing the BIL-05 job
  MANAGER_MAX_2_BUILDINGS: { code: ErrorCode.MANAGER_MAX_2_BUILDINGS },
  BUILDING_MANAGER_ROLE: {
    code: ErrorCode.VALIDATION_FAILED,
    fields: { managerId: 'Người được gán phải là quản lý đang hoạt động' }, // [ASSUMPTION A2-1]
  },
  buildings_code_format: {
    code: ErrorCode.VALIDATION_FAILED,
    fields: { code: 'Mã tòa gồm 2–6 ký tự A–Z hoặc 0–9' }, // [ASSUMPTION A2-2]
  },
};

// Returns null for unknown errors; the caller then answers INTERNAL_ERROR. The raw DB message is never returned.
export function mapDbError(e: unknown): DbErrorMapping | null {
  if (typeof e !== 'object' || e === null) return null;
  const { code, meta, message } = e as {
    code?: unknown;
    meta?: { target?: unknown };
    message?: unknown;
  };
  if (code === 'P2002') {
    // Prisma puts the violated index name in meta.target (a string, or an array on some versions).
    const target = meta?.target;
    const targets: unknown[] = Array.isArray(target) ? target : [target];
    const meterColumns = targets.map(value => {
      if (value === 'roomId') return 'room_id';
      if (value === 'contractId') return 'contract_id';
      if (value === 'readOn') return 'read_on';
      return value;
    });
    if (meterColumns.every(value => typeof value === 'string') && [
      'contract_id,kind', 'contract_id,kind,read_on,room_id', 'kind,read_on,room_id',
    ].includes((meterColumns as string[]).sort().join(','))) {
      return { code: ErrorCode.CONFLICT_STATE };
    }
    if (targets.length === 2 &&
        ((targets.includes('user_id') && targets.includes('room_id')) ||
         (targets.includes('userId') && targets.includes('roomId')))) {
      return { code: ErrorCode.CONFLICT_STATE };
    }
    const hit = targets.find(
      (t): t is string => typeof t === 'string' && Object.hasOwn(DB_ERROR_MAP, t),
    );
    if (hit) return DB_ERROR_MAP[hit];
  }
  if (typeof message !== 'string') return null;
  const name = Object.keys(DB_ERROR_MAP).find((k) => message.includes(k));
  return name ? DB_ERROR_MAP[name] : null;
}
