import { InvoiceStatus, InvoiceType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination.js';

// BE-P4-18 · GET /invoices?buildingId&status&type&overdue&period (API-02, API-08).
export class InvoicesQueryDto extends PaginationQuery {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'Mã tòa không hợp lệ' })
  @Min(1, { message: 'Mã tòa không hợp lệ' })
  @Max(2147483647, { message: 'Mã tòa không hợp lệ' })
  buildingId?: number;

  @IsOptional()
  @IsEnum(InvoiceStatus, { message: 'Trạng thái hóa đơn không hợp lệ' })
  status?: InvoiceStatus;

  @IsOptional()
  @IsEnum(InvoiceType, { message: 'Loại hóa đơn không hợp lệ' })
  type?: InvoiceType;

  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'Bộ lọc quá hạn không hợp lệ' })
  overdue?: boolean;

  // The month the period starts in, YYYY-MM (MONTHLY invoices).
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Kỳ phải có dạng YYYY-MM' })
  period?: string;
}
