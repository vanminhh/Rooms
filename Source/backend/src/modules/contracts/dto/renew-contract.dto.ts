import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RenewContractDto {
  @IsOptional() @IsInt() @Min(1) @Max(2147483647)
  requestId?: number;

  @IsInt({ message: 'Thời hạn phải là số tháng nguyên' })
  @Max(2147483647, { message: 'Thời hạn hợp đồng không hợp lệ' })
  termMonths: number;

  @IsOptional()
  @IsString({ message: 'Điều khoản không hợp lệ' })
  terms?: string | null;
}
