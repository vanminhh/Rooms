import { Body, Controller, Post } from '@nestjs/common';
import { type AuthUser, CurrentUser, Roles } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SignUploadDto } from './dto/sign.dto.js';
import { type SignedContractUpload, type SignedUpload, signContractUpload, signRoomImageUpload } from './files.service.js';

@Controller('files')
export class FilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('BOSS', 'MANAGER')
  @Post('sign')
  sign(@CurrentUser() user: AuthUser, @Body() dto: SignUploadDto): Promise<SignedUpload | SignedContractUpload> {
    return dto.purpose === 'ROOM_IMAGE'
      ? signRoomImageUpload(this.prisma, user, { roomId: dto.roomId! })
      : signContractUpload(this.prisma, user, dto.purpose, dto.contractId!);
  }
}
