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

export function deliveryUrl(cloudName: string, publicId: string, version: number, format: string): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/v${version}/${publicId}.${format}`;
}

// ROOM-07: JPG, PNG, WebP only.
export const ALLOWED_FORMATS: readonly string[] = ['jpg', 'png', 'webp'];
// FILE-01: long side ≤ 1920 px (A2-8).
export const INCOMING_TRANSFORMATION = 'c_limit,w_1920,h_1920';
