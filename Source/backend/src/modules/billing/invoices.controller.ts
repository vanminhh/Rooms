import { Body, Controller, Headers, Ip, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../../common/guards/auth.decorators.js';
import { parseIdempotencyKey } from '../pricing/pricing-idempotency.js';
import { BillingService } from './billing.service.js';
import { InvoiceIdParamsDto, RecordPaymentDto } from './dto/record-payment.dto.js';

@Controller('invoices')
@Roles('BOSS', 'MANAGER')
export class InvoicesController {
  constructor(private readonly billing: BillingService) {}

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
}
