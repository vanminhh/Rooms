import { Body, Controller, Post } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SignUploadDto } from './dto/sign.dto.js';
import { meterPhotoFolder } from './cloudinary.js';
import { type SignedContractUpload, type SignedUpload, signContractUpload, signRoomImageUpload } from './files.service.js';

@Controller('files')
export class FilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('BOSS', 'MANAGER')
  @Post('sign')
  sign(@CurrentUser() user: AuthUser, @Body() dto: SignUploadDto): Promise<SignedUpload | SignedContractUpload> {
    if (dto.purpose === 'ROOM_IMAGE') return signRoomImageUpload(this.prisma, user, { roomId: dto.roomId! });
    if (dto.purpose === 'METER_PHOTO') return signRoomImageUpload(this.prisma, user, { roomId: dto.roomId! }, process.env, new Date(), meterPhotoFolder);
    return signContractUpload(this.prisma, user, dto.purpose, dto.contractId!);
  }
}
