import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique, IsArray, IsBoolean, IsEmail, IsInt, IsObject, IsString, Matches, Max, MaxLength, Min,
  ValidateBy, ValidateIf, ValidateNested,
} from 'class-validator';
import { parseDateOnly } from '../../../common/date/today.js';

const INT_MAX = 2147483647;
const present = (_object: unknown, value: unknown) => value !== undefined;
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

function DateOnly(message: string): PropertyDecorator {
  return ValidateBy({
    name: 'dateOnly',
    validator: { validate: (value: unknown) => typeof value === 'string' && parseDateOnly(value) !== null },
  }, { message });
}

// Proposed Vietnamese validation copy. The request accepts numbers only for IDs and amounts.
class SignerDto {
  @Transform(trim)
  @Matches(/\S/, { message: 'Vui lòng nhập họ và tên người ký' })
  @MaxLength(100, { message: 'Họ và tên tối đa 100 ký tự' })
  fullName: string;

  @Transform(trim)
  @Matches(/^0[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone: string;

  @ValidateIf(present)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255, { message: 'Email không hợp lệ' })
  email?: string;

  @ValidateIf(present)
  @DateOnly('Ngày sinh không hợp lệ')
  dateOfBirth?: string;

  @ValidateIf(present)
  @Matches(/^[0-9]{12}$/, { message: 'Số CCCD phải gồm đúng 12 chữ số' })
  idNumber?: string;
}

export class CreateContractDto {
  @IsInt({ message: 'Phòng không hợp lệ' })
  @Min(1, { message: 'Phòng không hợp lệ' })
  @Max(INT_MAX, { message: 'Phòng không hợp lệ' })
  roomId: number;

  @IsObject({ message: 'Thông tin người ký không hợp lệ' })
  @ValidateNested()
  @Type(() => SignerDto)
  signer: SignerDto;

  @DateOnly('Ngày vào ở không hợp lệ')
  startDate: string;

  @IsInt({ message: 'Thời hạn phải là số tháng nguyên' })
  @Max(INT_MAX, { message: 'Thời hạn hợp đồng không hợp lệ' })
  termMonths: number;

  @ValidateIf(present)
  @IsInt({ message: 'Tiền cọc phải là số nguyên đồng' })
  @Min(0, { message: 'Tiền cọc không được âm' })
  @Max(INT_MAX, { message: 'Tiền cọc vượt giới hạn lưu trữ' })
  deposit?: number;

  @IsArray({ message: 'Danh sách dịch vụ không hợp lệ' })
  @ArrayUnique({ message: 'Danh sách dịch vụ có mục trùng' })
  @IsInt({ each: true, message: 'Dịch vụ không hợp lệ' })
  @Min(1, { each: true, message: 'Dịch vụ không hợp lệ' })
  @Max(INT_MAX, { each: true, message: 'Dịch vụ không hợp lệ' })
  serviceIds: number[];

  @ValidateIf(present)
  @IsString({ message: 'Điều khoản không hợp lệ' })
  terms?: string;

  @ValidateIf(present)
  @IsInt({ message: 'Lịch xem không hợp lệ' })
  @Min(1, { message: 'Lịch xem không hợp lệ' })
  @Max(INT_MAX, { message: 'Lịch xem không hợp lệ' })
  viewingId?: number;

  @ValidateIf(present)
  @IsInt({ message: 'Tài khoản xác nhận không hợp lệ' })
  @Min(1, { message: 'Tài khoản xác nhận không hợp lệ' })
  @Max(INT_MAX, { message: 'Tài khoản xác nhận không hợp lệ' })
  confirmedGuestAccountId?: number;

  @ValidateIf(present)
  @IsBoolean({ message: 'Xác nhận người ký không hợp lệ' })
  confirmDifferentViewingOwner?: boolean;
}
