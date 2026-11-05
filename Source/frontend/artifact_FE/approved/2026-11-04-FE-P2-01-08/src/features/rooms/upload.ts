import { apiRequest } from '../../shared/api'
import type { RoomImageAsset } from './api'

// ROOM-07: Cloudinary cannot sign a size limit, so the FE refuses big or other files before any signature is requested.
export const ROOM_IMAGE_MAX_BYTES = 5_000_000
export const ROOM_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const UPLOAD_FAILED = 'Tải ảnh lên không thành công, vui lòng thử lại.'

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

// FILE-01: the BE checks the room is in scope and returns the signed fields.
export function signUpload(roomId: number) {
  return apiRequest<SignedUpload>('/files/sign', { method: 'POST', body: { purpose: 'ROOM_IMAGE', roomId } })
}

// Sent straight to Cloudinary: no Bearer header and no cookie (credentials omitted), only the fields the BE signed.
export async function uploadToCloudinary(signed: SignedUpload, file: File): Promise<RoomImageAsset> {
  const form = new FormData()
  form.append('file', file)
  form.append('api_key', signed.apiKey)
  form.append('timestamp', String(signed.timestamp))
  form.append('folder', signed.folder)
  form.append('allowed_formats', signed.allowedFormats)
  form.append('transformation', signed.transformation)
  form.append('signature', signed.signature)

  let response: Response
  try {
    response = await fetch(signed.uploadUrl, { method: 'POST', body: form, credentials: 'omit' })
  } catch {
    throw new Error(UPLOAD_FAILED)
  }
  const body: CloudinaryUploadResponse = await response.json().catch(() => ({}))
  if (!response.ok || typeof body.asset_id !== 'string' || typeof body.public_id !== 'string'
    || typeof body.version !== 'number' || typeof body.format !== 'string') {
    throw new Error(UPLOAD_FAILED)
  }
  return { assetId: body.asset_id, publicId: body.public_id, version: body.version, format: body.format }
}
