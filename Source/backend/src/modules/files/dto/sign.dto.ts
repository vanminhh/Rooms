import { Transform, Type } from 'class-transformer';
import { IsIn, ValidateBy } from 'class-validator';

export type ContractUploadPurpose = 'CONTRACT_SCAN' | 'ID_PHOTO';

function UploadTargetId(field: 'roomId' | 'contractId', message: string): PropertyDecorator {
  return ValidateBy({
    name: 'uploadTargetId',
    validator: {
      validate(value: unknown, args): boolean {
        const { purpose } = args!.object as SignUploadDto;
        const contractUpload = purpose === 'CONTRACT_SCAN' || purpose === 'ID_PHOTO';
        const expectedField = contractUpload ? 'contractId' : 'roomId';
        if (field !== expectedField) return value === undefined;
        return typeof value === 'number' && Number.isInteger(value) && value >= 1
          && (!contractUpload || value <= 2147483647);
      },
    },
  }, { message });
}

// [ASSUMPTION] Vietnamese wording of these messages is proposed; the owner may edit it.
export class SignUploadDto {
  @IsIn(['ROOM_IMAGE', 'CONTRACT_SCAN', 'ID_PHOTO'], { message: 'Mục đích tải ảnh không hợp lệ' })
  purpose: 'ROOM_IMAGE' | ContractUploadPurpose;

  @Type(() => Number)
  @UploadTargetId('roomId', 'Mã phòng không hợp lệ')
  roomId?: number;

  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? Number(value) : value)
  @UploadTargetId('contractId', 'Mã hợp đồng không hợp lệ')
  contractId?: number;
}
