import { Transform } from 'class-transformer';
import { IsInt, IsString, Matches, Max, MaxLength, Min, NotContains, ValidateIf } from 'class-validator';

export class CancelContractDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'Lý do hủy không hợp lệ' })
  @Matches(/\S/, { message: 'Vui lòng nhập lý do hủy hợp đồng' })
  @MaxLength(2000, { message: 'Lý do hủy tối đa 2000 ký tự' })
  @NotContains('\0', { message: 'Lý do hủy chứa ký tự không hợp lệ' })
  reason: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: 'Tiền cọc giữ lại phải là số nguyên đồng' })
  @Min(0, { message: 'Tiền cọc giữ lại không được âm' })
  @Max(2147483647, { message: 'Tiền cọc giữ lại vượt giới hạn lưu trữ' })
  depositKept?: number;

  // Optional optimistic check from the read-only confirmation preview.
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt({ message: 'Tiền cọc đã nhận phải là số nguyên đồng' })
  @Min(0, { message: 'Tiền cọc đã nhận không được âm' })
  @Max(2147483647, { message: 'Tiền cọc đã nhận vượt giới hạn lưu trữ' })
  expectedDepositReceived?: number;
}
