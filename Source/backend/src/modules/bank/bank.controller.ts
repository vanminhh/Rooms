import { Body, Controller, Get, Header, Headers, HttpCode, Ip, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { parseIdempotencyKey } from '../pricing/pricing-idempotency.js';
import { BankTransactionsService } from './bank-transactions.service.js';
import { BankService } from './bank.service.js';
import { AssignTransactionDto, BankTransactionsQueryDto, BankTxIdParamsDto, MarkRefundedDto } from './dto/bank-transactions.dto.js';

// BANK-01, API-07: provider signature only; 200 on every verified call so the provider does not retry.
@Controller('webhooks/bank')
export class WebhookController {
  constructor(private readonly bank: BankService) {}

  @Public()
  @Post()
  @HttpCode(200)
  receive(@Req() req: Request) {
    return this.bank.processWebhook({ headers: req.headers, body: req.body });
  }
}

// BANK-05 · "Giao dịch ngân hàng", Boss only.
@Controller('bank-transactions')
@Roles('BOSS')
export class BankTransactionsController {
  constructor(private readonly transactions: BankTransactionsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Query() query: BankTransactionsQueryDto) {
    return this.transactions.list(query);
  }

  @Post(':id/assign')
  assign(@CurrentUser() actor: AuthUser, @Param() params: BankTxIdParamsDto, @Body() dto: AssignTransactionDto, @Ip() ip: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined) {
    return this.transactions.assign(actor, params.id, dto.invoiceId, ip, parseIdempotencyKey(idempotencyKey));
  }

  @Post(':id/mark-refunded')
  markRefunded(@CurrentUser() actor: AuthUser, @Param() params: BankTxIdParamsDto, @Body() dto: MarkRefundedDto, @Ip() ip: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined) {
    return this.transactions.markRefunded(actor, params.id, dto.note, ip, parseIdempotencyKey(idempotencyKey));
  }
}
