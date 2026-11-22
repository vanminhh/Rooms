import { BankTxStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, NotContains } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination.js';

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// BANK-05 · GET /bank-transactions?status&from&to (Hà Nội days, both ends included).
export class BankTransactionsQueryDto extends PaginationQuery {
  @IsOptional()
  @IsEnum(BankTxStatus, { message: 'Trạng thái giao dịch không hợp lệ' })
  status?: BankTxStatus;

  @IsOptional()
  @Matches(DAY, { message: 'Ngày phải có dạng YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DAY, { message: 'Ngày phải có dạng YYYY-MM-DD' })
  to?: string;
}

export class BankTxIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã giao dịch không hợp lệ' })
  @Min(1, { message: 'Mã giao dịch không hợp lệ' })
  @Max(2147483647, { message: 'Mã giao dịch không hợp lệ' })
  id!: number;
}

export class AssignTransactionDto {
  @IsInt({ message: 'Mã hóa đơn không hợp lệ' })
  @Min(1, { message: 'Mã hóa đơn không hợp lệ' })
  @Max(2147483647, { message: 'Mã hóa đơn không hợp lệ' })
  invoiceId!: number;
}

export class MarkRefundedDto {
  @IsString({ message: 'Hãy nhập ghi chú hoàn tiền' })
  @Matches(/\S/, { message: 'Hãy nhập ghi chú hoàn tiền' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  @NotContains('\0', { message: 'Ghi chú hoàn tiền không hợp lệ' })
  note!: string;
}
