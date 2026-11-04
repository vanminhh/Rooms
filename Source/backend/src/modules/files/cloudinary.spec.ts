import { createHash } from 'node:crypto';
import { InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destroyRoomImageByAssetId } from './files.service.js';
import {
  ALLOWED_FORMATS,
  INCOMING_TRANSFORMATION,
  parseCloudinaryUrl,
  roomImageFolder,
  signParams,
} from './cloudinary.js';

const env = { CLOUDINARY_URL: 'cloudinary://test-key:test-secret@rooms-demo' };
const assetId = 'asset-id-immutable-001';
const fixedNow = new Date('2026-11-03T03:04:05.000Z');

function cloudinaryResponse(status = 200): Response {
  return new Response(JSON.stringify({ result: 'ok' }), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('FILE-01: Cloudinary upload signature contract', () => {
  it('FILE-01: matches the Cloudinary official signature vector for timestamp and secret', () => {
    expect(signParams({ timestamp: 1315060510 }, 'abcd')).toBe('a21ad0f63beb4de2e5575204b79ab90bffb02c10');
  });

  it('FILE-01: matches the Cloudinary official signature vector with public_id and eager parameters', () => {
    expect(signParams({
      public_id: 'sample_image',
      timestamp: 1315060510,
      eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
    }, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('FILE-01: sorts signed parameters independent of object insertion order', () => {
    expect(signParams({ timestamp: 1315060510, folder: 'rooms/1/2' }, 'abcd'))
      .toBe(signParams({ folder: 'rooms/1/2', timestamp: 1315060510 }, 'abcd'));
  });

  it('FILE-01: excludes upload-only metadata, API key, and empty values from the signed string', () => {
    const withNoise = signParams({
      timestamp: 1315060510,
      file: 'should-be-dropped',
      cloud_name: 'demo',
      resource_type: 'image',
      api_key: '123456',
      empty: '',
    }, 'abcd');
    expect(withNoise).toBe(signParams({ timestamp: 1315060510 }, 'abcd'));
  });

  it('FILE-01: parses the configured cloud name and API credentials', () => {
    expect(parseCloudinaryUrl('cloudinary://123:abcXYZ@demo')).toEqual({
      cloudName: 'demo',
      apiKey: '123',
      apiSecret: 'abcXYZ',
    });
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['wrong scheme', 'https://x'],
    ['missing secret', 'cloudinary://thieu@demo'],
  ])('FILE-01: rejects invalid Cloudinary URL configuration (%s)', (_label, value) => {
    expect(parseCloudinaryUrl(value)).toBeNull();
  });

  it('FILE-01: uses the room-specific folder and the required upload limits', () => {
    expect(roomImageFolder(5, 42)).toBe('rooms/5/42');
    expect(ALLOWED_FORMATS).toEqual(['jpg', 'png', 'webp']);
    expect(INCOMING_TRANSFORMATION).toBe('c_limit,w_1920,h_1920');
  });
});

describe('ROOM-07 / FILE-02: Cloudinary destruction by immutable asset ID', () => {
  // Cloudinary is the only external edge here; the real signer and destroy helper remain under test.
  it('ROOM-07 / FILE-02: posts a signed asset_id-only destroy request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(cloudinaryResponse());
    vi.stubGlobal('fetch', fetchMock);
    await expect(destroyRoomImageByAssetId(assetId, env, fixedNow)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cloudinary.com/v1_1/rooms-demo/image/destroy');
    expect(request?.method).toBe('POST');
    expect(request?.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    const form = request?.body as URLSearchParams;
    const timestamp = Math.floor(fixedNow.getTime() / 1000);
    const expectedSignature = createHash('sha1')
      .update(`asset_id=${assetId}&timestamp=${timestamp}test-secret`)
      .digest('hex');
    expect([...form.keys()].sort()).toEqual(['api_key', 'asset_id', 'signature', 'timestamp']);
    expect(form.get('asset_id')).toBe(assetId);
    expect(form.get('timestamp')).toBe(String(timestamp));
    expect(form.get('api_key')).toBe('test-key');
    expect(form.get('signature')).toBe(expectedSignature);
    expect(form.has('public_id')).toBe(false);
  });

  it('ROOM-07 / FILE-02: maps Cloudinary rejection to generic INTERNAL_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(cloudinaryResponse(503)));
    await expect(destroyRoomImageByAssetId(assetId, env, fixedNow)).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(destroyRoomImageByAssetId(assetId, env, fixedNow)).rejects.toMatchObject({
      status: 500,
      response: { message: 'INTERNAL_ERROR', statusCode: 500 },
    });
  });

  it('ROOM-07 / FILE-02: maps a network timeout to generic INTERNAL_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('test-secret')));
    try {
      await destroyRoomImageByAssetId(assetId, env, fixedNow);
      throw new Error('Expected Cloudinary failure to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(InternalServerErrorException);
      expect((error as InternalServerErrorException).getStatus()).toBe(500);
      expect(JSON.stringify((error as InternalServerErrorException).getResponse())).not.toContain('test-secret');
    }
  });

  it('ROOM-07 / FILE-02: reports missing Cloudinary configuration as UPLOAD_NOT_CONFIGURED', async () => {
    await expect(destroyRoomImageByAssetId(assetId, {}, fixedNow)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(destroyRoomImageByAssetId(assetId, {}, fixedNow)).rejects.toMatchObject({
      status: 503,
      response: { message: 'UPLOAD_NOT_CONFIGURED', statusCode: 503 },
    });
  });
});
