import { Body, Controller, Header, Headers, Ip, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { ContractIdParamsDto } from '../contracts/dto/contracts-query.dto.js';
import { parseIdempotencyKey } from '../pricing/pricing-idempotency.js';
import { RefundPaidDto, SettlementDto, SettlementIdParamsDto, SettlementQueryDto } from './dto/settlement.dto.js';
import { SettlementService } from './settlement.service.js';

// BIL-13..19 · POST /contracts/:id/settlement?dryRun= (UI-06: the dry run writes nothing).
@Controller('contracts')
@Roles('BOSS', 'MANAGER')
export class SettlementController {
  constructor(private readonly settlements: SettlementService) {}

  @Post(':id/settlement')
  @Header('Cache-Control', 'no-store')
  settle(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto, @Query() query: SettlementQueryDto, @Body() dto: SettlementDto,
    @Ip() ip: string, @Headers('idempotency-key') idempotencyKey: string | undefined) {
    return this.settlements.settle(actor, params.id, dto, query.dryRun === true, ip, parseIdempotencyKey(idempotencyKey));
  }
}

// Q-P3-3, Q-P4-8 · POST /settlements/:id/refund-paid (once; there is no undo route).
@Controller('settlements')
@Roles('BOSS', 'MANAGER')
export class SettlementsController {
  constructor(private readonly settlements: SettlementService) {}

  @Post(':id/refund-paid')
  @Header('Cache-Control', 'no-store')
  refundPaid(@CurrentUser() actor: AuthUser, @Param() params: SettlementIdParamsDto, @Body() dto: RefundPaidDto, @Ip() ip: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined) {
    return this.settlements.refundPaid(actor, params.id, dto, ip, parseIdempotencyKey(idempotencyKey));
  }
}
