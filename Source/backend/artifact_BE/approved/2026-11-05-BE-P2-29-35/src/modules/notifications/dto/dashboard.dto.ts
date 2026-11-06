import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// GET /dashboard?buildingId (VIEW-07). A manager's buildingId outside scope is refused in the service (403).
export class DashboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Mã tòa không hợp lệ' })
  @Min(1, { message: 'Mã tòa không hợp lệ' })
  @Max(2147483647, { message: 'Mã tòa không hợp lệ' })
  buildingId?: number;
}
