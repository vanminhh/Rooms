import {
  ALLOWED_FORMATS,
  deliveryUrl,
  INCOMING_TRANSFORMATION,
  parseCloudinaryUrl,
  roomImageFolder,
  signParams,
} from './cloudinary.js';

// CP-5 (BE-P2-07) · FILE-01, ROOM-07. Pure functions, no DB, no network: node:crypto only.
// Outside edge: none to fake — createHash is Node's own crypto, exercised for real.

describe('CP-5 / BE-P2-07 / FILE-01: signParams, Cloudinary "Authentication signatures" vectors', () => {
  it('FILE-01 scenario 1a: official vector timestamp=1315060510 + secret abcd', () => {
    expect(signParams({ timestamp: 1315060510 }, 'abcd')).toBe(
      'a21ad0f63beb4de2e5575204b79ab90bffb02c10',
    );
  });

  it('FILE-01 scenario 1b: official vector public_id/timestamp/eager + secret abcd', () => {
    expect(
      signParams(
        {
          public_id: 'sample_image',
          timestamp: 1315060510,
          eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
        },
        'abcd',
      ),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('FILE-01 scenario 2: key order in the input object does not change the signature (always sorted by key)', () => {
    const a = signParams({ timestamp: 1315060510, folder: 'rooms/1/2' }, 'abcd');
    const b = signParams({ folder: 'rooms/1/2', timestamp: 1315060510 }, 'abcd');
    expect(a).toBe(b);
  });

  it('FILE-01 scenario 3: file, cloud_name, resource_type, api_key and empty values are dropped from the signed string', () => {
    const withNoise = signParams(
      {
        timestamp: 1315060510,
        file: 'should-be-dropped',
        cloud_name: 'demo',
        resource_type: 'image',
        api_key: '123456',
        empty: '',
      },
      'abcd',
    );
    const clean = signParams({ timestamp: 1315060510 }, 'abcd');
    expect(withNoise).toBe(clean);
  });
});

describe('CP-5 / BE-P2-07 / FILE-01: parseCloudinaryUrl', () => {
  it('FILE-01 scenario 4: cloudinary://<key>:<secret>@<cloud> parses into its 3 parts', () => {
    expect(parseCloudinaryUrl('cloudinary://123:abcXYZ@demo')).toEqual({
      cloudName: 'demo',
      apiKey: '123',
      apiSecret: 'abcXYZ',
    });
  });

  it.each([
    ['undefined', undefined],
    ['empty string', ''],
    ['wrong scheme', 'https://x'],
    ['missing secret', 'cloudinary://thieu@demo'],
  ])('FILE-01 scenario 5 (%s): not a valid cloudinary:// URL -> null', (_label, value) => {
    expect(parseCloudinaryUrl(value)).toBeNull();
  });
});

describe('CP-5 / BE-P2-07 / FILE-01: roomImageFolder, deliveryUrl, ALLOWED_FORMATS, INCOMING_TRANSFORMATION', () => {
  it('FILE-01: roomImageFolder(buildingId, roomId) = rooms/<buildingId>/<roomId>', () => {
    expect(roomImageFolder(5, 42)).toBe('rooms/5/42');
  });

  it('FILE-02: deliveryUrl builds the exact Cloudinary delivery URL shape', () => {
    expect(deliveryUrl('demo', 'rooms/5/42/abc123', 1762000000, 'jpg')).toBe(
      'https://res.cloudinary.com/demo/image/upload/v1762000000/rooms/5/42/abc123.jpg',
    );
  });

  it('ROOM-07: ALLOWED_FORMATS is exactly jpg, png, webp', () => {
    expect(ALLOWED_FORMATS).toEqual(['jpg', 'png', 'webp']);
  });

  it('FILE-01 (A2-8): INCOMING_TRANSFORMATION limits the long side to 1920 px', () => {
    expect(INCOMING_TRANSFORMATION).toBe('c_limit,w_1920,h_1920');
  });
});
