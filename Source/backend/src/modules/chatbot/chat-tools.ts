import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { Logger, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AMENITY_CODES, ROOM_TYPE_CODES } from '../../common/catalog/catalog.js';
import type { Lang } from '../../common/i18n/locale.js';
import type { PublicBuildingsService } from '../buildings/public-buildings.service.js';
import { PublicIdParamsDto, PublicRoomsQueryDto } from '../rooms/dto/public-rooms.dto.js';
import type { PublicRoomsService } from '../rooms/public-rooms.service.js';
import type { PublicRoomListItem } from '../rooms/public.types.js';

export const CHAT_TOOL_NAMES = ['search_rooms', 'get_room', 'list_locations', 'get_building'] as const;
export const CHAT_SEARCH_MAX = 10; // keeps tool results (tokens) small; the bot lists at most 5
export const NOT_FOUND_TEXT = 'Not found, or no longer listed publicly.';
export const LOOKUP_FAILED_TEXT = 'The lookup failed. Suggest calling the building or trying again later.';

const logger = new Logger('ChatTools');

// Only the fields the bot needs, plus the page link it hands out (CHAT-05).
const listItem = (r: PublicRoomListItem) => ({
  id: r.id, code: r.code, link: `/phong/${r.id}`, building: r.buildingName, buildingId: r.buildingId,
  district: r.district, ward: r.ward, floor: r.floor, areaM2: r.areaM2, price: r.price,
  maxOccupants: r.maxOccupants, roomType: r.roomType, hasBalcony: r.hasBalcony, hasWindow: r.hasWindow,
  petsAllowed: r.petsAllowed, amenities: r.buildingAmenities,
});

// Every tool reads public data only, through the public services (ROOM-05, PUB-01..04, CHAT-02).
// Errors go back to the model as text: never a 500, never a raw DB message (CHAT-06).
async function guarded(run: () => Promise<unknown>): Promise<string> {
  try {
    return JSON.stringify(await run());
  } catch (error) {
    if (error instanceof NotFoundException) return NOT_FOUND_TEXT; // PUB-02: missing = not public
    logger.warn(`chat tool failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return LOOKUP_FAILED_TEXT;
  }
}

async function validId(id: unknown): Promise<number | null> {
  const dto = plainToInstance(PublicIdParamsDto, { id });
  return (await validate(dto)).length === 0 ? dto.id : null;
}

const ID_SCHEMA = { type: 'object', properties: { id: { type: 'integer', minimum: 1 } }, required: ['id'], additionalProperties: false } as const;

export function chatTools(rooms: PublicRoomsService, buildings: PublicBuildingsService, lang: Lang) {
  return [
    betaTool({
      name: 'search_rooms',
      description: 'Search rooms that are publicly available now. All filters are optional. Prices are whole đồng per month.',
      inputSchema: {
        type: 'object',
        properties: {
          district: { type: 'string', description: 'District name as returned by list_locations, e.g. "Cầu Giấy"' },
          ward: { type: 'string' },
          buildingId: { type: 'integer', minimum: 1 },
          minPrice: { type: 'integer', minimum: 0 },
          maxPrice: { type: 'integer', minimum: 0 },
          minArea: { type: 'number', description: 'm²' },
          maxArea: { type: 'number', description: 'm²' },
          minOccupants: { type: 'integer', minimum: 1 },
          roomType: { type: 'string', enum: [...ROOM_TYPE_CODES] },
          amenities: { type: 'array', items: { type: 'string', enum: [...AMENITY_CODES] }, description: 'Building must have all of them' },
          balcony: { type: 'boolean' },
          window: { type: 'boolean' },
          pets: { type: 'boolean' },
          sort: { type: 'string', enum: ['price', '-price', 'newest'] },
          limit: { type: 'integer', minimum: 1, maximum: CHAT_SEARCH_MAX },
        },
        additionalProperties: false,
      },
      run: async (input) => {
        const { balcony, window, pets, limit, ...rest } = input as Record<string, unknown>;
        const query = plainToInstance(PublicRoomsQueryDto, {
          ...rest,
          ...(balcony === true ? { balcony: 'true' } : {}),
          ...(window === true ? { window: 'true' } : {}),
          ...(pets === true ? { pets: 'true' } : {}),
          page: 1,
          limit: typeof limit === 'number' ? Math.min(limit, CHAT_SEARCH_MAX) : 5,
        });
        // Same rules as GET /public/rooms; a bad filter never reaches Prisma.
        const errors = await validate(query, { whitelist: true, forbidNonWhitelisted: true });
        if (errors.length > 0) return `Invalid filter: ${errors.map((e) => e.property).join(', ')}.`;
        return guarded(async () => {
          const result = await rooms.list(query);
          return { total: result.meta.total, rooms: result.data.map(listItem) };
        });
      },
    }),
    betaTool({
      name: 'get_room',
      description: 'Details of one public room: price, deposit, monthly estimate, rates, building and contact phone.',
      inputSchema: ID_SCHEMA,
      run: async (input) => {
        const id = await validId(input.id);
        if (id === null) return NOT_FOUND_TEXT;
        return guarded(async () => {
          const { images: _images, ...room } = await rooms.detail(id, lang);
          return { ...room, link: `/phong/${room.id}` };
        });
      },
    }),
    betaTool({
      name: 'list_locations',
      description: 'Districts and wards that have public rooms, with room counts.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => guarded(() => buildings.locations()),
    }),
    betaTool({
      name: 'get_building',
      description: 'Details of one building: address, amenities, rates, contact phone and its public rooms.',
      inputSchema: ID_SCHEMA,
      run: async (input) => {
        const id = await validId(input.id);
        if (id === null) return NOT_FOUND_TEXT;
        return guarded(async () => {
          const building = await buildings.detail(id);
          return { ...building, rooms: building.rooms.map(listItem) };
        });
      },
    }),
  ];
}
