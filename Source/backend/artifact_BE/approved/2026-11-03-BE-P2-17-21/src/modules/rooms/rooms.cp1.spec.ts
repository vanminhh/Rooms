import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRoomDto, RoomIdParamsDto, UpdateRoomDto } from './dto/rooms.dto.js';

async function invalidFields(type: new () => object, value: unknown): Promise<string[]> {
  const instance = plainToInstance(type, value);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((error) => error.property);
}

describe('BE-P2-17 CP-1 independent boundary checks', () => {
  it('ROOM-01: accepts the lower positive area and upper schema area with int32 IDs', async () => {
    const minimum = plainToInstance(CreateRoomDto, {
      buildingId: '1', code: 'A', floor: '1', areaM2: '0.1', maxOccupants: '1', furniture: [],
    });
    const maximum = plainToInstance(CreateRoomDto, {
      buildingId: '2147483647', code: '1234567890', floor: '2147483647',
      areaM2: '9999.9', maxOccupants: '2147483647', furniture: ['Bàn'],
    });
    expect(await validate(minimum)).toEqual([]);
    expect(await validate(maximum)).toEqual([]);
    expect(maximum).toMatchObject({ buildingId: 2147483647, floor: 2147483647, areaM2: 9999.9, maxOccupants: 2147483647 });
  });

  it.each([
    [{ areaM2: 0 }, 'areaM2'],
    [{ areaM2: 10000 }, 'areaM2'],
    [{ areaM2: 1.11 }, 'areaM2'],
    [{ maxOccupants: 0 }, 'maxOccupants'],
    [{ floor: 0 }, 'floor'],
    [{ floor: 'G' }, 'floor'],
    [{ code: '' }, 'code'],
    [{ code: '12345678901' }, 'code'],
    [{ furniture: ['Bàn', false] }, 'furniture'],
  ])('ROOM-01: rejects create boundary violation %#', async (patch, field) => {
    expect(await invalidFields(CreateRoomDto, {
      buildingId: 1, code: '101', floor: 1, areaM2: 20, ...patch,
    })).toContain(field);
  });

  it('API-04, ROOM-01: accepts room ID 2147483647 but rejects values beyond int32', async () => {
    expect(await validate(plainToInstance(RoomIdParamsDto, { id: '2147483647' }))).toEqual([]);
    expect(await invalidFields(RoomIdParamsDto, { id: '2147483648' })).toContain('id');
  });

  it('ROOM-02: rejects price and buildingId on PATCH while permitting a no-price edit', async () => {
    expect(await invalidFields(UpdateRoomDto, { price: 2300000 })).toContain('price');
    expect(await invalidFields(UpdateRoomDto, { buildingId: 2 })).toContain('buildingId');
    expect(await validate(plainToInstance(UpdateRoomDto, { code: '102', areaM2: 30.5 }))).toEqual([]);
  });
});
