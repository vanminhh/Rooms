export interface PublicRoomListItem {
  id: number;
  code: string;
  floor: number;
  areaM2: number;
  price: number; // never null (ROOM-05)
  maxOccupants: number;
  buildingId: number;
  buildingCode: string;
  buildingName: string;
  district: string;
  ward: string;
  imageUrl: string | null; // image with the smallest sort_order
}

export interface PublicRateTier { tierNo: number; upTo: number | null; unitPrice: number }

export interface PublicRateView {
  kind: 'ELECTRIC' | 'WATER' | 'SERVICE';
  serviceId: number | null;
  serviceName: string | null;
  unit: 'ROOM' | 'PERSON' | 'VEHICLE' | null; // null for ELECTRIC and WATER
  effectiveFrom: string; // YYYY-MM-DD (API-06)
  tiers: PublicRateTier[];
}

export interface PublicRates {
  electric: PublicRateView | null;
  water: PublicRateView | null;
  services: PublicRateView[];
}

export interface PublicEstimate {
  items: { label: string; amount: number }[]; // "Giá thuê", "Wifi", "Nước (1 người)", …
  missing: string[]; // "chưa gồm: <tên> (chưa có giá)"
  meteredNote: string; // "chưa gồm điện, nước – tính theo đồng hồ của phòng"
}

export interface PublicBuildingSummary {
  id: number;
  code: string;
  name: string;
  address: string;
  district: string;
  ward: string;
  waterMode: 'PER_M3' | 'PER_PERSON';
  amenities: string[];
  description: string | null;
}

export interface PublicRoomDetail {
  id: number;
  code: string;
  floor: number;
  areaM2: number;
  maxOccupants: number;
  furniture: string[];
  description: string | null;
  price: number;
  deposit: number; // = price (ROOM-08)
  monthlyEstimate: number; // ROOM-08 / A-05, đồng nguyên
  estimate: PublicEstimate;
  images: { id: number; url: string; sortOrder: number }[];
  building: PublicBuildingSummary;
  rates: PublicRates;
  upcomingRates: PublicRateView[]; // effectiveFrom > today (PUB-03)
  contact: { phone: string; zaloUrl: string | null; facebookUrl: string | null } | null;
}

export interface PublicBuildingDetail extends PublicBuildingSummary {
  contact: PublicRoomDetail['contact'];
  rates: PublicRates;
  upcomingRates: PublicRateView[];
  rooms: PublicRoomListItem[]; // public rooms only, price ascending
}
