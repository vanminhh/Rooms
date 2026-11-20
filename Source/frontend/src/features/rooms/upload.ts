import { apiRequest } from '../../shared/api'
import type { RoomImageAsset } from './api'

// ROOM-07: Cloudinary cannot sign a size limit, so the FE refuses big or other files before any signature is requested.
export const ROOM_IMAGE_MAX_BYTES = 5_000_000
export const ROOM_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export type UploadPurpose = 'ROOM_IMAGE' | 'CONTRACT_SCAN' | 'ID_PHOTO'
export type PrivateUploadPurpose = Exclude<UploadPurpose, 'ROOM_IMAGE'>
export const UPLOAD_FILE_TYPES: Record<UploadPurpose, readonly string[]> = {
  ROOM_IMAGE: ROOM_IMAGE_TYPES,
  CONTRACT_SCAN: [...ROOM_IMAGE_TYPES, 'application/pdf'],
  ID_PHOTO: ROOM_IMAGE_TYPES,
}

const UPLOAD_FAILED = 'Tải ảnh lên không thành công, vui lòng thử lại.'
const PRIVATE_UPLOAD_FAILED = 'Tải tài liệu lên không thành công, vui lòng thử lại.'

export interface SignedUpload {
  cloudName: string
  apiKey: string
  uploadUrl: string
  timestamp: number
  folder: string
  allowedFormats: string
  transformation: string
  signature: string
}

export interface SignedContractUpload extends Omit<SignedUpload, 'transformation'> {
  type: 'authenticated'
  publicId: string
  overwrite: false
}

interface CloudinaryUploadResponse {
  asset_id?: unknown
  public_id?: unknown
  version?: unknown
  format?: unknown
}

export function assertRoomImageFile(file: File): void {
  if (!ROOM_IMAGE_TYPES.includes(file.type)) throw new Error('Ảnh không đúng định dạng cho phép.')
  if (file.size > ROOM_IMAGE_MAX_BYTES) throw new Error('Ảnh vượt quá 5 MB, hãy chọn ảnh nhỏ hơn.')
}

export function assertUploadFile(file: File, purpose: UploadPurpose): void {
  if (purpose === 'ROOM_IMAGE') return assertRoomImageFile(file)
  if (!UPLOAD_FILE_TYPES[purpose]?.includes(file.type)) {
    throw new Error(purpose === 'CONTRACT_SCAN' ? 'Bản hợp đồng phải là JPG, PNG, WebP hoặc PDF.' : 'Ảnh CCCD phải là JPG, PNG hoặc WebP.')
  }
  // Private upload size is not specified by the current API; do not inherit the ROOM_IMAGE-only limit.
}

// FILE-01: preserve signUpload(roomId); private purposes use contractId and authenticated fields.
export function signUpload(roomId: number, purpose?: 'ROOM_IMAGE'): Promise<SignedUpload>
export function signUpload(contractId: number, purpose: PrivateUploadPurpose): Promise<SignedContractUpload>
export async function signUpload(targetId: number, purpose: UploadPurpose = 'ROOM_IMAGE'): Promise<SignedUpload | SignedContractUpload> {
  const signed = await apiRequest<SignedUpload | SignedContractUpload>('/files/sign', { method: 'POST', body:
    purpose === 'ROOM_IMAGE' ? { purpose, roomId: targetId } : { purpose, contractId: targetId },
  })
  if (purpose !== 'ROOM_IMAGE' && !isPrivateSignature(signed)) throw new Error(PRIVATE_UPLOAD_FAILED)
  return signed
}

export async function signMyIdPhotoUpload(contractId: number): Promise<SignedContractUpload> {
  const signed = await apiRequest<unknown>(`/me/contracts/${contractId}/id-photo-sign`, { method: 'POST' })
  if (!isPrivateSignature(signed)) throw new Error(PRIVATE_UPLOAD_FAILED)
  return signed
}

function isPrivateSignature(signed: unknown): signed is SignedContractUpload {
  return typeof signed === 'object' && signed !== null && 'type' in signed && signed.type === 'authenticated' && 'publicId' in signed &&
    typeof signed.publicId === 'string' && signed.publicId.trim().length > 0 && 'overwrite' in signed && signed.overwrite === false
}

// Sent straight to Cloudinary: no Bearer header and no cookie (credentials omitted), only the fields the BE signed.
export async function uploadToCloudinary(signed: SignedUpload | SignedContractUpload, file: File): Promise<RoomImageAsset> {
  if (!signed || typeof signed !== 'object') throw new Error(UPLOAD_FAILED)
  const privateUpload = 'type' in signed || 'publicId' in signed || 'overwrite' in signed
  const failure = privateUpload ? PRIVATE_UPLOAD_FAILED : UPLOAD_FAILED
  if (privateUpload ? !isPrivateSignature(signed) : !('transformation' in signed) || typeof signed.transformation !== 'string' || !signed.transformation) {
    throw new Error(failure)
  }
  const form = new FormData()
  form.append('file', file)
  form.append('api_key', signed.apiKey)
  form.append('timestamp', String(signed.timestamp))
  form.append('folder', signed.folder)
  form.append('allowed_formats', signed.allowedFormats)
  if (isPrivateSignature(signed)) {
    form.append('type', signed.type)
    form.append('public_id', signed.publicId)
    form.append('overwrite', String(signed.overwrite))
  } else if ('transformation' in signed) form.append('transformation', signed.transformation)
  form.append('signature', signed.signature)

  let response: Response
  try {
    response = await fetch(signed.uploadUrl, { method: 'POST', body: form, credentials: 'omit' })
  } catch {
    throw new Error(failure)
  }
  const parsed: unknown = await response.json().catch(() => null)
  const body: CloudinaryUploadResponse = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  if (!response.ok || typeof body.asset_id !== 'string' || typeof body.public_id !== 'string'
    || typeof body.version !== 'number' || !Number.isInteger(body.version) || body.version <= 0 || typeof body.format !== 'string') {
    throw new Error(failure)
  }
  return { assetId: body.asset_id, publicId: body.public_id, version: body.version, format: body.format }
}
