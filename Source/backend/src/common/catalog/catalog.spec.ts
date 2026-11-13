import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AMENITIES, AMENITY_CODES, isAmenityCode, isRoomTypeCode, ROOM_TYPES, splitAmenities } from './catalog.js';

// Expected values come from docs/spec/11-buildings-rooms.md (BLD-08, ROOM-10), read from the file, not from the code under test.
const spec = readFileSync(resolve(process.cwd(), '../../docs/spec/11-buildings-rooms.md'), 'utf8');
const line = (id: string) => spec.split('\n').find((l) => l.startsWith(`- **${id}**`)) ?? '';
const pairsIn = (text: string) => [...text.matchAll(/`([A-Z_]+)` "([^"]+)"/g)].map((m) => ({ code: m[1], label: m[2] }));

describe('BLD-08: amenity list', () => {
  const fromSpec = pairsIn(line('BLD-08'));

  it('BLD-08: the 8 codes and Vietnamese labels equal the spec, in the spec order', () => {
    expect(fromSpec).toHaveLength(8);
    expect(AMENITIES.map(({ code, label }) => ({ code, label }))).toEqual(fromSpec);
  });

  it('LOC-04: every item has an English label', () => {
    for (const item of [...AMENITIES, ...ROOM_TYPES]) expect(item.labelEn.trim().length).toBeGreaterThan(0);
  });

  it('BLD-08: a code is recognised, free text and the empty string are not', () => {
    expect(isAmenityCode('ELEVATOR')).toBe(true);
    expect(isAmenityCode('Thang máy')).toBe(false);
    expect(isAmenityCode('elevator')).toBe(false);
    expect(isAmenityCode('')).toBe(false);
    expect(isAmenityCode(undefined)).toBe(false);
  });

  it('BLD-08: splitAmenities puts codes in catalog order and keeps old free text apart, in stored order', () => {
    expect(splitAmenities(['wifi', 'PARKING', 'Thang máy', 'ELEVATOR', 'PARKING', 5, null])).toEqual({
      codes: ['ELEVATOR', 'PARKING'],
      legacy: ['wifi', 'Thang máy'],
    });
    expect(splitAmenities(null)).toEqual({ codes: [], legacy: [] });
    expect(splitAmenities({})).toEqual({ codes: [], legacy: [] });
    expect(AMENITY_CODES).toHaveLength(8);
  });
});

describe('ROOM-10: room type list', () => {
  it('ROOM-10: the 4 codes and Vietnamese labels equal the spec, in the spec order', () => {
    const fromSpec = pairsIn(line('ROOM-10')).filter((p) => ['STUDIO', 'LOFT', 'ONE_BEDROOM', 'TWO_BEDROOM'].includes(p.code));
    expect(fromSpec).toHaveLength(4);
    expect(ROOM_TYPES.map(({ code, label }) => ({ code, label }))).toEqual(fromSpec);
  });

  it('ROOM-10: only the 4 codes are room types', () => {
    expect(isRoomTypeCode('STUDIO')).toBe(true);
    expect(isRoomTypeCode('DUPLEX')).toBe(false);
    expect(isRoomTypeCode(null)).toBe(false);
  });
});
