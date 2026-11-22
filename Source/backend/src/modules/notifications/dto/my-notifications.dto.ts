import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination.js';

export class MyNotificationsQueryDto extends PaginationQuery {
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'Bộ lọc chưa đọc không hợp lệ' })
  unread?: boolean;
}

export class NotificationIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã thông báo không hợp lệ' })
  @Min(1, { message: 'Mã thông báo không hợp lệ' })
  @Max(2147483647, { message: 'Mã thông báo không hợp lệ' })
  id!: number;
}
