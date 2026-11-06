import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../../../common/pagination.js';

const INT32_MAX = 2147483647; // room_prices.price, rate_tiers.up_to/unit_price are INTEGER (G-01)
const ROOM_ID_MESSAGE = 'Mã phòng không hợp lệ';
const PRICE_MESSAGE = 'Giá phòng phải là số nguyên đồng lớn hơn 0';
const DATE_MESSAGE = 'Ngày hiệu lực phải có dạng YYYY-MM-DD';
const BUILDING_MESSAGE = 'Mã tòa không hợp lệ';
const KIND_MESSAGE = 'Loại biểu giá không hợp lệ';
const SERVICE_MESSAGE = 'Mã dịch vụ không hợp lệ';
const TIERS_MESSAGE = 'Biểu giá phải có ít nhất 1 bậc';
const TIER_MESSAGE = 'Bậc giá không hợp lệ';
const RATE_KINDS = ['ELECTRIC', 'WATER', 'SERVICE'] as const;

// Body numbers are not coerced: "2500000" or true fail IsInt (no @Type on body fields).
export class CreateRoomPriceDto {
  @IsInt({ message: ROOM_ID_MESSAGE })
  @Min(1, { message: ROOM_ID_MESSAGE })
  @Max(INT32_MAX, { message: ROOM_ID_MESSAGE })
  roomId!: number;

  @IsInt({ message: PRICE_MESSAGE })
  @Min(1, { message: PRICE_MESSAGE })
  @Max(INT32_MAX, { message: PRICE_MESSAGE })
  price!: number;

  // Calendar validity (29/02 in a non-leap year, etc.) is checked in the service with parseDateOnly.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  effectiveFrom!: string;

  @IsOptional()
  @IsString({ message: 'Lý do không hợp lệ' })
  reason?: string;
}

export class RateTierDto {
  @IsInt({ message: TIER_MESSAGE })
  @Min(1, { message: TIER_MESSAGE })
  @Max(INT32_MAX, { message: TIER_MESSAGE })
  tierNo!: number;

  // null = no upper limit (last tier). Its position is checked in ratePlanFieldErrors.
  @ValidateIf((_object, value) => value !== null)
  @IsInt({ message: TIER_MESSAGE })
  @Min(1, { message: TIER_MESSAGE })
  @Max(INT32_MAX, { message: TIER_MESSAGE })
  upTo!: number | null;

  @IsInt({ message: TIER_MESSAGE })
  @Min(0, { message: TIER_MESSAGE })
  @Max(INT32_MAX, { message: TIER_MESSAGE })
  unitPrice!: number;
}

export class CreateRatePlanDto {
  @IsInt({ message: BUILDING_MESSAGE })
  @Min(1, { message: BUILDING_MESSAGE })
  @Max(INT32_MAX, { message: BUILDING_MESSAGE })
  buildingId!: number;

  @IsIn(RATE_KINDS, { message: KIND_MESSAGE })
  kind!: (typeof RATE_KINDS)[number];

  // Required iff kind = SERVICE; the rule is checked in ratePlanFieldErrors.
  @IsOptional()
  @IsInt({ message: SERVICE_MESSAGE })
  @Min(1, { message: SERVICE_MESSAGE })
  @Max(INT32_MAX, { message: SERVICE_MESSAGE })
  serviceId?: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: DATE_MESSAGE })
  effectiveFrom!: string;

  @IsOptional()
  @IsString({ message: 'Lý do không hợp lệ' })
  reason?: string;

  @IsArray({ message: TIERS_MESSAGE })
  @ArrayMinSize(1, { message: TIERS_MESSAGE })
  @ValidateNested({ each: true })
  @Type(() => RateTierDto)
  tiers!: RateTierDto[];
}

const ID_MESSAGE = 'Mã đề xuất không hợp lệ';
const REVIEW_NOTE_MESSAGE = 'Ghi chú từ chối không được để trống';
const STATUS_MESSAGE = 'Trạng thái không hợp lệ';
const SORT_MESSAGE = 'Thứ tự sắp xếp không hợp lệ';
const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED'] as const;
const SORTS = ['createdAt', '-createdAt'] as const;

// API-02: default sort is -createdAt; API-08: buildingId filter is checked against the manager's scope in the service.
export class PricingListQueryDto extends PaginationQuery {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: BUILDING_MESSAGE })
  @Min(1, { message: BUILDING_MESSAGE })
  @Max(INT32_MAX, { message: BUILDING_MESSAGE })
  buildingId?: number;

  @IsOptional()
  @IsIn(APPROVAL_STATUSES, { message: STATUS_MESSAGE })
  status?: (typeof APPROVAL_STATUSES)[number];

  @IsOptional()
  @IsIn(SORTS, { message: SORT_MESSAGE })
  sort?: (typeof SORTS)[number];
}

export class RoomPriceListQueryDto extends PricingListQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: ROOM_ID_MESSAGE })
  @Min(1, { message: ROOM_ID_MESSAGE })
  @Max(INT32_MAX, { message: ROOM_ID_MESSAGE })
  roomId?: number;
}

export class RatePlanListQueryDto extends PricingListQueryDto {
  @IsOptional()
  @IsIn(RATE_KINDS, { message: KIND_MESSAGE })
  kind?: (typeof RATE_KINDS)[number];
}

export class PricingIdParamsDto {
  @Type(() => Number)
  @IsInt({ message: ID_MESSAGE })
  @Min(1, { message: ID_MESSAGE })
  @Max(INT32_MAX, { message: ID_MESSAGE })
  id!: number;
}

export class RejectPricingDto {
  // PRC-03: review_note is required; spaces only count as empty.
  @IsString({ message: REVIEW_NOTE_MESSAGE })
  @Matches(/\S/, { message: REVIEW_NOTE_MESSAGE })
  reviewNote!: string;
}

// RATE-01/RATE-02 rules that need no DB: serviceId iff SERVICE, tier_no 1..n, up_to strictly
// increasing (from 0), only the last tier unlimited, WATER/SERVICE exactly one unlimited tier.
export function ratePlanFieldErrors(dto: CreateRatePlanDto): Record<string, string> | null {
  const hasService = dto.serviceId !== undefined && dto.serviceId !== null;
  if (dto.kind === 'SERVICE' && !hasService) return { serviceId: 'Biểu giá dịch vụ phải chọn dịch vụ' };
  if (dto.kind !== 'SERVICE' && hasService) return { serviceId: 'Chỉ biểu giá dịch vụ mới gắn với dịch vụ' };

  const tiers = dto.tiers;
  if ((dto.kind === 'WATER' || dto.kind === 'SERVICE') && (tiers.length !== 1 || tiers[0].upTo !== null)) {
    return { tiers: 'Biểu giá nước và dịch vụ chỉ có đúng 1 bậc không giới hạn' };
  }
  let previousUpTo = 0;
  for (const [index, tier] of tiers.entries()) {
    // [ASSUMPTION P5-3]: input order is taken as given; tiers are never sorted silently, so tierNo must already be 1..n in array order.
    if (tier.tierNo !== index + 1) return { tiers: 'Số thứ tự bậc phải liên tục từ 1' };
    const isLast = index === tiers.length - 1;
    if (isLast !== (tier.upTo === null)) {
      return { tiers: isLast ? 'Bậc cuối phải không giới hạn' : 'Bậc trước bậc cuối phải có cận trên' };
    }
    if (tier.upTo !== null) {
      if (tier.upTo <= previousUpTo) return { tiers: 'Cận trên của các bậc phải tăng dần' };
      previousUpTo = tier.upTo;
    }
  }
  return null;
}
