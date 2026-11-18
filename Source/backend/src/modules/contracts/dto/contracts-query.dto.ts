import { ContractStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min, NotContains } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination.js';

const INT32_MAX = 2147483647;
const SORT_VALUES = ['createdAt', '-createdAt'] as const;

export class ContractsQueryDto extends PaginationQuery {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Mã tòa không hợp lệ' })
  @Min(1, { message: 'Mã tòa không hợp lệ' })
  @Max(INT32_MAX, { message: 'Mã tòa không hợp lệ' })
  buildingId?: number;

  @IsOptional()
  @IsEnum(ContractStatus, { message: 'Trạng thái hợp đồng không hợp lệ' })
  status?: ContractStatus;

  @IsOptional()
  @IsString({ message: 'Từ khóa tìm kiếm không hợp lệ' })
  @NotContains('\0', { message: 'Từ khóa tìm kiếm không hợp lệ' })
  q?: string;

  @IsOptional()
  @IsIn(SORT_VALUES, { message: 'Thứ tự sắp xếp không hợp lệ' })
  sort?: (typeof SORT_VALUES)[number];
}

export class ContractIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã hợp đồng không hợp lệ' })
  @Min(1, { message: 'Mã hợp đồng không hợp lệ' })
  @Max(INT32_MAX, { message: 'Mã hợp đồng không hợp lệ' })
  id!: number;
}
