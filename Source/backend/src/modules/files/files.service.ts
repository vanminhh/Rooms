import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import {
  ALLOWED_FORMATS,
  deliveryUrl,
  INCOMING_TRANSFORMATION,
  parseCloudinaryUrl,
  roomImageFolder,
  signParams,
} from './cloudinary.js';
import type { SignUploadDto } from './dto/sign.dto.js';

export interface SignedUpload {
  cloudName: string; apiKey: string; uploadUrl: string; timestamp: number;
  folder: string; allowedFormats: string; transformation: string; signature: string;
}

// FILE-01: the room must be in the caller's scope; the signature fixes folder, formats and size.
export async function signRoomImageUpload(
  db: Pick<PrismaClient, 'room'>,
  user: Pick<AuthUser, 'buildingIds'>,
  dto: SignUploadDto,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<SignedUpload> {
  const cfg = parseCloudinaryUrl(env.CLOUDINARY_URL);
  if (!cfg) throw new ServiceUnavailableException(ErrorCode.UPLOAD_NOT_CONFIGURED);

  const room = await db.room.findFirst({
    where: { id: dto.roomId },
    select: { id: true, buildingId: true, isActive: true },
  });
  if (!room?.isActive) throw new NotFoundException(ErrorCode.NOT_FOUND);
  // SCOPE-02 on one id: null = BOSS (every building).
  if (user.buildingIds !== null && !user.buildingIds.includes(room.buildingId)) {
    throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
  }

  const timestamp = Math.floor(now.getTime() / 1000);
  const folder = roomImageFolder(room.buildingId, room.id);
  const allowedFormats = ALLOWED_FORMATS.join(',');
  const transformation = INCOMING_TRANSFORMATION;
  const signature = signParams(
    { timestamp, folder, allowed_formats: allowedFormats, transformation },
    cfg.apiSecret,
  );
  return {
    cloudName: cfg.cloudName,
    apiKey: cfg.apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`,
    timestamp,
    folder,
    allowedFormats,
    transformation,
    signature,
  };
}

// FILE-02: the client sends back only publicId, version and format; the URL is built here, never stored from the client.
export async function verifyRoomImage(
  db: Pick<PrismaClient, 'room'>,
  roomId: number,
  image: { publicId: string; version: number; format: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ publicId: string; url: string }> {
  const cfg = parseCloudinaryUrl(env.CLOUDINARY_URL);
  if (!cfg) throw new ServiceUnavailableException(ErrorCode.UPLOAD_NOT_CONFIGURED);

  // No isActive check and no scope check here: the caller (room images) has already filtered by scope.
  const room = await db.room.findFirst({
    where: { id: roomId },
    select: { id: true, buildingId: true },
  });
  if (!room) throw new NotFoundException(ErrorCode.NOT_FOUND);

  const folder = roomImageFolder(room.buildingId, room.id);
  const rest = image.publicId.startsWith(`${folder}/`) ? image.publicId.slice(folder.length + 1) : '';
  const format = image.format.toLowerCase();

  const fields: Record<string, string> = {};
  if (!rest || rest.includes('/') || rest.includes('..')) fields.publicId = 'Ảnh không thuộc phòng này';
  if (!ALLOWED_FORMATS.includes(format)) fields.format = 'Định dạng ảnh không được hỗ trợ';
  if (!Number.isInteger(image.version) || image.version <= 0) fields.version = 'Phiên bản ảnh không hợp lệ';
  if (Object.keys(fields).length > 0) {
    throw new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields });
  }

  return {
    publicId: image.publicId,
    url: deliveryUrl(cfg.cloudName, image.publicId, image.version, format),
  };
}
