// BLD-08, ROOM-10: the two fixed lists, in one place. The order is the display order everywhere.
// `label` is the Vietnamese text of the spec; `labelEn` is the English label of LOC-04 (proposed wording, [ASSUMPTION] OQ-3).
export interface CatalogItem {
  code: string;
  label: string;
  labelEn: string;
}

export const AMENITIES: readonly CatalogItem[] = [
  { code: 'ELEVATOR', label: 'Thang máy', labelEn: 'Elevator' },
  { code: 'PARKING', label: 'Chỗ để xe', labelEn: 'Parking' },
  { code: 'SECURITY', label: 'Bảo vệ', labelEn: 'Security guard' },
  { code: 'CAMERA', label: 'Camera', labelEn: 'Security cameras' },
  { code: 'SHARED_WASHER', label: 'Máy giặt chung', labelEn: 'Shared washing machine' },
  { code: 'DRYING_AREA', label: 'Sân phơi', labelEn: 'Drying area' },
  { code: 'FINGERPRINT_LOCK', label: 'Khóa vân tay', labelEn: 'Fingerprint lock' },
  { code: 'FREE_HOURS', label: 'Giờ giấc tự do', labelEn: 'No curfew' },
];

export const ROOM_TYPES: readonly CatalogItem[] = [
  { code: 'STUDIO', label: 'Studio', labelEn: 'Studio' },
  { code: 'LOFT', label: 'Có gác xép', labelEn: 'With a loft' },
  { code: 'ONE_BEDROOM', label: '1 phòng ngủ', labelEn: 'One bedroom' },
  { code: 'TWO_BEDROOM', label: '2 phòng ngủ', labelEn: 'Two bedrooms' },
];

export const AMENITY_CODES: readonly string[] = AMENITIES.map((item) => item.code);
export const ROOM_TYPE_CODES: readonly string[] = ROOM_TYPES.map((item) => item.code);

export const isAmenityCode = (value: unknown): value is string => typeof value === 'string' && AMENITY_CODES.includes(value);
export const isRoomTypeCode = (value: unknown): value is string => typeof value === 'string' && ROOM_TYPE_CODES.includes(value);

/** Splits a stored amenities array into catalog codes (in catalog order) and old free text (in stored order). BLD-08. */
export function splitAmenities(stored: unknown): { codes: string[]; legacy: string[] } {
  const items = Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : [];
  return {
    codes: AMENITY_CODES.filter((code) => items.includes(code)),
    legacy: items.filter((item) => !isAmenityCode(item)),
  };
}
