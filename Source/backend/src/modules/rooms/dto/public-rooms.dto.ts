import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination.js';

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
}
