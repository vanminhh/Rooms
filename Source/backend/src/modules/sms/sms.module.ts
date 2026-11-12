import { Module } from '@nestjs/common';
import { ConsoleSmsService, SmsService, UnavailableSmsService } from './sms.service.js';

// NODE_ENV is required (DEP-05). No SMS_* variable is read until a provider is chosen (Q-07).
export const smsServiceFor = (nodeEnv: string | undefined): SmsService =>
  nodeEnv === 'production' ? new UnavailableSmsService() : new ConsoleSmsService();

@Module({
  providers: [{ provide: SmsService, useFactory: () => smsServiceFor(process.env.NODE_ENV) }],
  exports: [SmsService],
})
export class SmsModule {}
