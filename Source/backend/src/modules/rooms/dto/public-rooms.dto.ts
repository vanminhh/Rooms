import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AMENITY_CODES, ROOM_TYPE_CODES } from '../../../common/catalog/catalog.js';
import { PaginationQuery } from '../../../common/pagination.js';

// '?amenities=ELEVATOR,PARKING' -> ['ELEVATOR','PARKING'] (trimmed, empty parts dropped, duplicates dropped).
// A repeated key (?amenities=A&amenities=B) arrives as an array and is handled the same way.
const toCodeList = ({ value }: { value: unknown }): unknown => {
  const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(parts)) return parts;
  return [...new Set(parts.map((p) => (typeof p === 'string' ? p.trim() : p)).filter((p) => p !== ''))];
};
// Only the string 'true' means on (PUB-06: "true only"); anything else stays as given and fails IsIn.
const BOOLEAN_FILTER_MESSAGE = 'Giá trị bộ lọc không hợp lệ';

// Shared by /public/rooms/:id and /public/buildings/:id.
export class PublicIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã không hợp lệ' })
  @Min(1, { message: 'Mã không hợp lệ' })
  @Max(2147483647, { message: 'Mã không hợp lệ' })
  id!: number;
}

export class PublicRoomsQueryDto extends PaginationQuery {
  @IsOptional()
  @IsString({ message: 'Quận/huyện không hợp lệ' })
  @MaxLength(50, { message: 'Quận/huyện không hợp lệ' })
  district?: string;

  @IsOptional()
  @IsString({ message: 'Phường/xã không hợp lệ' })
  @MaxLength(50, { message: 'Phường/xã không hợp lệ' })
  ward?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mã tòa không hợp lệ' })
  @Min(1, { message: 'Mã tòa không hợp lệ' })
  @Max(2147483647, { message: 'Mã tòa không hợp lệ' })
  buildingId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giá tối thiểu không hợp lệ' })
  @Min(0, { message: 'Giá tối thiểu không hợp lệ' })
  @Max(2147483647, { message: 'Giá tối thiểu không hợp lệ' })
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Giá tối đa không hợp lệ' })
  @Min(0, { message: 'Giá tối đa không hợp lệ' })
  @Max(2147483647, { message: 'Giá tối đa không hợp lệ' })
  maxPrice?: number;

  // [ASSUMPTION] '-price' is added beside the two sorts in PUB-01 (plan A3); default = 'price'.
  @IsOptional()
  @IsIn(['price', '-price', 'newest'], { message: 'Thứ tự sắp xếp không hợp lệ' })
  sort?: 'price' | '-price' | 'newest';

  // PUB-06. Limits follow the columns: area_m2 is Decimal(5,1), floor and max_occupants are Int, so a huge number is a 400, not a 500.
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Diện tích tối thiểu không hợp lệ' })
  @Min(0.1, { message: 'Diện tích tối thiểu không hợp lệ' })
  @Max(9999.9, { message: 'Diện tích tối thiểu không hợp lệ' })
  minArea?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Diện tích tối đa không hợp lệ' })
  @Min(0.1, { message: 'Diện tích tối đa không hợp lệ' })
  @Max(9999.9, { message: 'Diện tích tối đa không hợp lệ' })
  maxArea?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số người không hợp lệ' })
  @Min(1, { message: 'Số người không hợp lệ' })
  @Max(2147483647, { message: 'Số người không hợp lệ' })
  minOccupants?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Tầng không hợp lệ' })
  @Min(1, { message: 'Tầng không hợp lệ' })
  @Max(2147483647, { message: 'Tầng không hợp lệ' })
  floor?: number;

  @IsOptional()
  @Transform(toCodeList)
  @IsArray({ message: 'Tiện ích không có trong danh mục' })
  @ArrayMaxSize(AMENITY_CODES.length, { message: 'Tiện ích không có trong danh mục' })
  @IsIn(AMENITY_CODES, { each: true, message: 'Tiện ích không có trong danh mục' })
  amenities?: string[];

  @IsOptional()
  @IsIn(['true'], { message: BOOLEAN_FILTER_MESSAGE })
  balcony?: 'true';

  @IsOptional()
  @IsIn(['true'], { message: BOOLEAN_FILTER_MESSAGE })
  window?: 'true';

  @IsOptional()
  @IsIn(['true'], { message: BOOLEAN_FILTER_MESSAGE })
  pets?: 'true';

  @IsOptional()
  @IsIn(ROOM_TYPE_CODES, { message: 'Loại phòng không hợp lệ' })
  roomType?: 'STUDIO' | 'LOFT' | 'ONE_BEDROOM' | 'TWO_BEDROOM';
}
