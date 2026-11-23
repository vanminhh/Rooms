import { createHash } from 'node:crypto';

export interface CloudinaryConfig { cloudName: string; apiKey: string; apiSecret: string }

// Format: cloudinary://<api_key>:<api_secret>@<cloud_name>. Anything else (or unset) → null.
export function parseCloudinaryUrl(value: string | undefined): CloudinaryConfig | null {
  const m = /^cloudinary:\/\/([^:/@]+):([^@/]+)@([^/@?#]+)$/.exec(value ?? '');
  return m ? { cloudName: m[3], apiKey: m[1], apiSecret: m[2] } : null;
}

// Cloudinary rejects these from the signed string; `file` and `api_key` are sent but not signed.
const UNSIGNED_KEYS = new Set(['file', 'cloud_name', 'resource_type', 'api_key']);

// Cloudinary "Authentication signatures": sort by key, join k=v with &, append the secret with no separator, SHA-1 hex.
export function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((k) => !UNSIGNED_KEYS.has(k) && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}

export function roomImageFolder(buildingId: number, roomId: number): string {
  return `rooms/${buildingId}/${roomId}`;
}

// Q-P4-58: meter photos of one room, apart from the room gallery.
export function meterPhotoFolder(buildingId: number, roomId: number): string {
  return `meters/${buildingId}/${roomId}`;
}

// Q-P4-58 (D-38): a stored meter photo must be a delivery URL of that room's meter folder in our cloud.
// shortcut: checked by URL shape only (the BE signs the folder), not by a Cloudinary metadata call; add that if staff misuse it.
export function isMeterPhotoUrl(url: string, cloudName: string, buildingId: number, roomId: number): boolean {
  const prefix = `https://res.cloudinary.com/${cloudName}/image/upload/`;
  const folder = `${meterPhotoFolder(buildingId, roomId)}/`;
  const path = url.startsWith(prefix) ? url.slice(prefix.length).replace(/^v\d+\//, '') : '';
  return path.startsWith(folder) && /^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(path.slice(folder.length));
}

export function contractAssetFolder(buildingId: number, contractId: number): string {
  return `contracts/${buildingId}/${contractId}`;
}

export function deliveryUrl(cloudName: string, publicId: string, version: number, format: string): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/v${version}/${publicId}.${format}`;
}

// ROOM-07: JPG, PNG, WebP only.
export const ALLOWED_FORMATS: readonly string[] = ['jpg', 'png', 'webp'];
// FILE-01: long side ≤ 1920 px (A2-8).
export const INCOMING_TRANSFORMATION = 'c_limit,w_1920,h_1920';
