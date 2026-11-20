import { VehicleType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, Matches, Max, MaxLength, Min, NotContains, ValidateBy, ValidateIf } from 'class-validator';
import { parseDateOnly } from '../../../common/date/today.js';
import { PaginationQuery } from '../../../common/pagination.js';
import { ContractIdParamsDto } from './contracts-query.dto.js';

const present = (_object: unknown, value: unknown) => value !== undefined;
export const normalizePlate = (value: string) => value.replace(/\s/g, '').toUpperCase();
const plate = ({ value }: { value: unknown }) => typeof value === 'string' ? normalizePlate(value) : value;

function DateOnly(): PropertyDecorator {
  return ValidateBy({ name: 'vehicleDateOnly', validator: {
    validate: (value: unknown) => typeof value === 'string' && parseDateOnly(value) !== null,
  } }, { message: 'Ngày không hợp lệ, cần định dạng YYYY-MM-DD' });
}

export class CreateVehicleDto {
  @Transform(plate)
  @Matches(/\S/, { message: 'Vui lòng nhập biển số xe' })
  @MaxLength(15, { message: 'Biển số xe tối đa 15 ký tự' })
  @NotContains('\0', { message: 'Biển số xe không hợp lệ' })
  plate: string;

  @IsEnum(VehicleType, { message: 'Loại xe không hợp lệ' })
  type: VehicleType;

  @IsInt({ message: 'Mã dịch vụ không hợp lệ' })
  @Min(1, { message: 'Mã dịch vụ không hợp lệ' })
  @Max(2147483647, { message: 'Mã dịch vụ không hợp lệ' })
  serviceId: number;

  @ValidateIf(present)
  @DateOnly()
  registeredAt?: string;
}

export class UpdateVehicleDto {
  @ValidateIf(present)
  @Transform(plate)
  @Matches(/\S/, { message: 'Vui lòng nhập biển số xe' })
  @MaxLength(15, { message: 'Biển số xe tối đa 15 ký tự' })
  @NotContains('\0', { message: 'Biển số xe không hợp lệ' })
  plate?: string;

  @ValidateIf(present)
  @IsEnum(VehicleType, { message: 'Loại xe không hợp lệ' })
  type?: VehicleType;

  @ValidateIf(present)
  @IsInt({ message: 'Mã dịch vụ không hợp lệ' })
  @Min(1, { message: 'Mã dịch vụ không hợp lệ' })
  @Max(2147483647, { message: 'Mã dịch vụ không hợp lệ' })
  serviceId?: number;

  @ValidateIf(present)
  @DateOnly()
  registeredAt?: string;

  @ValidateIf(present)
  @IsIn([false], { message: 'Xe đã ngừng gửi cần đăng ký mới để giữ lịch sử' })
  isActive?: false;

  @ValidateIf(present)
  @DateOnly()
  removedAt?: string;
}

export class VehicleIdParamsDto extends ContractIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã xe không hợp lệ' })
  @Min(1, { message: 'Mã xe không hợp lệ' })
  @Max(2147483647, { message: 'Mã xe không hợp lệ' })
  vid: number;
}

export class VehiclesQueryDto extends PaginationQuery {
  @ValidateIf(present)
  @Transform(plate)
  @Matches(/\S/, { message: 'Vui lòng nhập biển số xe' })
  @MaxLength(15, { message: 'Biển số xe tối đa 15 ký tự' })
  @NotContains('\0', { message: 'Biển số xe không hợp lệ' })
  plate?: string;

  @ValidateIf(present)
  @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean({ message: 'Trạng thái gửi xe không hợp lệ' })
  isActive?: boolean;
}
