import { ErrorCode } from './error-code.js';

export interface DbErrorMapping {
  code: ErrorCode;
  fields?: Record<string, string>;
}

// Keys: constraint, index and trigger names from prisma/constraints.sql and the init migration.
// Trigger messages start with the key ("MANAGER_MAX_2_BUILDINGS: ..."). The [ASSUMPTION] wordings are from the plan.
export const DB_ERROR_MAP: Record<string, DbErrorMapping> = {
  users_phone_key: { code: ErrorCode.PHONE_TAKEN },
  rooms_building_id_code_key: {
    code: ErrorCode.VALIDATION_FAILED,
    fields: { code: 'Mã phòng đã có trong tòa (kể cả phòng đã khóa)' },
  },
  room_prices_one_pending: { code: ErrorCode.CONFLICT_STATE },
  rate_plans_one_pending: { code: ErrorCode.CONFLICT_STATE },
  rate_plans_one_per_day: { code: ErrorCode.CONFLICT_STATE },
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
    const hit = targets.find(
      (t): t is string => typeof t === 'string' && Object.hasOwn(DB_ERROR_MAP, t),
    );
    if (hit) return DB_ERROR_MAP[hit];
  }
  if (typeof message !== 'string') return null;
  const name = Object.keys(DB_ERROR_MAP).find((k) => message.includes(k));
  return name ? DB_ERROR_MAP[name] : null;
}
