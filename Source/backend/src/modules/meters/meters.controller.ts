import { Body, Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { DashboardQueryDto } from '../notifications/dto/dashboard.dto.js';
import { MetersService } from './meters.service.js';

import { MeterBillingService } from './meter-billing.service.js';
import { InvoiceIdParamsDto } from '../billing/dto/record-payment.dto.js';
import { ContractIdParamsDto } from '../contracts/dto/contracts-query.dto.js';
import { CreateMissedInvoiceDto } from './dto/monthly-invoice.dto.js';
import { MissedInvoiceService } from './missed-invoice.service.js';

@Controller('meter-readings')
@Roles('BOSS', 'MANAGER')
export class MetersController {
  constructor(private readonly meters: MetersService, private readonly billing: MeterBillingService) {}

  @Post()
  record(@CurrentUser() actor: AuthUser, @Body() items: unknown, @Ip() ip: string) {
    return this.billing.record(actor, items, ip);
  }

  @Get('due')
  due(@CurrentUser() actor: AuthUser, @Query() query: DashboardQueryDto) {
    return this.meters.due(actor, query.buildingId);
  }
}

@Controller('invoices')
@Roles('BOSS', 'MANAGER')
export class MonthlyIssueController {
  constructor(private readonly billing: MeterBillingService) {}

  @Post(':id/issue')
  issue(@CurrentUser() actor: AuthUser, @Param() params: InvoiceIdParamsDto, @Ip() ip: string) {
    return this.billing.issue(actor, params.id, ip);
  }
}

@Controller('contracts')
@Roles('BOSS', 'MANAGER')
export class MissedInvoiceController {
  constructor(private readonly missed: MissedInvoiceService) {}

  @Post(':id/monthly-invoices')
  create(@CurrentUser() actor: AuthUser, @Param() params: ContractIdParamsDto, @Body() dto: CreateMissedInvoiceDto, @Ip() ip: string) {
    return this.missed.create(actor, params.id, dto.periodNo, ip);
  }
}
