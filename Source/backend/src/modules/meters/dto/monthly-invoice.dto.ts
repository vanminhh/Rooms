import { IsInt, Max, Min } from 'class-validator';

// BIL-21: periodNo outside 1..N → VALIDATION_FAILED; N is checked against the contract in the service.
export class CreateMissedInvoiceDto {
  @IsInt({ message: 'Kỳ không hợp lệ' })
  @Min(1, { message: 'Kỳ không hợp lệ' })
  @Max(2147483647, { message: 'Kỳ không hợp lệ' })
  periodNo!: number;
}
