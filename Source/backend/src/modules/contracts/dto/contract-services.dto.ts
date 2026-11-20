import { ArrayUnique, IsArray, IsInt, Max, Min } from 'class-validator';

export class UpdateContractServicesDto {
  @IsArray({ message: 'Danh sách dịch vụ không hợp lệ' })
  @ArrayUnique({ message: 'Danh sách dịch vụ có mục trùng' })
  @IsInt({ each: true, message: 'Dịch vụ không hợp lệ' })
  @Min(1, { each: true, message: 'Dịch vụ không hợp lệ' })
  @Max(2147483647, { each: true, message: 'Dịch vụ không hợp lệ' })
  serviceIds: number[];
}
