import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination.js';
import type { ViewingStatus } from '../viewings.types.js';

const INT32_MAX = 2147483647;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VIEWING_STATUSES = ['NEW', 'CONFIRMED', 'DONE', 'WON', 'LOST', 'CANCELLED'] as const;
const WHEN_SENT = (_dto: object, value: unknown) => value !== undefined;

export class BookViewingDto {
  @ValidateIf(WHEN_SENT)
  @IsBoolean({ message: 'Giá trị đồng ý trùng lịch không hợp lệ' })
  acceptOverlap?: boolean;

  @Type(() => Number)
  @IsInt({ message: 'Mã phòng không hợp lệ' })
  @Min(1, { message: 'Mã phòng không hợp lệ' })
  @Max(INT32_MAX, { message: 'Mã phòng không hợp lệ' })
  roomId!: number;

  @IsString({ message: 'Giờ xem không hợp lệ' })
  @MaxLength(64, { message: 'Giờ xem không hợp lệ' })
  visitAt!: string;

  @IsOptional()
  @IsString({ message: 'Ghi chú không hợp lệ' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string | null;
}

export class CreateViewingDto extends BookViewingDto {
  @IsString({ message: 'Họ tên không hợp lệ' })
  @Length(2, 100, { message: 'Họ tên phải từ 2 đến 100 ký tự' })
  guestName!: string;

  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @Matches(/^0[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  guestPhone!: string;
}

export class UpdateViewingDto {
  @ValidateIf(WHEN_SENT)
  @IsBoolean({ message: 'Giá trị đồng ý trùng lịch không hợp lệ' })
  acceptOverlap?: boolean;

  @ValidateIf(WHEN_SENT)
  @IsIn(VIEWING_STATUSES, { message: 'Trạng thái không hợp lệ' })
  status?: ViewingStatus;

  @IsOptional()
  @IsString({ message: 'Ghi chú kết quả không hợp lệ' })
  @MaxLength(500, { message: 'Ghi chú kết quả tối đa 500 ký tự' })
  outcomeNote?: string | null;

  @ValidateIf(WHEN_SENT)
  @IsString({ message: 'Giờ xem không hợp lệ' })
  @MaxLength(64, { message: 'Giờ xem không hợp lệ' })
  visitAt?: string;

  @IsOptional()
  @IsString({ message: 'Ghi chú không hợp lệ' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  note?: string | null;
}

export class ConfirmViewingDto {
  @IsIn(['PHONE', 'EMAIL'], { message: 'Cách xác nhận không hợp lệ' })
  via!: 'PHONE' | 'EMAIL';
}

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

export class ViewingTimesQueryDto {
  @Matches(DATE_PATTERN, { message: 'Ngày bắt đầu lọc không hợp lệ' })
  from!: string;

  @Matches(DATE_PATTERN, { message: 'Ngày kết thúc lọc không hợp lệ' })
  to!: string;
}

export class ViewingIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã lịch hẹn không hợp lệ' })
  @Min(1, { message: 'Mã lịch hẹn không hợp lệ' })
  @Max(INT32_MAX, { message: 'Mã lịch hẹn không hợp lệ' })
  id!: number;
}
