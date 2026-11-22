import { PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, NotContains, ValidateIf, ValidateNested } from 'class-validator';

const INT = 2147483647;

// BIL-13 / D-38: both readings are required (water is read in every building, MTR-06); photos are optional.
export class FinalReadingsDto {
  @IsInt({ message: 'Chỉ số điện không hợp lệ' })
  @Min(0, { message: 'Chỉ số điện không hợp lệ' })
  @Max(INT, { message: 'Chỉ số điện không hợp lệ' })
  electric!: number;

  @IsInt({ message: 'Chỉ số nước không hợp lệ' })
  @Min(0, { message: 'Chỉ số nước không hợp lệ' })
  @Max(INT, { message: 'Chỉ số nước không hợp lệ' })
  water!: number;

  @ValidateIf((_o, v) => v !== undefined)
  @IsString({ message: 'Ảnh chỉ số không hợp lệ' })
  @MaxLength(500, { message: 'Ảnh chỉ số không hợp lệ' })
  @NotContains('\0', { message: 'Ảnh chỉ số không hợp lệ' })
  electricPhotoUrl?: string;

  @ValidateIf((_o, v) => v !== undefined)
  @IsString({ message: 'Ảnh chỉ số không hợp lệ' })
  @MaxLength(500, { message: 'Ảnh chỉ số không hợp lệ' })
  @NotContains('\0', { message: 'Ảnh chỉ số không hợp lệ' })
  waterPhotoUrl?: string;
}

export class SettlementDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày dọn đi phải có dạng YYYY-MM-DD' })
  moveOutDate!: string;

  @ValidateNested()
  @Type(() => FinalReadingsDto)
  finalReadings!: FinalReadingsDto;

  @ValidateIf((_o, v) => v !== undefined)
  @IsInt({ message: 'Tiền hư hỏng không hợp lệ' })
  @Min(0, { message: 'Tiền hư hỏng không hợp lệ' })
  @Max(INT, { message: 'Tiền hư hỏng không hợp lệ' })
  damages?: number;

  @ValidateIf((_o, v) => v !== undefined)
  @IsInt({ message: 'Tiền cọc giữ lại không hợp lệ' })
  @Min(0, { message: 'Tiền cọc giữ lại không hợp lệ' })
  @Max(INT, { message: 'Tiền cọc giữ lại không hợp lệ' })
  depositForfeit?: number;

  @ValidateIf((_o, v) => v !== undefined)
  @IsString({ message: 'Ghi chú không hợp lệ' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  @NotContains('\0', { message: 'Ghi chú không hợp lệ' })
  note?: string;
}

export class SettlementQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean({ message: 'Giá trị xem trước không hợp lệ' })
  dryRun?: boolean;
}

export class SettlementIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã quyết toán không hợp lệ' })
  @Min(1, { message: 'Mã quyết toán không hợp lệ' })
  @Max(INT, { message: 'Mã quyết toán không hợp lệ' })
  id!: number;
}

// Q-P4-8: { method, paidAt?, note? }, once, no undo.
export class RefundPaidDto {
  @IsEnum(PaymentMethod, { message: 'Phương thức trả lại không hợp lệ' })
  method!: PaymentMethod;

  @ValidateIf((_o, v) => v !== undefined)
  @IsISO8601({ strict: true, strictSeparator: true }, { message: 'Thời điểm trả lại phải có múi giờ hợp lệ' })
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/, { message: 'Thời điểm trả lại phải có múi giờ hợp lệ' })
  paidAt?: string;

  @ValidateIf((_o, v) => v !== undefined)
  @IsString({ message: 'Ghi chú không hợp lệ' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  @NotContains('\0', { message: 'Ghi chú không hợp lệ' })
  note?: string;
}
