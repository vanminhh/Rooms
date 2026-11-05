import type { Prisma, PrismaClient, ServiceUnit } from '@prisma/client';
import type { PublicContact } from '../../modules/settings/settings.service.js';
import type {
  PublicBuildingDetail, PublicBuildingSummary, PublicRateView, PublicRates, PublicRoomDetail,
  PublicRoomListItem,
} from '../../modules/rooms/public.types.js';
import { formatDateOnly } from '../date/today.js';
import { ratesAfter, ratesAt, type RateView } from '../rates/rates-at.js';
import { buildEstimate, type EstimateService } from './monthly-estimate.js';

// Explicit field lists keep user ids, review notes and proposal data out of public bodies (PUB-04).
export const PUBLIC_ROOM_LIST_INCLUDE = {
  building: { select: { code: true, name: true, district: true, ward: true } },
  images: { select: { url: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 1 },
} satisfies Prisma.RoomInclude;

type PublicRoomListRecord = Prisma.RoomGetPayload<{ include: typeof PUBLIC_ROOM_LIST_INCLUDE }>;

// BLD-04: the contact is computed by BuildingContactService from the manager's public fields only.
export const PUBLIC_BUILDING_INCLUDE = {
  manager: { select: { isActive: true, contactPhone: true, zaloUrl: true, facebookUrl: true } },
} satisfies Prisma.BuildingInclude;

type PublicBuildingRecord = Prisma.BuildingGetPayload<{ include: typeof PUBLIC_BUILDING_INCLUDE }>;

export const PUBLIC_ROOM_DETAIL_INCLUDE = {
  building: { include: PUBLIC_BUILDING_INCLUDE },
  images: { select: { id: true, url: true, sortOrder: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.RoomInclude;

type PublicRoomDetailRecord = Prisma.RoomGetPayload<{ include: typeof PUBLIC_ROOM_DETAIL_INCLUDE }>;

export function toPublicRoomListItem(room: PublicRoomListRecord): PublicRoomListItem {
  // ROOM-05 guarantees a price; null here means a public query skipped publicRoomWhere.
  if (room.price === null) throw new Error(`public room ${room.id} has no price`);
  return {
    id: room.id,
    code: room.code,
    floor: room.floor,
    areaM2: Number(room.areaM2),
    price: room.price,
    maxOccupants: room.maxOccupants,
    buildingId: room.buildingId,
    buildingCode: room.building.code,
    buildingName: room.building.name,
    district: room.building.district,
    ward: room.building.ward,
    imageUrl: room.images.at(0)?.url ?? null,
  };
}

// Json columns (furniture, amenities) hold string arrays; anything else is dropped.
function jsonStrings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function toPublicRateView(rate: RateView, service: { name: string; unit: ServiceUnit } | null): PublicRateView {
  return {
    kind: rate.kind,
    serviceId: rate.serviceId,
    serviceName: service?.name ?? null,
    unit: service?.unit ?? null,
    effectiveFrom: formatDateOnly(rate.effectiveFrom),
    tiers: rate.tiers,
  };
}

export interface PublicRateSet {
  electric: PublicRateView | null;
  water: PublicRateView | null;
  services: EstimateService[]; // active services only (SVC-04); rate null = no rate in effect
  upcomingRates: PublicRateView[];
}

// PUB-03, ROOM-08, SVC-04: today's rates and the upcoming ones of one building.
export async function loadPublicRates(
  db: Pick<PrismaClient, 'ratePlan' | 'service'>, buildingId: number, today: Date,
): Promise<PublicRateSet> {
  const [current, upcoming, services] = await Promise.all([
    ratesAt(db, buildingId, today),
    ratesAfter(db, buildingId, today),
    db.service.findMany({
      where: { buildingId, isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, unit: true },
    }),
  ]);
  const byId = new Map(services.map((service) => [service.id, service] as const));
  const upcomingRates = upcoming.flatMap((rate) => {
    const service = rate.serviceId === null ? undefined : byId.get(rate.serviceId);
    if (rate.kind === 'SERVICE' && !service) return []; // a locked service stays hidden (SVC-04)
    return [toPublicRateView(rate, service ?? null)];
  });
  return {
    electric: current.electric ? toPublicRateView(current.electric, null) : null,
    water: current.water ? toPublicRateView(current.water, null) : null,
    services: services.map((service) => {
      const rate = current.services.get(service.id);
      return { name: service.name, unit: service.unit, rate: rate ? toPublicRateView(rate, service) : null };
    }),
    upcomingRates,
  };
}

// Only the rates in effect today; services without a rate are listed in estimate.missing instead.
export function toPublicRates(rates: PublicRateSet): PublicRates {
  return {
    electric: rates.electric,
    water: rates.water,
    services: rates.services.flatMap((service) => (service.rate ? [service.rate] : [])),
  };
}

// BLD-04: a contact without a phone number is not shown.
export function toPublicContact(contact: PublicContact | null): PublicRoomDetail['contact'] {
  return contact?.phone
    ? { phone: contact.phone, zaloUrl: contact.zaloUrl, facebookUrl: contact.facebookUrl }
    : null;
}

export function toPublicBuildingSummary(building: PublicBuildingRecord): PublicBuildingSummary {
  return {
    id: building.id,
    code: building.code,
    name: building.name,
    address: building.address,
    district: building.district,
    ward: building.ward,
    waterMode: building.waterMode,
    amenities: jsonStrings(building.amenities),
    description: building.description,
  };
}

export function toPublicRoomDetail(
  room: PublicRoomDetailRecord, rates: PublicRateSet, contact: PublicContact | null,
): PublicRoomDetail {
  // ROOM-05 guarantees a price; see toPublicRoomListItem.
  if (room.price === null) throw new Error(`public room ${room.id} has no price`);
  const estimate = buildEstimate({
    price: room.price,
    waterMode: room.building.waterMode,
    water: rates.water,
    services: rates.services,
  });
  return {
    id: room.id,
    code: room.code,
    floor: room.floor,
    areaM2: Number(room.areaM2),
    maxOccupants: room.maxOccupants,
    furniture: jsonStrings(room.furniture),
    description: room.description,
    price: room.price,
    deposit: estimate.deposit,
    monthlyEstimate: estimate.monthlyEstimate,
    estimate: estimate.estimate,
    images: room.images.map((image) => ({ id: image.id, url: image.url, sortOrder: image.sortOrder })),
    building: toPublicBuildingSummary(room.building),
    rates: toPublicRates(rates),
    upcomingRates: rates.upcomingRates,
    contact: toPublicContact(contact),
  };
}

export function toPublicBuildingDetail(
  building: PublicBuildingRecord, rates: PublicRateSet, contact: PublicContact | null, rooms: PublicRoomListItem[],
): PublicBuildingDetail {
  return {
    ...toPublicBuildingSummary(building),
    contact: toPublicContact(contact),
    rates: toPublicRates(rates),
    upcomingRates: rates.upcomingRates,
    rooms,
  };
}
