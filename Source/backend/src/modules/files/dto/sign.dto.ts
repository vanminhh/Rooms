import { Type } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';

// [ASSUMPTION] Vietnamese wording of these messages is proposed; the owner may edit it.
export class SignUploadDto {
  @IsIn(['ROOM_IMAGE'], { message: 'Mục đích tải ảnh không hợp lệ' })
  purpose: 'ROOM_IMAGE';

  @Type(() => Number)
  @IsInt({ message: 'Mã phòng không hợp lệ' })
  @Min(1, { message: 'Mã phòng không hợp lệ' })
  roomId: number;
}
