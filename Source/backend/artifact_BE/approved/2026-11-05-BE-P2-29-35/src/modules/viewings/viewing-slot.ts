import { BadRequestException } from '@nestjs/common';
import { addDays, compareDates, hasSlotStarted, parseDateOnly, todayHanoi, type TimeSlot } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';

const VISIT_DATE_MSG = 'Ngày xem phải từ hôm nay đến 30 ngày tới';
const SLOT_STARTED_MSG = 'Khung giờ này hôm nay đã bắt đầu, vui lòng chọn khung giờ khác';

const badSlot = (fields: Record<string, string>) =>
  new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields });

// VIEW-08: visitDate from today to today + 30 (Asia/Ho_Chi_Minh); a slot already started today is refused.
// Returns the parsed date; otherwise throws VALIDATION_FAILED with fields.visitDate or fields.timeSlot.
export function checkVisitSlot(visitDate: string, timeSlot: TimeSlot, now: Date = new Date()): Date {
  const today = todayHanoi(now);
  const date = parseDateOnly(visitDate);
  if (!date || compareDates(date, today) < 0 || compareDates(date, addDays(today, 30)) > 0) {
    throw badSlot({ visitDate: VISIT_DATE_MSG });
  }
  if (hasSlotStarted(date, timeSlot, now)) throw badSlot({ timeSlot: SLOT_STARTED_MSG });
  return date;
}
