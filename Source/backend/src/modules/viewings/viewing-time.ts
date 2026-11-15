import { BadRequestException } from '@nestjs/common';
import { addDays, HANOI_OFFSET_MS, parseDateOnly, SLOT_START_MINUTES, todayHanoi, type TimeSlot } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';

const ISO_WITH_ZONE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function viewingStart(row: { visitAt?: Date | null; visitDate: Date | null; timeSlot: string | null }): Date {
  if (row.visitAt) return row.visitAt;
  const minutes = row.timeSlot === null ? undefined : SLOT_START_MINUTES[row.timeSlot as TimeSlot];
  if (!row.visitDate || minutes === undefined) throw new Error('Viewing has no valid appointment time');
  return new Date(row.visitDate.getTime() - HANOI_OFFSET_MS + minutes * 60_000);
}

// VIEW-08: validate the instant in Hanoi, independent of the process timezone.
export function checkVisitAt(value: string, now: Date = new Date()): Date {
  const invalid = () => new BadRequestException({
    code: ErrorCode.VALIDATION_FAILED,
    fields: { visitAt: 'Giờ xem phải tròn giờ từ 8:00 đến 19:00, trong tương lai và không quá 30 ngày tới' },
  });
  const parts = ISO_WITH_ZONE.exec(value);
  if (!parts || !parseDateOnly(parts[1]) || Number(parts[2]) > 23 || /[1-9]/.test(parts[5] ?? '')) throw invalid();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= now.getTime()) throw invalid();
  const local = new Date(date.getTime() + HANOI_OFFSET_MS);
  if (local.getUTCMinutes() !== 0 || local.getUTCSeconds() !== 0 || local.getUTCMilliseconds() !== 0 ||
      local.getUTCHours() < 8 || local.getUTCHours() > 19 ||
      todayHanoi(date).getTime() > addDays(todayHanoi(now), 30).getTime()) throw invalid();
  return date;
}
