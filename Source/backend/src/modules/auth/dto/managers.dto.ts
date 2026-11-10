import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
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
import { PaginationQuery } from '../../../common/pagination.js';

const PHONE_MESSAGE = 'Số điện thoại không hợp lệ';
const NAME_MESSAGE = 'Họ và tên không hợp lệ';
const EMAIL_MESSAGE = 'Email không hợp lệ';
const SORT_VALUES = ['-createdAt', 'createdAt', 'fullName', '-fullName'] as const;

export class ManagerIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã quản lý không hợp lệ' })
  @Min(1, { message: 'Mã quản lý không hợp lệ' })
  @Max(2147483647, { message: 'Mã quản lý không hợp lệ' })
  id!: number;
}

export class ManagersQueryDto extends PaginationQuery {
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

export class CreateManagerDto {
  @Matches(/^0[0-9]{9}$/, { message: PHONE_MESSAGE })
  phone!: string;

  @IsString({ message: NAME_MESSAGE })
  @IsNotEmpty({ message: NAME_MESSAGE })
  @MaxLength(100, { message: 'Họ và tên tối đa 100 ký tự' })
  fullName!: string;

  @IsOptional()
  @IsEmail({}, { message: EMAIL_MESSAGE })
  @MaxLength(255, { message: EMAIL_MESSAGE })
  email?: string | null;
}

export class UpdateManagerDto {
  @IsBoolean({ message: 'Trạng thái tài khoản không hợp lệ' })
  isActive!: boolean;
}
