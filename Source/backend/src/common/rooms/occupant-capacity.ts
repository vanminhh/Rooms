import { BadRequestException, ConflictException } from '@nestjs/common';
import { ErrorCode } from '../errors/error-code.js';

const DAY_MS = 86_400_000;
const INT_MAX = 2_147_483_647;

export interface OccupantStay {
  moveInDate: Date;
  moveOutDate: Date | null;
}

export interface OccupantCapacityDb {
  occupant: {
    findMany(args: {
      where: { contract: { roomId: number; status: { in: ('HOLD' | 'ACTIVE')[] } } };
      select: { moveInDate: true; moveOutDate: true };
    }): Promise<OccupantStay[]>;
  };
}

function invalidDates(): BadRequestException {
  return new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: {
    moveInDate: 'Khoảng ngày ở không hợp lệ',
  } });
}

function dateValue(value: Date): number {
  if (!(value instanceof Date)) throw invalidDates();
  const result = value.getTime();
  // Business dates are UTC midnight, not instants in the caller's local timezone.
  if (!Number.isFinite(result) || result % DAY_MS !== 0) throw invalidDates();
  return result;
}

function rangeValues(from?: Date, to?: Date | null): [number, number] {
  const lower = from === undefined ? Number.NEGATIVE_INFINITY : dateValue(from);
  const upper = to === undefined || to === null ? Number.POSITIVE_INFINITY : dateValue(to);
  if (lower > upper) throw invalidDates();
  return [lower, upper];
}

// CON-13 / DB-B6: departure day is included. Optional bounds restrict the days
// being checked; they do not change or infer an occupant's actual stay dates.
export function peakOccupants(stays: readonly OccupantStay[], from?: Date, to?: Date | null): number {
  const [rangeFrom, rangeTo] = rangeValues(from, to);
  const events = new Map<number, number>();
  const event = (time: number, delta: number) => events.set(time, (events.get(time) ?? 0) + delta);
  for (const stay of stays) {
    const start = dateValue(stay.moveInDate);
    const end = stay.moveOutDate === null ? Number.POSITIVE_INFINITY : dateValue(stay.moveOutDate);
    if (start > end) throw invalidDates();
    const lower = Math.max(start, rangeFrom);
    const upper = Math.min(end, rangeTo);
    if (lower > upper) continue;
    event(lower, 1);
    // Numeric boundaries avoid constructing an out-of-range Date after the last
    // supported day (including 9999-12-31); open-ended stays have no exit event.
    if (Number.isFinite(upper)) event(upper + DAY_MS, -1);
  }
  let count = 0;
  let peak = 0;
  for (const [, delta] of [...events.entries()].sort(([left], [right]) => left - right)) {
    count += delta;
    peak = Math.max(peak, count);
  }
  return peak;
}

// Callers hold the room lock and authorize the actor. Include planned HOLD stays
// so adding occupants or lowering a room limit cannot overbook a future date.
export async function assertOccupantCapacity(
  db: OccupantCapacityDb, roomId: number, maxOccupants: number, from?: Date, to?: Date | null,
): Promise<void> {
  if (!Number.isInteger(roomId) || roomId < 1 || roomId > INT_MAX ||
      !Number.isInteger(maxOccupants) || maxOccupants < 1 || maxOccupants > INT_MAX) {
    throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED });
  }
  rangeValues(from, to);
  const stays = await db.occupant.findMany({
    where: { contract: { roomId, status: { in: ['HOLD', 'ACTIVE'] } } },
    select: { moveInDate: true, moveOutDate: true },
  });
  if (peakOccupants(stays, from, to) > maxOccupants) {
    throw new ConflictException({ code: ErrorCode.CONFLICT_STATE, fields: {
      maxOccupants: 'Số người ở vượt quá giới hạn của phòng trong khoảng ngày đã chọn',
    } });
  }
}
