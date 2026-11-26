import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Ip, Param, Post, Query, Req, Res, type RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { parseIdempotencyKey } from '../pricing/pricing-idempotency.js';
import { BankTransactionsService } from './bank-transactions.service.js';
import { BankService } from './bank.service.js';
import { BANK_ADAPTER, fakeAdapter, type BankWebhookAdapter } from './webhook-adapter.js';
import { AssignTransactionDto, BankTransactionsQueryDto, BankTxIdParamsDto, MarkRefundedDto } from './dto/bank-transactions.dto.js';

// BANK-01: acknowledge the provider after processing has completed.
@Controller('webhooks/bank')
export class WebhookController {
  constructor(private readonly bank: BankService, @Inject(BANK_ADAPTER) private readonly adapter: BankWebhookAdapter) {}

  @Public()
  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    const summary = await this.bank.processWebhook({ headers: req.headers, body: req.body, rawBody: req.rawBody });
    res.status(200).json(this.adapter === fakeAdapter ? { data: summary } : { success: true });
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
