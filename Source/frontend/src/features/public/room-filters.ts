import { z } from 'zod'
import type { PublicRoomSort, PublicRoomsQuery } from './api'

// int32 limit of the BE filters (public-rooms.dto.ts); the BE checks it again.
const MAX_INT32 = 2147483647

export interface PublicFilters {
  district: string
  ward: string
  buildingId: string
  minPrice: string
  maxPrice: string
  sort: PublicRoomSort
}

function isPrice(value: string): boolean {
  return value === '' || (/^\d+$/.test(value) && Number(value) <= MAX_INT32)
}

function isBuildingId(value: string): boolean {
  return /^[1-9]\d*$/.test(value) && Number(value) <= MAX_INT32
}

// Messages copy the BE DTO text (public-rooms.dto.ts), so the client shows the same words as the API.
// '-price' is in the type only: the UI offers 'price' and 'newest' (A-7), and parseFilters never produces '-price'.
export const filterSchema = z.object({
  district: z.string(),
  ward: z.string(),
  minPrice: z.string().refine(isPrice, 'Giá tối thiểu không hợp lệ'),
  maxPrice: z.string().refine(isPrice, 'Giá tối đa không hợp lệ'),
  sort: z.enum(['price', '-price', 'newest']),
})

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
    sort: params.get('sort') === 'newest' ? 'newest' : 'price',
  }
}

// Filters → URL. Empty fields and the default sort are left out.
export function filtersToParams(values: PublicFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of ['district', 'ward', 'buildingId', 'minPrice', 'maxPrice'] as const) {
    if (values[key]) params.set(key, values[key])
  }
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
    sort: values.sort,
  }
}

// The page sends a request only when this holds; a bad price shows its message under the field instead.
export function validFilters(values: PublicFilters): boolean {
  return filterSchema.safeParse(values).success
}
