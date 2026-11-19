import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SignContractDto {
  @IsString({ message: 'Mã tài sản Cloudinary không hợp lệ' })
  @MinLength(1, { message: 'Mã tài sản Cloudinary không hợp lệ' })
  @MaxLength(255, { message: 'Mã tài sản Cloudinary không hợp lệ' })
  assetId: string;

  @IsString({ message: 'Mã bản scan không hợp lệ' })
  @MinLength(1, { message: 'Mã bản scan không hợp lệ' })
  @MaxLength(255, { message: 'Mã bản scan không hợp lệ' })
  publicId: string;

  @IsInt({ message: 'Phiên bản tài liệu không hợp lệ' })
  @Min(1, { message: 'Phiên bản tài liệu không hợp lệ' })
  @Max(2147483647, { message: 'Phiên bản tài liệu không hợp lệ' })
  version: number;

  @IsIn(['jpg', 'png', 'webp', 'pdf'], { message: 'Định dạng bản scan không hợp lệ' })
  format: string;
}
