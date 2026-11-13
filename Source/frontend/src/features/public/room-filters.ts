import { z } from 'zod'
import { t as translate } from '../../shared/i18n'
import type { I18nValue } from '../../shared/i18n'
import type { PublicFiltersView, PublicRoomSort, PublicRoomsQuery } from './api'

// int32 limit of the BE filters (public-rooms.dto.ts); the BE checks it again.
const MAX_INT32 = 2147483647

export interface PublicFilters {
  district: string
  ward: string
  buildingId: string
  minPrice: string
  maxPrice: string
  minArea: string
  maxArea: string
  minOccupants: string
  floor: string
  amenities: string[] // catalog codes that are ticked
  balcony: boolean // only true is ever sent (OQ-2)
  window: boolean
  pets: boolean
  roomType: string // '' = every type
  sort: PublicRoomSort
}

function isPrice(value: string): boolean {
  return value === '' || (/^\d+$/.test(value) && Number(value) <= MAX_INT32)
}

// area_m2 is Decimal(5,1): one decimal, 0.1 to 9999.9. Counts are positive int32 (the BE checks them again).
function isArea(value: string): boolean {
  return value === '' || (/^\d+(\.\d)?$/.test(value) && Number(value) >= 0.1 && Number(value) <= 9999.9)
}

function isCount(value: string): boolean {
  return value === '' || (/^[1-9]\d*$/.test(value) && Number(value) <= MAX_INT32)
}

function isBuildingId(value: string): boolean {
  return /^[1-9]\d*$/.test(value) && Number(value) <= MAX_INT32
}

// Messages copy the BE DTO text (public-rooms.dto.ts), so the client shows the same words as the API.
// '-price' is in the type only: the UI offers 'price' and 'newest' (A-7), and parseFilters never produces '-price'.
export function filterSchemaFor(t: I18nValue['t']) { return z.object({
  district: z.string(),
  ward: z.string(),
  minPrice: z.string().refine(isPrice, t('rooms.filters.invalidMinPrice')),
  maxPrice: z.string().refine(isPrice, t('rooms.filters.invalidMaxPrice')),
  minArea: z.string().refine(isArea, t('rooms.filters.invalidMinArea')),
  maxArea: z.string().refine(isArea, t('rooms.filters.invalidMaxArea')),
  minOccupants: z.string().refine(isCount, t('rooms.filters.invalidOccupants')),
  floor: z.string().refine(isCount, t('rooms.filters.invalidFloor')),
  amenities: z.array(z.string()),
  balcony: z.boolean(),
  window: z.boolean(),
  pets: z.boolean(),
  roomType: z.string(),
  sort: z.enum(['price', '-price', 'newest']),
}) }

// The default schema remains Vietnamese for non-visual callers and existing URL validation.
export const filterSchema = filterSchemaFor((key, params) => translate(key, params, 'vi'))

export type FilterFormValues = z.infer<typeof filterSchema>

// URL → filters. Unknown sort falls back to 'price'; a malformed buildingId is dropped (it has no field to show an error).
export function parseFilters(params: URLSearchParams): PublicFilters {
  const buildingId = params.get('buildingId') ?? ''
  return {
    district: params.get('district') ?? '',
    ward: params.get('ward') ?? '',
    buildingId: isBuildingId(buildingId) ? buildingId : '',
    minPrice: params.get('minPrice') ?? '',
    maxPrice: params.get('maxPrice') ?? '',
    minArea: params.get('minArea') ?? '',
    maxArea: params.get('maxArea') ?? '',
    minOccupants: params.get('minOccupants') ?? '',
    floor: params.get('floor') ?? '',
    // Only the shape is checked here; withCatalog drops codes that are not in the list once /public/filters has loaded.
    amenities: [...new Set((params.get('amenities') ?? '').split(',').map(code => code.trim()).filter(code => /^[A-Z_]+$/.test(code)))],
    balcony: params.get('balcony') === 'true',
    window: params.get('window') === 'true',
    pets: params.get('pets') === 'true',
    roomType: /^[A-Z_]+$/.test(params.get('roomType') ?? '') ? params.get('roomType') ?? '' : '',
    sort: params.get('sort') === 'newest' ? 'newest' : 'price',
  }
}

// PUB-06: a code that is not in the list from GET /public/filters would be a 400, so it is dropped before the request.
export function withCatalog(values: PublicFilters, catalog: PublicFiltersView): PublicFilters {
  const known = new Set(catalog.amenities.map(item => item.code))
  return {
    ...values,
    amenities: values.amenities.filter(code => known.has(code)),
    roomType: catalog.roomTypes.some(item => item.code === values.roomType) ? values.roomType : '',
  }
}

// True while the URL asks for a code or a type that only the catalog can vouch for.
export function needsCatalog(values: PublicFilters): boolean {
  return values.amenities.length > 0 || values.roomType !== ''
}

// Filters → URL. Empty fields and the default sort are left out.
export function filtersToParams(values: PublicFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of ['district', 'ward', 'buildingId', 'minPrice', 'maxPrice', 'minArea', 'maxArea', 'minOccupants', 'floor'] as const) {
    if (values[key]) params.set(key, values[key])
  }
  if (values.amenities.length > 0) params.set('amenities', values.amenities.join(','))
  for (const key of ['balcony', 'window', 'pets'] as const) {
    if (values[key]) params.set(key, 'true')
  }
  if (values.roomType) params.set('roomType', values.roomType)
  if (values.sort !== 'price') params.set('sort', values.sort)
  return params
}

// Filters → API query. '0' is a real price, so only '' counts as empty.
export function filtersToQuery(values: PublicFilters): PublicRoomsQuery {
  return {
    district: values.district || undefined,
    ward: values.ward || undefined,
    buildingId: values.buildingId ? Number(values.buildingId) : undefined,
    minPrice: values.minPrice ? Number(values.minPrice) : undefined,
    maxPrice: values.maxPrice ? Number(values.maxPrice) : undefined,
    minArea: values.minArea ? Number(values.minArea) : undefined,
    maxArea: values.maxArea ? Number(values.maxArea) : undefined,
    minOccupants: values.minOccupants ? Number(values.minOccupants) : undefined,
    floor: values.floor ? Number(values.floor) : undefined,
    amenities: values.amenities.length > 0 ? values.amenities.join(',') : undefined,
    balcony: values.balcony ? true : undefined,
    window: values.window ? true : undefined,
    pets: values.pets ? true : undefined,
    roomType: values.roomType || undefined,
    sort: values.sort,
  }
}

// The page sends a request only when this holds; a bad price shows its message under the field instead.
export function validFilters(values: PublicFilters): boolean {
  return filterSchema.safeParse(values).success
}
