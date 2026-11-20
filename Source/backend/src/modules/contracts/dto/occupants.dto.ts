import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, Matches, Max, MaxLength, Min, NotContains, ValidateBy, ValidateIf, ValidateNested } from 'class-validator';
import { parseDateOnly } from '../../../common/date/today.js';
import { ContractIdParamsDto } from './contracts-query.dto.js';

const present = (_object: unknown, value: unknown) => value !== undefined;
const nonnull = (_object: unknown, value: unknown) => value !== undefined && value !== null;
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

function DateOnly(): PropertyDecorator {
  return ValidateBy({ name: 'occupantDateOnly', validator: {
    validate: (value: unknown) => typeof value === 'string' && parseDateOnly(value) !== null,
  } }, { message: 'Ngày không hợp lệ, cần định dạng YYYY-MM-DD' });
}

class IdPhotoDto {
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã ảnh CCCD không hợp lệ' })
  @MaxLength(255, { message: 'Mã ảnh CCCD không hợp lệ' })
  assetId: string;

  @Matches(/\S/, { message: 'Mã ảnh CCCD không hợp lệ' })
  @MaxLength(255, { message: 'Mã ảnh CCCD không hợp lệ' })
  @NotContains('\0', { message: 'Mã ảnh CCCD không hợp lệ' })
  publicId: string;

  @IsInt({ message: 'Phiên bản ảnh CCCD không hợp lệ' })
  @Min(1, { message: 'Phiên bản ảnh CCCD không hợp lệ' })
  @Max(2147483647, { message: 'Phiên bản ảnh CCCD không hợp lệ' })
  version: number;

  @IsIn(['jpg', 'png', 'webp'], { message: 'Ảnh CCCD phải là JPG, PNG hoặc WebP' })
  format: string;
}

class OccupantFieldsDto {
  @ValidateIf(nonnull)
  @Transform(trim)
  @Matches(/^0[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string | null;

  @ValidateIf(nonnull)
  @DateOnly()
  dateOfBirth?: string | null;

  @ValidateIf(nonnull)
  @Matches(/^[0-9]{12}$/, { message: 'Số CCCD phải gồm đúng 12 chữ số' })
  idNumber?: string | null;

  @ValidateIf(nonnull)
  @IsObject({ message: 'Thông tin ảnh CCCD không hợp lệ' })
  @ValidateNested({ message: 'Thông tin ảnh CCCD không hợp lệ' })
  @Type(() => IdPhotoDto)
  idFront?: IdPhotoDto | null;

  @ValidateIf(nonnull)
  @IsObject({ message: 'Thông tin ảnh CCCD không hợp lệ' })
  @ValidateNested({ message: 'Thông tin ảnh CCCD không hợp lệ' })
  @Type(() => IdPhotoDto)
  idBack?: IdPhotoDto | null;

  @ValidateIf(nonnull)
  @DateOnly()
  moveOutDate?: string | null;
}

export class CreateOccupantDto extends OccupantFieldsDto {
  @Transform(trim)
  @Matches(/\S/, { message: 'Vui lòng nhập họ và tên người ở' })
  @MaxLength(100, { message: 'Họ và tên tối đa 100 ký tự' })
  @NotContains('\0', { message: 'Họ và tên không hợp lệ' })
  fullName: string;

  @DateOnly()
  moveInDate: string;
}

export class UpdateOccupantDto extends OccupantFieldsDto {
  @ValidateIf(present)
  @Transform(trim)
  @Matches(/\S/, { message: 'Vui lòng nhập họ và tên người ở' })
  @MaxLength(100, { message: 'Họ và tên tối đa 100 ký tự' })
  @NotContains('\0', { message: 'Họ và tên không hợp lệ' })
  fullName?: string;

  @ValidateIf(present)
  @DateOnly()
  moveInDate?: string;
}

export class OccupantIdParamsDto extends ContractIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: 'Mã người ở không hợp lệ' })
  @Min(1, { message: 'Mã người ở không hợp lệ' })
  @Max(2147483647, { message: 'Mã người ở không hợp lệ' })
  oid: number;
}
