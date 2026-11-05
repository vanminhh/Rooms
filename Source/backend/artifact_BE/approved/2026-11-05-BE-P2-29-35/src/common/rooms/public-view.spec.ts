import { PUBLIC_ROOM_LIST_INCLUDE, toPublicRoomListItem } from './public-view.js';

// CP-1 (BE-P2-29) · PUB-04: toPublicRoomListItem is a pure mapper, no mocking of the unit under test.

function room(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 101,
    code: 'A101',
    floor: 1,
    areaM2: 20,
    price: 3_000_000,
    maxOccupants: 2,
    buildingId: 10,
    building: { code: 'DD01', name: 'Dương Đình 1', district: 'Cầu Giấy', ward: 'Dịch Vọng' },
    images: [],
    ...overrides,
  } as any;
}

describe('PUB-04 (BE-P2-29): toPublicRoomListItem', () => {
  it('PUB-04: maps every public field and nothing else (no managerId/proposedById/reviewNote)', () => {
    const item = toPublicRoomListItem(room({ images: [{ url: 'https://img/1.jpg' }] }));
    expect(item).toEqual({
      id: 101,
      code: 'A101',
      floor: 1,
      areaM2: 20,
      price: 3_000_000,
      maxOccupants: 2,
      buildingId: 10,
      buildingCode: 'DD01',
      buildingName: 'Dương Đình 1',
      district: 'Cầu Giấy',
      ward: 'Dịch Vọng',
      imageUrl: 'https://img/1.jpg',
    });
    expect(Object.keys(item)).not.toContain('managerId');
    expect(Object.keys(item)).not.toContain('proposedById');
  });

  it('PUB-04: no images -> imageUrl is null', () => {
    expect(toPublicRoomListItem(room({ images: [] })).imageUrl).toBeNull();
  });

  it('PUB-04: the include orders images by sortOrder asc then id asc and takes 1, so the mapper can just read images[0]', () => {
    expect(PUBLIC_ROOM_LIST_INCLUDE.images.orderBy).toEqual([{ sortOrder: 'asc' }, { id: 'asc' }]);
    expect(PUBLIC_ROOM_LIST_INCLUDE.images.take).toBe(1);
  });

  it('ROOM-05 (BE-P2-29): price = null must never reach the mapper; this is the last-line guard, not the filter itself', () => {
    expect(() => toPublicRoomListItem(room({ price: null }))).toThrow(/no price/);
  });

  it('PUB-04: areaM2 is coerced to a plain number (Prisma Decimal -> Number)', () => {
    const item = toPublicRoomListItem(room({ areaM2: { toString: () => '24.5' } as any }));
    expect(item.areaM2).toBe(24.5);
  });
});
