import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddRoomImageDto, CreateRoomDto, OrderRoomImagesDto, RoomIdParamsDto, RoomsQueryDto, UpdateRoomDto } from './rooms.dto.js';

async function invalidProperties(type: new () => object, input: unknown): Promise<string[]> {
  const dto = plainToInstance(type, input);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors.map(({ property }) => property);
}

describe('BE-P2-17 · rooms DTO validation', () => {
  it('ROOM-01: accepts empty furniture and an area at the maximum schema boundary', async () => {
    const dto = plainToInstance(CreateRoomDto, {
      buildingId: '1', code: '1234567890', floor: '1', areaM2: '9999.9', maxOccupants: '1', furniture: [],
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ buildingId: 1, code: '1234567890', floor: 1, areaM2: 9999.9, maxOccupants: 1, furniture: [] });
  });

  it.each([
    [{ areaM2: 0.0 }, 'areaM2'],
    [{ areaM2: 10000 }, 'areaM2'],
    [{ floor: 0 }, 'floor'],
    [{ floor: -1 }, 'floor'],
    [{ floor: 'G' }, 'floor'],
    [{ maxOccupants: 0 }, 'maxOccupants'],
    [{ code: '' }, 'code'],
    [{ code: '12345678901' }, 'code'],
    [{ buildingId: 0 }, 'buildingId'],
    [{ buildingId: 2147483648 }, 'buildingId'],
    [{ furniture: ['Giường', 2] }, 'furniture'],
  ])('ROOM-01: rejects invalid create field %#', async (patch, field) => {
    const input = { buildingId: 1, code: '101', floor: 1, areaM2: 20, ...patch };
    expect(await invalidProperties(CreateRoomDto, input)).toContain(field);
  });

  it('ROOM-01: floor accepts positive integer 1; string G is not the basement identifier', async () => {
    expect(await validate(plainToInstance(CreateRoomDto, { buildingId: 1, code: 'G01', floor: '1', areaM2: 20 }))).toEqual([]);
    expect(await invalidProperties(CreateRoomDto, { buildingId: 1, code: 'G01', floor: 'G', areaM2: 20 })).toContain('floor');
  });

  it('ROOM-02: price is rejected on POST and PATCH, and buildingId is rejected on PATCH', async () => {
    expect(await invalidProperties(CreateRoomDto, { buildingId: 1, code: '101', floor: 1, areaM2: 20, price: 2300000 })).toContain('price');
    expect(await invalidProperties(UpdateRoomDto, { price: 2300000 })).toContain('price');
    expect(await invalidProperties(UpdateRoomDto, { buildingId: 2 })).toContain('buildingId');
  });

  it.each(['0', '2147483648', '1.5'])('API-04: rejects room id outside positive int32: %s', async (id) => {
    expect(await invalidProperties(RoomIdParamsDto, { id })).toContain('id');
  });

  it('API-08, SCOPE-02: transforms supported query values and rejects invalid building id', async () => {
    const query = plainToInstance(RoomsQueryDto, { buildingId: '1', includeInactive: 'false', page: '1', limit: '100', sort: '-floor' });
    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({ buildingId: 1, includeInactive: false, page: 1, limit: 100, sort: '-floor' });
    expect(await invalidProperties(RoomsQueryDto, { buildingId: '0' })).toContain('buildingId');
  });

  it('API-02: accepts page 1 and limit boundaries 1 and 100', async () => {
    for (const input of [
      { page: '1', limit: '1' },
      { page: '2147483647', limit: '100' },
    ]) {
      const query = plainToInstance(RoomsQueryDto, input);
      expect(await validate(query)).toEqual([]);
    }
  });

  it.each([
    [{ page: '0' }, 'page'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ page: '1.5' }, 'page'],
  ])('API-02: rejects invalid pagination query %#', async (patch, field) => {
    expect(await invalidProperties(RoomsQueryDto, patch)).toContain(field);
  });

  it.each(['jpg', 'png', 'webp'] as const)('ROOM-07/FILE-02: accepts only Cloudinary metadata for %s images', async (format) => {
    const dto = plainToInstance(AddRoomImageDto, {
      assetId: 'asset-id-immutable-001', publicId: 'rooms/10/101/room-main', version: '2147483647', format,
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ assetId: 'asset-id-immutable-001', publicId: 'rooms/10/101/room-main', version: 2147483647, format });
  });

  it('FILE-02: rejects a client-supplied URL and any extra image upload fields', async () => {
    const input = { assetId: 'asset-id-immutable-001', publicId: 'rooms/10/101/room-main', version: 1, format: 'jpg', url: 'https://attacker.test/photo.jpg' };
    expect(await invalidProperties(AddRoomImageDto, input)).toContain('url');
  });

  it('ROOM-07/FILE-02: requires a nonempty immutable assetId from Cloudinary', async () => {
    expect(await invalidProperties(AddRoomImageDto, {
      publicId: 'rooms/10/101/room-main', version: 1, format: 'jpg',
    })).toContain('assetId');
    expect(await invalidProperties(AddRoomImageDto, {
      assetId: '', publicId: 'rooms/10/101/room-main', version: 1, format: 'jpg',
    })).toContain('assetId');
  });

  it.each([
    [{ assetId: 'asset-id-immutable-001', publicId: '' }, 'publicId'],
    [{ version: '0' }, 'version'],
    [{ version: '1.5' }, 'version'],
    [{ version: '2147483648' }, 'version'],
    [{ format: 'gif' }, 'format'],
    [{ format: 'svg' }, 'format'],
  ])('ROOM-07/FILE-02: rejects malformed image metadata %#', async (patch, field) => {
    expect(await invalidProperties(AddRoomImageDto, {
      assetId: 'asset-id-immutable-001', publicId: 'rooms/10/101/room-main', version: '1', format: 'jpg', ...patch,
    })).toContain(field);
  });

  it('ROOM-07: accepts empty reorder and at most 10 positive image IDs', async () => {
    expect(await validate(plainToInstance(OrderRoomImagesDto, { imageIds: [] }))).toEqual([]);
    const tenIds = Array.from({ length: 10 }, (_, index) => String(index + 1));
    const valid = plainToInstance(OrderRoomImagesDto, { imageIds: tenIds });
    expect(await validate(valid)).toEqual([]);
    expect(valid.imageIds).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it.each([
    [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
    [[0]],
    [['1.5']],
    [[2147483648]],
  ])('ROOM-07: rejects invalid reorder ID list %#', async ([imageIds]) => {
    expect(await invalidProperties(OrderRoomImagesDto, { imageIds })).toContain('imageIds');
  });
});
