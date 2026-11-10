import { Body, Controller, Get, Headers, Ip, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, type AuthUser, Roles } from '../../common/guards/auth.decorators.js';
import type { Paginated } from '../../common/pagination.js';
import {
  CreateRatePlanDto,
  CreateRoomPriceDto,
  PricingIdParamsDto,
  RatePlanListQueryDto,
  RejectPricingDto,
  RoomPriceListQueryDto,
} from './dto/pricing.dto.js';
import { parseIdempotencyKey } from './pricing-idempotency.js';
import { PricingService } from './pricing.service.js';
import type { RatePlanView, RoomPriceView } from './pricing.types.js';

@Controller()
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Roles('BOSS', 'MANAGER')
  @Get('room-prices')
  listRoomPrices(@CurrentUser() user: AuthUser, @Query() query: RoomPriceListQueryDto): Promise<Paginated<RoomPriceView>> {
    return this.pricing.listRoomPrices(user, query);
  }

  @Roles('BOSS', 'MANAGER')
  @Get('rate-plans')
  listRatePlans(@CurrentUser() user: AuthUser, @Query() query: RatePlanListQueryDto): Promise<Paginated<RatePlanView>> {
    return this.pricing.listRatePlans(user, query);
  }

  @Roles('BOSS', 'MANAGER')
  @Post('room-prices')
  proposeRoomPrice(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRoomPriceDto,
    @Ip() ip: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<RoomPriceView> {
    return this.pricing.proposeRoomPrice(user, dto, ip, parseIdempotencyKey(idempotencyKey));
  }

  @Roles('BOSS', 'MANAGER')
  @Post('rate-plans')
  proposeRatePlan(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRatePlanDto,
    @Ip() ip: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<RatePlanView> {
    return this.pricing.proposeRatePlan(user, dto, ip, parseIdempotencyKey(idempotencyKey));
  }

  @Roles('BOSS')
  @Post('room-prices/:id/approve')
  approveRoomPrice(
    @CurrentUser() user: AuthUser,
    @Param() params: PricingIdParamsDto,
    @Ip() ip: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<RoomPriceView> {
    return this.pricing.approveRoomPrice(user, params.id, ip, parseIdempotencyKey(idempotencyKey));
  }

  @Roles('BOSS')
  @Post('room-prices/:id/reject')
  rejectRoomPrice(
    @CurrentUser() user: AuthUser,
    @Param() params: PricingIdParamsDto,
    @Body() dto: RejectPricingDto,
    @Ip() ip: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<RoomPriceView> {
    return this.pricing.rejectRoomPrice(user, params.id, dto, ip, parseIdempotencyKey(idempotencyKey));
  }

  @Roles('BOSS')
  @Post('rate-plans/:id/approve')
  approveRatePlan(
    @CurrentUser() user: AuthUser,
    @Param() params: PricingIdParamsDto,
    @Ip() ip: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<RatePlanView> {
    return this.pricing.approveRatePlan(user, params.id, ip, parseIdempotencyKey(idempotencyKey));
  }

  @Roles('BOSS')
  @Post('rate-plans/:id/reject')
  rejectRatePlan(
    @CurrentUser() user: AuthUser,
    @Param() params: PricingIdParamsDto,
    @Body() dto: RejectPricingDto,
    @Ip() ip: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<RatePlanView> {
    return this.pricing.rejectRatePlan(user, params.id, dto, ip, parseIdempotencyKey(idempotencyKey));
  }
}
