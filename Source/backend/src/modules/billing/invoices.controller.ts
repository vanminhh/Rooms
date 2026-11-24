import { Body, Controller, Get, Header, Headers, Ip, Param, Post, Query } from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { CurrentUser, Roles, TenantMeRoles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { PaginationQuery } from '../../common/pagination.js';
import { parseIdempotencyKey } from '../pricing/pricing-idempotency.js';
import { BillingService } from './billing.service.js';
import { InvoicesQueryDto } from './dto/invoices-query.dto.js';
import { InvoiceIdParamsDto, RecordPaymentDto, ReissueInvoiceDto } from './dto/record-payment.dto.js';
import { InvoiceQueriesService } from './invoice-queries.service.js';

class CancelOverdueDto {
  @IsString() @Matches(/\S/) reason: string;
}

@Controller('invoices')
@Roles('BOSS', 'MANAGER')
export class InvoicesController {
  constructor(private readonly billing: BillingService, private readonly queries: InvoiceQueriesService) {}

  // BIL / BE-P4-18
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() actor: AuthUser, @Query() query: InvoicesQueryDto) {
    return this.queries.list(actor, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@CurrentUser() actor: AuthUser, @Param() params: InvoiceIdParamsDto) {
    return this.queries.get(actor, params.id);
  }

  @Post(':id/payment')
  recordPayment(
    @CurrentUser() actor: AuthUser,
    @Param() params: InvoiceIdParamsDto,
    @Body() dto: RecordPaymentDto,
    @Ip() ip: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.billing.recordPayment(actor, params.id, dto, ip, parseIdempotencyKey(idempotencyKey));
  }

  @Post(':id/reissue')
  reissue(
    @CurrentUser() actor: AuthUser,
    @Param() params: InvoiceIdParamsDto,
    @Body() dto: ReissueInvoiceDto,
    @Ip() ip: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.billing.reissue(actor, params.id, dto, ip, parseIdempotencyKey(idempotencyKey));
  }

  @Post(':id/remind')
  remind(@CurrentUser() actor: AuthUser, @Param() params: InvoiceIdParamsDto, @Ip() ip: string) {
    return this.billing.remind(actor, params.id, ip);
  }

  @Post(':id/archive')
  @Roles('BOSS')
  archive(@CurrentUser() actor: AuthUser, @Param() params: InvoiceIdParamsDto, @Ip() ip: string) {
    return this.billing.overdueAction(actor, params.id, 'archive', undefined, ip);
  }

  @Post(':id/cancel')
  @Roles('BOSS')
  cancel(@CurrentUser() actor: AuthUser, @Param() params: InvoiceIdParamsDto, @Body() dto: CancelOverdueDto, @Ip() ip: string) {
    return this.billing.overdueAction(actor, params.id, 'cancel', dto.reason, ip);
  }
}

// BE-P4-19 · SCOPE-03, API-07: tenants only (a GUEST gets FORBIDDEN), never cached.
@Controller('me/invoices')
@TenantMeRoles()
export class MeInvoicesController {
  constructor(private readonly queries: InvoiceQueriesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() actor: AuthUser, @Query() query: PaginationQuery) {
    return this.queries.listMine(actor, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@CurrentUser() actor: AuthUser, @Param() params: InvoiceIdParamsDto) {
    return this.queries.getMine(actor, params.id);
  }
}
