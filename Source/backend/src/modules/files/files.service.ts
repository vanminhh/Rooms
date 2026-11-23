import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { ErrorCode } from '../../common/errors/error-code.js';
import { scopeWhere } from '../../common/scope/scope.js';
import {
  ALLOWED_FORMATS,
  type CloudinaryConfig,
  contractAssetFolder,
  deliveryUrl,
  INCOMING_TRANSFORMATION,
  parseCloudinaryUrl,
  roomImageFolder,
  signParams,
} from './cloudinary.js';
import type { ContractUploadPurpose } from './dto/sign.dto.js';

export interface SignedUpload {
  cloudName: string; apiKey: string; uploadUrl: string; timestamp: number;
  folder: string; allowedFormats: string; transformation: string; signature: string;
}

export interface SignedContractUpload extends Omit<SignedUpload, 'transformation'> {
  type: 'authenticated';
  publicId: string;
  overwrite: false;
}

function cloudinaryConfig(env: NodeJS.ProcessEnv): CloudinaryConfig {
  const cfg = parseCloudinaryUrl(env.CLOUDINARY_URL);
  if (!cfg) throw new ServiceUnavailableException(ErrorCode.UPLOAD_NOT_CONFIGURED);
  return cfg;
}

// FILE-01: the room must be in the caller's scope; the signature fixes folder, formats and size.
export async function signRoomImageUpload(
  db: Pick<PrismaClient, 'room'>,
  user: { buildingIds: number[] | null },
  dto: { roomId: number },
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
  folderOf: (buildingId: number, roomId: number) => string = roomImageFolder,
): Promise<SignedUpload> {
  const cfg = cloudinaryConfig(env);

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
  const folder = folderOf(room.buildingId, room.id);
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

const CONTRACT_UPLOAD = {
  CONTRACT_SCAN: { formats: [...ALLOWED_FORMATS, 'pdf'], publicIdPrefix: 'contract-scan-' },
  ID_PHOTO: { formats: ALLOWED_FORMATS, publicIdPrefix: 'id-photo-' },
} satisfies Record<ContractUploadPurpose, { formats: readonly string[]; publicIdPrefix: string }>;

async function findContract(db: Pick<PrismaClient, 'contract'>, contractId: number) {
  const contract = await db.contract.findUnique({
    where: { id: contractId },
    select: { id: true, buildingId: true },
  });
  if (!contract) throw new NotFoundException(ErrorCode.NOT_FOUND);
  return contract;
}

// FILE-01 / D-37: Cloudinary signs delivery type as a form parameter on /image/upload.
export async function signContractUpload(
  db: Pick<PrismaClient, 'contract'>,
  user: { buildingIds: number[] | null },
  purpose: ContractUploadPurpose,
  contractId: number,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<SignedContractUpload> {
  cloudinaryConfig(env);
  const contract = await findContract(db, contractId);
  const allowedBuildings = scopeWhere(user).buildingId?.in;
  if (allowedBuildings && !allowedBuildings.includes(contract.buildingId)) {
    throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
  }

  return createContractUploadSignature(contract, purpose, env, now);
}

// Call only after staff scope or tenant ownership/lifecycle has been checked.
export function createContractUploadSignature(
  contract: { id: number; buildingId: number }, purpose: ContractUploadPurpose,
  env: NodeJS.ProcessEnv = process.env, now: Date = new Date(),
): SignedContractUpload {
  const cfg = cloudinaryConfig(env);
  const timestamp = Math.floor(now.getTime() / 1_000);
  const folder = contractAssetFolder(contract.buildingId, contract.id);
  const policy = CONTRACT_UPLOAD[purpose];
  const allowedFormats = policy.formats.join(',');
  const type = 'authenticated';
  const publicId = policy.publicIdPrefix + randomUUID();
  // Bind the purpose and prevent reuse of the signature from replacing this asset.
  const signature = signParams({
    timestamp, folder, allowed_formats: allowedFormats, type, public_id: publicId, overwrite: 'false',
  }, cfg.apiSecret);
  return {
    cloudName: cfg.cloudName, apiKey: cfg.apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`,
    timestamp, folder, allowedFormats, type, publicId, overwrite: false, signature,
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

async function fetchAssetMetadata(
  cfg: CloudinaryConfig, assetId: string, notFoundMessage: string,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${cfg.cloudName}/resources/${encodeURIComponent(assetId)}`,
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
  if (response.status === 404) throw invalidImage({ assetId: notFoundMessage });
  if (!response.ok) throw cloudinaryFailure();

  let metadata: unknown;
  try {
    metadata = await response.json();
  } catch {
    throw cloudinaryFailure();
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw cloudinaryFailure();
  return metadata as Record<string, unknown>;
}

// FILE-02: verify Cloudinary metadata by immutable asset ID, then build the delivery URL on the BE.
export async function verifyRoomImage(
  db: Pick<PrismaClient, 'room'>,
  roomId: number,
  image: RoomImageUploadMetadata,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ assetId: string; publicId: string; url: string }> {
  const cfg = cloudinaryConfig(env);

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

  const metadata = await fetchAssetMetadata(cfg, image.assetId, 'Không tìm thấy ảnh trên Cloudinary');

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

function isContractAssetId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[^A-Za-z0-9_-]/.test(value);
}

// FILE-02 / CON-06: only a verified ID can be stored against a contract.
export async function verifyContractAsset(
  db: Pick<PrismaClient, 'contract'>,
  contractId: number,
  purpose: ContractUploadPurpose,
  upload: RoomImageUploadMetadata,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const cfg = cloudinaryConfig(env);
  const contract = await findContract(db, contractId);
  const folder = contractAssetFolder(contract.buildingId, contract.id);
  const prefix = folder + '/';
  const leaf = typeof upload?.publicId === 'string' && upload.publicId.startsWith(prefix)
    ? upload.publicId.slice(prefix.length)
    : '';
  const format = typeof upload?.format === 'string' ? upload.format.toLowerCase() : '';
  const policy = CONTRACT_UPLOAD[purpose];
  const fields: Record<string, string> = {};
  if (!isContractAssetId(upload?.assetId)) fields.assetId = 'Mã tài sản Cloudinary không hợp lệ';
  if (!leaf.trim() || leaf === '.' || leaf.includes('/') || leaf.includes('..')) {
    fields.publicId = 'Tài liệu không thuộc hợp đồng này';
  } else if (!leaf.startsWith(policy.publicIdPrefix) || leaf.length === policy.publicIdPrefix.length) {
    fields.publicId = 'Mục đích tải tài liệu không khớp';
  }
  if (!policy.formats.includes(format)) fields.format = 'Định dạng tài liệu không được hỗ trợ';
  if (!Number.isInteger(upload?.version) || upload.version <= 0) fields.version = 'Phiên bản tài liệu không hợp lệ';
  if (Object.keys(fields).length > 0) throw invalidImage(fields);

  const metadata = await fetchAssetMetadata(cfg, upload.assetId, 'Không tìm thấy tài liệu trên Cloudinary');
  const mismatches: Record<string, string> = {};
  if (metadata.asset_id !== upload.assetId || metadata.resource_type !== 'image' || metadata.type !== 'authenticated') {
    mismatches.assetId = 'Tài sản Cloudinary riêng tư không hợp lệ';
  }
  if (metadata.public_id !== upload.publicId || (metadata.asset_folder !== undefined && metadata.asset_folder !== folder)) {
    mismatches.publicId = 'Tài liệu không thuộc hợp đồng này';
  }
  if (metadata.version !== upload.version) mismatches.version = 'Phiên bản tài liệu Cloudinary không khớp';
  if (metadata.format !== format) mismatches.format = 'Định dạng tài liệu Cloudinary không khớp';
  if (Object.keys(mismatches).length > 0) throw invalidImage(mismatches);

  return upload.assetId;
}

// CON-16: callers authorize and audit access before signing a stored asset ID.
export function signedContractAssetUrl(
  assetId: string,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): { url: string; expiresAt: string } {
  const cfg = cloudinaryConfig(env);
  if (!isContractAssetId(assetId)) throw invalidImage({ assetId: 'Mã tài sản Cloudinary không hợp lệ' });
  const timestamp = Math.floor(now.getTime() / 1_000);
  const expiresAt = timestamp + 300;
  const signature = signParams({ asset_id: assetId, timestamp, expires_at: expiresAt }, cfg.apiSecret);
  const query = new URLSearchParams({
    asset_id: assetId, timestamp: String(timestamp), expires_at: String(expiresAt), api_key: cfg.apiKey, signature,
  });
  return {
    url: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/asset/download?${query}`,
    expiresAt: new Date(expiresAt * 1_000).toISOString(),
  };
}

// ROOM-07: destruction is keyed only by the immutable asset ID, never by a reusable public ID.
export async function destroyRoomImageByAssetId(
  assetId: string,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Promise<void> {
  const cfg = cloudinaryConfig(env);
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
