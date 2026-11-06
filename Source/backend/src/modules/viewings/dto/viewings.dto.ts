import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination.js';
import type { TimeSlot } from '../../../common/date/today.js';
import type { ViewingStatus } from '../viewings.types.js';

const INT32_MAX = 2147483647; // rooms.id, viewings.id are Postgres integers
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/; // calendar validity (2026-02-30) is checked in the service
const TIME_SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
const VIEWING_STATUSES = ['NEW', 'CONFIRMED', 'WON', 'LOST', 'CANCELLED'] as const;
// Columns visit_date and time_slot are NOT NULL: null is refused, not skipped as optional.
const WHEN_SENT = (_dto: object, value: unknown) => value !== undefined;

// Fields shared by the guest form (VIEW-01) and the staff form (VIEW-03).
export class CreateViewingDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã phòng không hợp lệ' })
  @Min(1, { message: 'Mã phòng không hợp lệ' })
  @Max(INT32_MAX, { message: 'Mã phòng không hợp lệ' })
  roomId!: number;

  @IsString({ message: 'Họ tên không hợp lệ' })
  @Length(2, 100, { message: 'Họ tên phải từ 2 đến 100 ký tự' })
  guestName!: string;

  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @Matches(/^0[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  guestPhone!: string;

  @Matches(DATE_PATTERN, { message: 'Ngày xem không hợp lệ' })
  visitDate!: string;

  @IsIn(TIME_SLOTS, { message: 'Khung giờ không hợp lệ' })
  timeSlot!: TimeSlot;

  @IsOptional()
  @IsString({ message: 'Ghi chú không hợp lệ' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}

// POST /public/viewings (VIEW-01). `website` is the honeypot (VIEW-02): hidden in the form, must stay empty.
export class PublicViewingDto extends CreateViewingDto {
  @IsOptional()
  @IsString()
  website?: string;
}

// PATCH /viewings/:id (VIEW-04, VIEW-09). All 5 statuses pass here so WON/NEW reach the service and get CONFLICT_STATE.
export class UpdateViewingDto {
  @ValidateIf(WHEN_SENT)
  @IsIn(VIEWING_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status?: ViewingStatus;

  @IsOptional()
  @IsString({ message: 'Ghi chú kết quả không hợp lệ' })
  @MaxLength(500, { message: 'Ghi chú kết quả tối đa 500 ký tự' })
  outcomeNote?: string;

  @ValidateIf(WHEN_SENT)
  @Matches(DATE_PATTERN, { message: 'Ngày xem không hợp lệ' })
  visitDate?: string;

  @ValidateIf(WHEN_SENT)
  @IsIn(TIME_SLOTS, { message: 'Khung giờ không hợp lệ' })
  timeSlot?: TimeSlot;

  @IsOptional()
  @IsString({ message: 'Ghi chú không hợp lệ' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string;
}

// GET /viewings (API-08). from/to filter visit_date, both ends included.
export class ViewingsQueryDto extends PaginationQuery {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Mã tòa không hợp lệ' })
  @Min(1, { message: 'Mã tòa không hợp lệ' })
  @Max(INT32_MAX, { message: 'Mã tòa không hợp lệ' })
  buildingId?: number;

  @IsOptional()
  @IsIn(VIEWING_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status?: ViewingStatus;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Ngày bắt đầu lọc không hợp lệ' })
  from?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'Ngày kết thúc lọc không hợp lệ' })
  to?: string;
}

export class ViewingIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã lịch hẹn không hợp lệ' })
  @Min(1, { message: 'Mã lịch hẹn không hợp lệ' })
  @Max(INT32_MAX, { message: 'Mã lịch hẹn không hợp lệ' })
  id!: number;
}
