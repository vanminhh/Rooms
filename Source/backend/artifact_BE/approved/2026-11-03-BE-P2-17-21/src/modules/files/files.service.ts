import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.js';
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
  user: { buildingIds: number[] | null },
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

export interface RoomImageUploadMetadata {
  assetId: string;
  publicId: string;
  version: number;
  format: string;
}

function invalidImage(fields: Record<string, string>): BadRequestException {
  return new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields });
}

function cloudinaryFailure(): InternalServerErrorException {
  return new InternalServerErrorException(ErrorCode.INTERNAL_ERROR);
}

// FILE-02: verify Cloudinary metadata by immutable asset ID, then build the delivery URL on the BE.
export async function verifyRoomImage(
  db: Pick<PrismaClient, 'room'>,
  roomId: number,
  image: RoomImageUploadMetadata,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ assetId: string; publicId: string; url: string }> {
  const cfg = parseCloudinaryUrl(env.CLOUDINARY_URL);
  if (!cfg) throw new ServiceUnavailableException(ErrorCode.UPLOAD_NOT_CONFIGURED);

  const room = await db.room.findFirst({
    where: { id: roomId },
    select: { id: true, buildingId: true },
  });
  if (!room) throw new NotFoundException(ErrorCode.NOT_FOUND);

  const folder = roomImageFolder(room.buildingId, room.id);
  const rest = typeof image.publicId === 'string' && image.publicId.startsWith(`${folder}/`)
    ? image.publicId.slice(folder.length + 1)
    : '';
  const format = typeof image.format === 'string' ? image.format.toLowerCase() : '';
  const fields: Record<string, string> = {};
  if (typeof image.assetId !== 'string' || image.assetId.trim().length === 0) {
    fields.assetId = 'Mã tài sản Cloudinary không hợp lệ';
  }
  if (!rest || rest.includes('/') || rest.includes('..')) fields.publicId = 'Ảnh không thuộc phòng này';
  if (!ALLOWED_FORMATS.includes(format)) fields.format = 'Định dạng ảnh không được hỗ trợ';
  if (!Number.isInteger(image.version) || image.version <= 0) fields.version = 'Phiên bản ảnh không hợp lệ';
  if (Object.keys(fields).length > 0) throw invalidImage(fields);

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${cfg.cloudName}/resources/${encodeURIComponent(image.assetId)}`,
      {
        method: 'GET',
        headers: {
          authorization: `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64')}`,
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
  } catch {
    throw cloudinaryFailure();
  }

  if (response.status === 404) throw invalidImage({ assetId: 'Không tìm thấy ảnh trên Cloudinary' });
  if (!response.ok) throw cloudinaryFailure();

  let metadata: Record<string, unknown>;
  try {
    metadata = await response.json() as Record<string, unknown>;
  } catch {
    throw cloudinaryFailure();
  }

  const mismatches: Record<string, string> = {};
  if (metadata.asset_id !== image.assetId) mismatches.assetId = 'Mã tài sản Cloudinary không khớp';
  if (metadata.public_id !== image.publicId) mismatches.publicId = 'Mã ảnh Cloudinary không khớp';
  if (metadata.version !== image.version) mismatches.version = 'Phiên bản ảnh Cloudinary không khớp';
  if (metadata.format !== format) mismatches.format = 'Định dạng ảnh Cloudinary không khớp';
  if (metadata.resource_type !== 'image') mismatches.assetId = 'Tài sản Cloudinary không phải ảnh';
  if (metadata.type !== 'upload') mismatches.assetId = 'Ảnh Cloudinary không dùng kiểu tải lên';
  if (Object.keys(mismatches).length > 0) throw invalidImage(mismatches);

  return {
    assetId: image.assetId,
    publicId: image.publicId,
    url: deliveryUrl(cfg.cloudName, image.publicId, image.version, format),
  };
}

// ROOM-07: destruction is keyed only by the immutable asset ID, never by a reusable public ID.
export async function destroyRoomImageByAssetId(
  assetId: string,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<void> {
  const cfg = parseCloudinaryUrl(env.CLOUDINARY_URL);
  if (!cfg) throw new ServiceUnavailableException(ErrorCode.UPLOAD_NOT_CONFIGURED);
  if (typeof assetId !== 'string' || assetId.trim().length === 0) {
    throw invalidImage({ assetId: 'Mã tài sản Cloudinary không hợp lệ' });
  }

  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = signParams({ asset_id: assetId, timestamp }, cfg.apiSecret);
  const body = new URLSearchParams({
    asset_id: assetId,
    timestamp: String(timestamp),
    api_key: cfg.apiKey,
    signature,
  });

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/destroy`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw cloudinaryFailure();
  } catch (error) {
    if (error instanceof InternalServerErrorException) throw error;
    throw cloudinaryFailure();
  }
}
