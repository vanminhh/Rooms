import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsString, Matches, Max, Min, NotContains, ValidateIf } from 'class-validator';

export class InvoiceIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã hóa đơn không hợp lệ' })
  @Min(1, { message: 'Mã hóa đơn không hợp lệ' })
  @Max(2147483647, { message: 'Mã hóa đơn không hợp lệ' })
  id: number;
}

export class RecordPaymentDto {
  @IsEnum(PaymentMethod, { message: 'Phương thức thanh toán không hợp lệ' })
  method: PaymentMethod;

  @ValidateIf((_object, value) => value !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true }, { message: 'Thời điểm thanh toán phải có múi giờ hợp lệ' })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'Thời điểm thanh toán phải có múi giờ hợp lệ',
  })
  paidAt?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'Ghi chú thanh toán không hợp lệ' })
  @NotContains('\0', { message: 'Ghi chú thanh toán không hợp lệ' })
  note?: string;
}
