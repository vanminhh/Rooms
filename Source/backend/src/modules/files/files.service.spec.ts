import { BadRequestException, ForbiddenException, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signRoomImageUpload, verifyRoomImage } from './files.service.js';
import { signParams } from './cloudinary.js';
import type { SignUploadDto } from './dto/sign.dto.js';

const env = { CLOUDINARY_URL: 'cloudinary://test-key:test-secret@rooms-demo' };
const image = {
  assetId: 'asset-id-immutable-001',
  publicId: 'rooms/7/42/living-room',
  version: 1730612345,
  format: 'jpg',
};
const metadata = {
  asset_id: image.assetId,
  public_id: image.publicId,
  version: image.version,
  format: image.format,
  resource_type: 'image',
  type: 'upload',
};

function dbForRoom() {
  return { room: { findFirst: vi.fn().mockResolvedValue({ id: 42, buildingId: 7 }) } } as never;
}

function cloudinaryResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('FILE-01 / SCOPE-02: signed room image upload', () => {
  // Prisma room lookup is the only outside edge; the real signer and scope checks run directly.
  const uploadEnv = { CLOUDINARY_URL: 'cloudinary://test-key:test-secret@rooms-demo' };
  const now = new Date('2026-11-03T03:04:05.000Z');
  const dto: SignUploadDto = { purpose: 'ROOM_IMAGE', roomId: 42 };
  const roomDb = (room: { id: number; buildingId: number; isActive: boolean } | null) => ({
    room: { findFirst: vi.fn().mockResolvedValue(room) },
  }) as never;

  it('FILE-01: fixes folder, allowed formats, incoming transformation, timestamp and signed upload URL without exposing the API secret', async () => {
    const result = await signRoomImageUpload(roomDb({ id: 42, buildingId: 7, isActive: true }), { buildingIds: [7] }, dto, uploadEnv, now);

    expect(result).toMatchObject({
      cloudName: 'rooms-demo',
      apiKey: 'test-key',
      uploadUrl: 'https://api.cloudinary.com/v1_1/rooms-demo/image/upload',
      timestamp: Math.floor(now.getTime() / 1000),
      folder: 'rooms/7/42',
      allowedFormats: 'jpg,png,webp',
      transformation: 'c_limit,w_1920,h_1920',
    });
    expect(result.signature).toBe(signParams({
      timestamp: result.timestamp,
      folder: 'rooms/7/42',
      allowed_formats: 'jpg,png,webp',
      transformation: 'c_limit,w_1920,h_1920',
    }, 'test-secret'));
    expect(JSON.stringify(result)).not.toContain('test-secret');
    expect(result).not.toHaveProperty('apiSecret');
  });

  it('FILE-01 / SCOPE-02: Boss can sign for an active room in any building', async () => {
    const result = await signRoomImageUpload(roomDb({ id: 42, buildingId: 7, isActive: true }), { buildingIds: null }, dto, uploadEnv, now);
    expect(result.folder).toBe('rooms/7/42');
  });

  it('FILE-01 / SCOPE-02: manager outside the room building receives 403 OUT_OF_SCOPE', async () => {
    try {
      await signRoomImageUpload(roomDb({ id: 42, buildingId: 7, isActive: true }), { buildingIds: [9] }, dto, uploadEnv, now);
      throw new Error('Expected out-of-scope room to reject');
    } catch (error) {
      expect((error as ForbiddenException).getStatus()).toBe(403);
      expect((error as ForbiddenException).getResponse()).toMatchObject({ message: 'OUT_OF_SCOPE' });
    }
  });

  it.each([
    ['missing room', null],
    ['inactive room', { id: 42, buildingId: 7, isActive: false }],
  ] as const)('FILE-01: %s returns 404 and cannot be signed', async (_label, room) => {
    await expect(signRoomImageUpload(roomDb(room), { buildingIds: null }, dto, uploadEnv, now)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('FILE-01: missing Cloudinary configuration returns 503 before querying the room', async () => {
    const db = roomDb({ id: 42, buildingId: 7, isActive: true }) as { room: { findFirst: ReturnType<typeof vi.fn> } };
    await expect(signRoomImageUpload(db as never, { buildingIds: [7] }, dto, {}, now)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.room.findFirst).not.toHaveBeenCalled();
  });
});

describe('FILE-02: Cloudinary asset metadata verification', () => {
  // The room lookup is an outside DB edge; Cloudinary is an outside HTTP edge. Both are stubbed, while verifyRoomImage runs directly.
  it('FILE-02: verifies immutable asset ID with Basic Auth and returns a BE-built URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(cloudinaryResponse(metadata));
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyRoomImage(dbForRoom(), 42, image, env)).resolves.toEqual({
      assetId: image.assetId,
      publicId: image.publicId,
      url: 'https://res.cloudinary.com/rooms-demo/image/upload/v1730612345/rooms/7/42/living-room.jpg',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestUrl).toBe('https://api.cloudinary.com/v1_1/rooms-demo/resources/asset-id-immutable-001');
    expect(request?.method).toBe('GET');
    expect(request?.headers).toEqual({ authorization: `Basic ${Buffer.from('test-key:test-secret').toString('base64')}` });
  });

  it.each([
    ['asset_id', 'another-asset-id'],
    ['public_id', 'rooms/7/42/renamed'],
    ['version', 1730612346],
    ['format', 'png'],
    ['resource_type', 'video'],
    ['type', 'private'],
  ])('FILE-02: rejects Cloudinary metadata mismatch in %s as VALIDATION_FAILED', async (field, actual) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(cloudinaryResponse({ ...metadata, [field]: actual })));
    try {
      await verifyRoomImage(dbForRoom(), 42, image, env);
      throw new Error('Expected metadata mismatch to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'VALIDATION_FAILED' });
    }
  });

  it('FILE-02: rejects an unknown Cloudinary asset ID as VALIDATION_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(cloudinaryResponse({ error: { message: 'not found' } }, 404)));
    await expect(verifyRoomImage(dbForRoom(), 42, image, env)).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', fields: { assetId: expect.any(String) } },
      status: 400,
    });
  });

  it.each([
    ['missing assetId', { ...image, assetId: '' }, 'assetId'],
    ['publicId outside the room folder', { ...image, publicId: 'rooms/7/99/other' }, 'publicId'],
    ['path traversal', { ...image, publicId: 'rooms/7/42/../other' }, 'publicId'],
    ['GIF format', { ...image, format: 'gif' }, 'format'],
    ['SVG format', { ...image, format: 'svg' }, 'format'],
    ['zero version', { ...image, version: 0 }, 'version'],
  ])('FILE-02: rejects %s before contacting Cloudinary', async (_case, invalidInput, field) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifyRoomImage(dbForRoom(), 42, invalidInput, env)).rejects.toMatchObject({
      response: { code: 'VALIDATION_FAILED', fields: { [field]: expect.any(String) } },
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('FILE-02: reports missing Cloudinary configuration as UPLOAD_NOT_CONFIGURED without querying the room', async () => {
    const db = dbForRoom();
    await expect(verifyRoomImage(db, 42, image, {})).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(verifyRoomImage(db, 42, image, {})).rejects.toMatchObject({
      status: 503,
      response: { message: 'UPLOAD_NOT_CONFIGURED', statusCode: 503 },
    });
    expect((db as { room: { findFirst: ReturnType<typeof vi.fn> } }).room.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['5xx response', () => cloudinaryResponse({ error: { message: 'test-secret' } }, 503)],
    ['network timeout', () => { throw new Error('test-secret request failed'); }],
  ])('FILE-02: maps Cloudinary %s to generic INTERNAL_ERROR without exposing credentials', async (_case, respond) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(respond));
    try {
      await verifyRoomImage(dbForRoom(), 42, image, env);
      throw new Error('Expected Cloudinary failure to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect((error as InternalServerErrorException).getStatus()).toBe(500);
      const exposed = JSON.stringify((error as InternalServerErrorException).getResponse());
      expect(exposed).toContain('INTERNAL_ERROR');
      expect(exposed).not.toContain('test-key');
      expect(exposed).not.toContain('test-secret');
    }
  });
});
