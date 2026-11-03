import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ServiceUnit } from '@prisma/client';
import { PaginationQuery } from '../../../common/pagination.js';

const NAME_MESSAGE = 'Tên dịch vụ không hợp lệ';
const SORT_VALUES = ['id', '-id', 'name', '-name'] as const;

export class ServiceIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã dịch vụ không hợp lệ' })
  @Min(1, { message: 'Mã dịch vụ không hợp lệ' })
  @Max(2147483647, { message: 'Mã dịch vụ không hợp lệ' })
  id!: number;
}

export class ServicesQueryDto extends PaginationQuery {
  @Type(() => Number)
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: 'Mã tòa không hợp lệ' })
  @Min(1, { message: 'Mã tòa không hợp lệ' })
  @Max(2147483647, { message: 'Mã tòa không hợp lệ' })
  buildingId?: number;

  @IsOptional()
  @IsIn(SORT_VALUES, { message: 'Thứ tự sắp xếp không hợp lệ' })
  sort?: (typeof SORT_VALUES)[number];
}

export class CreateServiceDto {
  @IsInt({ message: 'Mã tòa không hợp lệ' })
  @Min(1, { message: 'Mã tòa không hợp lệ' })
  @Max(2147483647, { message: 'Mã tòa không hợp lệ' })
  buildingId!: number;

  @IsString({ message: NAME_MESSAGE })
  @IsNotEmpty({ message: NAME_MESSAGE })
  @MaxLength(50, { message: 'Tên dịch vụ tối đa 50 ký tự' })
  name!: string;

  @IsEnum(ServiceUnit, { message: 'Đơn vị dịch vụ không hợp lệ' })
  unit!: ServiceUnit;
}

export class UpdateServiceDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: NAME_MESSAGE })
  @IsNotEmpty({ message: NAME_MESSAGE })
  @MaxLength(50, { message: 'Tên dịch vụ tối đa 50 ký tự' })
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn([true, false], { message: 'Trạng thái dịch vụ không hợp lệ' })
  isActive?: boolean;
}
