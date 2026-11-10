import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString,
  Max, MaxLength, Min, MinLength, ValidateIf,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination.js';

const ROOM_ID_MESSAGE = 'Mã phòng không hợp lệ';

export class RoomIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: ROOM_ID_MESSAGE })
  @Min(1, { message: ROOM_ID_MESSAGE })
  @Max(2147483647, { message: ROOM_ID_MESSAGE })
  id!: number;
}

export class RoomImageIdParamsDto extends RoomIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã ảnh không hợp lệ' })
  @Min(1, { message: 'Mã ảnh không hợp lệ' })
  @Max(2147483647, { message: 'Mã ảnh không hợp lệ' })
  imageId!: number;
}

export class AddRoomImageDto {
  @IsString({ message: 'Mã tài sản Cloudinary không hợp lệ' })
  @MinLength(1, { message: 'Mã tài sản Cloudinary không hợp lệ' })
  assetId!: string;

  @IsString({ message: 'Mã ảnh Cloudinary không hợp lệ' })
  @MinLength(1, { message: 'Mã ảnh Cloudinary không hợp lệ' })
  publicId!: string;

  @Type(() => Number)
  @IsInt({ message: 'Phiên bản ảnh không hợp lệ' })
  @Min(1, { message: 'Phiên bản ảnh không hợp lệ' })
  @Max(2147483647, { message: 'Phiên bản ảnh không hợp lệ' })
  version!: number;

  @IsString({ message: 'Định dạng ảnh không hợp lệ' })
  @IsIn(['jpg', 'png', 'webp'], { message: 'Định dạng ảnh không hợp lệ' })
  format!: 'jpg' | 'png' | 'webp';
}

export class OrderRoomImagesDto {
  @IsArray({ message: 'Thứ tự ảnh không hợp lệ' })
  @ArrayMaxSize(10, { message: 'Mỗi phòng chỉ được có tối đa 10 ảnh' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'Mã ảnh không hợp lệ' })
  @Min(1, { each: true, message: 'Mã ảnh không hợp lệ' })
  @Max(2147483647, { each: true, message: 'Mã ảnh không hợp lệ' })
  imageIds!: number[];
}

export class RoomsQueryDto extends PaginationQuery {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Mã tòa không hợp lệ' })
  @Min(1, { message: 'Mã tòa không hợp lệ' })
  @Max(2147483647, { message: 'Mã tòa không hợp lệ' })
  buildingId?: number;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'Giá trị hiển thị phòng đã khóa không hợp lệ' })
  includeInactive?: boolean;

  @IsOptional()
  @IsIn(['code', '-code', 'floor', '-floor'], { message: 'Thứ tự sắp xếp không hợp lệ' })
  sort?: 'code' | '-code' | 'floor' | '-floor';
}

export class CreateRoomDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã tòa không hợp lệ' })
  @Min(1, { message: 'Mã tòa không hợp lệ' })
  @Max(2147483647, { message: 'Mã tòa không hợp lệ' })
  buildingId!: number;

  @IsString({ message: 'Mã phòng phải là chuỗi từ 1 đến 10 ký tự' })
  @MinLength(1, { message: 'Mã phòng phải là chuỗi từ 1 đến 10 ký tự' })
  @MaxLength(10, { message: 'Mã phòng phải là chuỗi từ 1 đến 10 ký tự' })
  code!: string;

  @Type(() => Number)
  @IsInt({ message: 'Tầng phải là số nguyên từ 1 đến 2147483647' })
  @Min(1, { message: 'Tầng phải là số nguyên từ 1 đến 2147483647' })
  @Max(2147483647, { message: 'Tầng phải là số nguyên từ 1 đến 2147483647' })
  floor!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Diện tích phải lớn hơn 0 và tối đa 9999,9 m²' })
  @Min(0.1, { message: 'Diện tích phải lớn hơn 0 và tối đa 9999,9 m²' })
  @Max(9999.9, { message: 'Diện tích phải lớn hơn 0 và tối đa 9999,9 m²' })
  areaM2!: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Số người tối đa không hợp lệ' })
  @Min(1, { message: 'Số người tối đa không hợp lệ' })
  @Max(2147483647, { message: 'Số người tối đa không hợp lệ' })
  maxOccupants?: number;

  @IsOptional()
  @IsArray({ message: 'Danh sách nội thất không hợp lệ' })
  @IsString({ each: true, message: 'Mỗi nội thất phải là chuỗi' })
  furniture?: string[];

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString({ message: 'Mô tả phải là chuỗi' })
  description?: string | null;
}

export class UpdateRoomDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'Mã phòng phải là chuỗi từ 1 đến 10 ký tự' })
  @MinLength(1, { message: 'Mã phòng phải là chuỗi từ 1 đến 10 ký tự' })
  @MaxLength(10, { message: 'Mã phòng phải là chuỗi từ 1 đến 10 ký tự' })
  code?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt({ message: 'Tầng phải là số nguyên từ 1 đến 2147483647' })
  @Min(1, { message: 'Tầng phải là số nguyên từ 1 đến 2147483647' })
  @Max(2147483647, { message: 'Tầng phải là số nguyên từ 1 đến 2147483647' })
  floor?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Diện tích phải lớn hơn 0 và tối đa 9999,9 m²' })
  @Min(0.1, { message: 'Diện tích phải lớn hơn 0 và tối đa 9999,9 m²' })
  @Max(9999.9, { message: 'Diện tích phải lớn hơn 0 và tối đa 9999,9 m²' })
  areaM2?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsInt({ message: 'Số người tối đa không hợp lệ' })
  @Min(1, { message: 'Số người tối đa không hợp lệ' })
  @Max(2147483647, { message: 'Số người tối đa không hợp lệ' })
  maxOccupants?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsArray({ message: 'Danh sách nội thất không hợp lệ' })
  @IsString({ each: true, message: 'Mỗi nội thất phải là chuỗi' })
  furniture?: string[];

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString({ message: 'Mô tả phải là chuỗi' })
  description?: string | null;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: 'Trạng thái bảo trì không hợp lệ' })
  underMaintenance?: boolean;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: 'Trạng thái phòng không hợp lệ' })
  isActive?: boolean;
}
