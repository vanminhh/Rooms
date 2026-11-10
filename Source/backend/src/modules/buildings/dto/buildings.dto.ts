import { Type, Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { WaterMode } from '@prisma/client';
import { PaginationQuery } from '../../../common/pagination.js';

const CODE_MESSAGE = 'Mã tòa gồm 2–6 ký tự A–Z hoặc 0–9';
const REQUIRED_TEXT_MESSAGE = 'Vui lòng nhập nội dung';
const SORT_VALUES = ['-createdAt', 'createdAt', 'code', '-code', 'name', '-name'] as const;

export class BuildingIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã tòa không hợp lệ' })
  @Min(1, { message: 'Mã tòa không hợp lệ' })
  @Max(2147483647, { message: 'Mã tòa không hợp lệ' })
  id!: number;
}

export class BuildingsQueryDto extends PaginationQuery {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Mã tòa không hợp lệ' })
  @Min(1, { message: 'Mã tòa không hợp lệ' })
  @Max(2147483647, { message: 'Mã tòa không hợp lệ' })
  buildingId?: number;

  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsOptional()
  @IsBoolean({ message: 'Giá trị hiển thị tòa đã khóa không hợp lệ' })
  includeInactive?: boolean;

  @IsOptional()
  @IsIn(SORT_VALUES, { message: 'Thứ tự sắp xếp không hợp lệ' })
  sort?: (typeof SORT_VALUES)[number];
}

export class CreateBuildingDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsString({ message: CODE_MESSAGE })
  @Matches(/^[A-Z0-9]{2,6}$/, { message: CODE_MESSAGE })
  code!: string;

  @IsString({ message: REQUIRED_TEXT_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_TEXT_MESSAGE })
  @MaxLength(100, { message: 'Tên tòa tối đa 100 ký tự' })
  name!: string;

  @IsString({ message: REQUIRED_TEXT_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_TEXT_MESSAGE })
  @MaxLength(255, { message: 'Địa chỉ tối đa 255 ký tự' })
  address!: string;

  @IsString({ message: REQUIRED_TEXT_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_TEXT_MESSAGE })
  @MaxLength(50, { message: 'Quận/huyện tối đa 50 ký tự' })
  district!: string;

  @IsString({ message: REQUIRED_TEXT_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_TEXT_MESSAGE })
  @MaxLength(50, { message: 'Phường/xã tối đa 50 ký tự' })
  ward!: string;

  @IsEnum(WaterMode, { message: 'Cách tính nước không hợp lệ' })
  waterMode!: WaterMode;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: 'Số ngày thu không hợp lệ' })
  @Min(1, { message: 'Số ngày thu phải từ 1 đến 31' })
  @Max(31, { message: 'Số ngày thu phải từ 1 đến 31' })
  dueDays?: number;

  @IsOptional()
  @IsInt({ message: 'Mã quản lý không hợp lệ' })
  @Min(1, { message: 'Mã quản lý không hợp lệ' })
  @Max(2147483647, { message: 'Mã quản lý không hợp lệ' })
  managerId?: number | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray({ message: 'Danh sách tiện ích không hợp lệ' })
  @IsString({ each: true, message: 'Mỗi tiện ích phải là chuỗi' })
  amenities?: string[];

  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  description?: string | null;
}

export class UpdateBuildingDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: CODE_MESSAGE })
  @Matches(/^[A-Z0-9]{2,6}$/, { message: CODE_MESSAGE })
  code?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: REQUIRED_TEXT_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_TEXT_MESSAGE })
  @MaxLength(100, { message: 'Tên tòa tối đa 100 ký tự' })
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: REQUIRED_TEXT_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_TEXT_MESSAGE })
  @MaxLength(255, { message: 'Địa chỉ tối đa 255 ký tự' })
  address?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: REQUIRED_TEXT_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_TEXT_MESSAGE })
  @MaxLength(50, { message: 'Quận/huyện tối đa 50 ký tự' })
  district?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: REQUIRED_TEXT_MESSAGE })
  @IsNotEmpty({ message: REQUIRED_TEXT_MESSAGE })
  @MaxLength(50, { message: 'Phường/xã tối đa 50 ký tự' })
  ward?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(WaterMode, { message: 'Cách tính nước không hợp lệ' })
  waterMode?: WaterMode;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: 'Số ngày thu không hợp lệ' })
  @Min(1, { message: 'Số ngày thu phải từ 1 đến 31' })
  @Max(31, { message: 'Số ngày thu phải từ 1 đến 31' })
  dueDays?: number;

  @IsOptional()
  @IsInt({ message: 'Mã quản lý không hợp lệ' })
  @Min(1, { message: 'Mã quản lý không hợp lệ' })
  @Max(2147483647, { message: 'Mã quản lý không hợp lệ' })
  managerId?: number | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray({ message: 'Danh sách tiện ích không hợp lệ' })
  @IsString({ each: true, message: 'Mỗi tiện ích phải là chuỗi' })
  amenities?: string[];

  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi' })
  description?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: 'Trạng thái tòa không hợp lệ' })
  isActive?: boolean;
}


