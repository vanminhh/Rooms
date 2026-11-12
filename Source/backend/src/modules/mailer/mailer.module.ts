import { Module } from '@nestjs/common';
import { ConsoleMailerService, MailerService, UnavailableMailerService } from './mailer.service.js';

// NODE_ENV is required (DEP-05). No MAIL_* variable is read until the provider is set up (Q-14, EX-8).
export const mailerServiceFor = (nodeEnv: string | undefined): MailerService =>
  nodeEnv === 'production' ? new UnavailableMailerService() : new ConsoleMailerService();

@Module({
  providers: [{ provide: MailerService, useFactory: () => mailerServiceFor(process.env.NODE_ENV) }],
  exports: [MailerService],
})
export class MailerModule {}
