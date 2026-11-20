import { Type } from 'class-transformer';
import { IsInt, Max, ValidateBy } from 'class-validator';
import { parseDateOnly } from '../../../common/date/today.js';

export class ContractDatesQueryDto {
  @ValidateBy({ name: 'contractPreviewDate', validator: {
    validate: (value: unknown) => typeof value === 'string' && parseDateOnly(value) !== null,
  } }, { message: 'Ngày vào ở không hợp lệ' })
  startDate: string;

  @Type(() => Number)
  @IsInt({ message: 'Thời hạn phải là số tháng nguyên' })
  @Max(2147483647, { message: 'Thời hạn hợp đồng không hợp lệ' })
  termMonths: number;
}
