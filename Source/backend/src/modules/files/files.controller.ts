import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.js';
import { type AuthUser, CurrentUser, Roles } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SignUploadDto } from './dto/sign.dto.js';
import { meterPhotoFolder } from './cloudinary.js';
import { type SignedContractUpload, type SignedUpload, signContractUpload, signRoomImageUpload, signRequestPhoto } from './files.service.js';

@Controller('files')
export class FilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('BOSS', 'MANAGER', 'TENANT')
  @Post('sign')
  sign(@CurrentUser() user: AuthUser, @Body() dto: SignUploadDto): Promise<SignedUpload | SignedContractUpload> {
    if (dto.purpose === 'REQUEST_PHOTO') {
      if (user.role !== 'TENANT') throw new ForbiddenException(ErrorCode.FORBIDDEN);
      return signRequestPhoto(this.prisma, user.id, dto.contractId!);
    }
    if (user.role !== 'BOSS' && user.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    if (dto.purpose === 'ROOM_IMAGE') return signRoomImageUpload(this.prisma, user, { roomId: dto.roomId! });
    if (dto.purpose === 'METER_PHOTO') return signRoomImageUpload(this.prisma, user, { roomId: dto.roomId! }, process.env, new Date(), meterPhotoFolder);
    return signContractUpload(this.prisma, user, dto.purpose, dto.contractId!);
  }
}
