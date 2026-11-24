import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, MaxLength, Min, ValidateBy, ValidateIf } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination.js';

const MAX_ID = 2147483647;
const BUILDING_ID_MESSAGE = 'Mã tòa không hợp lệ';
const ROOM_ID_MESSAGE = 'Mã phòng không hợp lệ';
const SORT_VALUES = ['-createdAt', 'createdAt'] as const;

const ANNOUNCEMENT_TEXT = {
  name: 'announcementText',
  validator: {
    validate: (value: unknown) => typeof value === 'string' && value.trim() !== '' && !value.includes('\0'),
  },
};

export class CreateAnnouncementDto {
  @ValidateIf((_object, value) => value !== null)
  @IsInt({ message: BUILDING_ID_MESSAGE })
  @Min(1, { message: BUILDING_ID_MESSAGE })
  @Max(MAX_ID, { message: BUILDING_ID_MESSAGE })
  buildingId!: number | null;

  @IsOptional()
  @IsInt({ message: ROOM_ID_MESSAGE })
  @Min(1, { message: ROOM_ID_MESSAGE })
  @Max(MAX_ID, { message: ROOM_ID_MESSAGE })
  roomId?: number | null;

  @ValidateBy(ANNOUNCEMENT_TEXT, { message: 'Tiêu đề thông báo không hợp lệ' })
  @MaxLength(150, { message: 'Tiêu đề thông báo tối đa 150 ký tự' })
  title!: string;

  @ValidateBy(ANNOUNCEMENT_TEXT, { message: 'Nội dung thông báo không hợp lệ' })
  body!: string;
}

export class AnnouncementsQueryDto extends PaginationQuery {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: BUILDING_ID_MESSAGE })
  @Min(1, { message: BUILDING_ID_MESSAGE })
  @Max(MAX_ID, { message: BUILDING_ID_MESSAGE })
  buildingId?: number;

  @IsOptional()
  @IsIn(SORT_VALUES, { message: 'Thứ tự sắp xếp không hợp lệ' })
  sort?: (typeof SORT_VALUES)[number];
}
