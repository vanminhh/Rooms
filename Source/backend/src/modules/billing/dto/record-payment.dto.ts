import { MeterKind, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsISO8601, IsString, Matches, Max, MaxLength, Min, NotContains, ValidateIf, ValidateNested } from 'class-validator';

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

// BIL-12 / Q-P4-6 / Q-P4-24: corrections touch only this invoice's closing readings, meter replacement included.
export class ReadingCorrectionDto {
  @IsEnum(MeterKind, { message: 'Loại đồng hồ không hợp lệ' })
  kind: MeterKind;

  @IsInt({ message: 'Chỉ số không hợp lệ' })
  @Min(0, { message: 'Chỉ số không hợp lệ' })
  @Max(2147483647, { message: 'Chỉ số không hợp lệ' })
  value: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean({ message: 'Giá trị thay đồng hồ không hợp lệ' })
  isMeterReplaced?: boolean;

  // Required when the reading is marked as a meter replacement (CHECK meter_readings_values).
  @ValidateIf((object: ReadingCorrectionDto, value) => object.isMeterReplaced === true || value !== undefined)
  @IsInt({ message: 'Số cuối đồng hồ cũ không hợp lệ' })
  @Min(0, { message: 'Số cuối đồng hồ cũ không hợp lệ' })
  @Max(2147483647, { message: 'Số cuối đồng hồ cũ không hợp lệ' })
  oldMeterFinal?: number;
}

export class ReissueInvoiceDto {
  @IsString({ message: 'Lý do lập lại không hợp lệ' })
  @Matches(/\S/, { message: 'Hãy nhập lý do lập lại' })
  @MaxLength(500, { message: 'Lý do lập lại tối đa 500 ký tự' })
  @NotContains('\0', { message: 'Lý do lập lại không hợp lệ' })
  reason: string;

  @IsArray({ message: 'Danh sách sửa chỉ số không hợp lệ' })
  @ArrayMaxSize(2, { message: 'Chỉ sửa được chỉ số điện và nước' })
  @ValidateNested({ each: true })
  @Type(() => ReadingCorrectionDto)
  corrections: ReadingCorrectionDto[];
}
