import { Transform, Type } from 'class-transformer';
import { IsInt, IsObject, IsString, Max, MaxLength, Min, ValidateBy, ValidateIf, ValidateNested } from 'class-validator';
import { parseDateOnly } from '../../../common/date/today.js';

const INT_MAX = 2147483647;
const present = (_object: unknown, value: unknown) => value !== undefined;

class MeterReplacementDto {
  @IsInt({ message: 'Chỉ số cuối đồng hồ cũ phải là số nguyên' })
  @Min(0, { message: 'Chỉ số cuối đồng hồ cũ không được âm' })
  @Max(INT_MAX, { message: 'Chỉ số vượt giới hạn lưu trữ' })
  oldMeterFinal: number;
}

export class MoveInContractDto {
  @IsInt({ message: 'Chỉ số điện phải là số nguyên' })
  @Min(0, { message: 'Chỉ số điện không được âm' })
  @Max(INT_MAX, { message: 'Chỉ số vượt giới hạn lưu trữ' })
  electric: number;

  @IsInt({ message: 'Chỉ số nước phải là số nguyên' })
  @Min(0, { message: 'Chỉ số nước không được âm' })
  @Max(INT_MAX, { message: 'Chỉ số vượt giới hạn lưu trữ' })
  water: number;

  @ValidateBy({ name: 'dateOnly', validator: {
    validate: (value: unknown) => typeof value === 'string' && parseDateOnly(value) !== null,
  } }, { message: 'Ngày đọc chỉ số không hợp lệ' })
  readOn: string;

  @ValidateIf(present)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString({ message: 'Ghi chú không hợp lệ' })
  @MaxLength(2000, { message: 'Ghi chú tối đa 2000 ký tự' })
  @ValidateBy({ name: 'noNul', validator: {
    validate: (value: unknown) => typeof value === 'string' && !value.includes('\0'),
  } }, { message: 'Ghi chú chứa ký tự không hợp lệ' })
  note?: string;

  @ValidateIf(present)
  @IsObject({ message: 'Thông tin thay đồng hồ điện không hợp lệ' })
  @ValidateNested()
  @Type(() => MeterReplacementDto)
  electricReplacement?: MeterReplacementDto;

  @ValidateIf(present)
  @IsObject({ message: 'Thông tin thay đồng hồ nước không hợp lệ' })
  @ValidateNested()
  @Type(() => MeterReplacementDto)
  waterReplacement?: MeterReplacementDto;
}
