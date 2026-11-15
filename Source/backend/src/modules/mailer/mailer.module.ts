import { Module } from '@nestjs/common';
import { ConsoleMailerService, MailerService, UnavailableMailerService } from './mailer.service.js';
import { ResendMailerService } from './resend-mailer.service.js';

// Optional until the owner configures Resend; never silently use console in production.
export function mailerServiceFor(nodeEnv: string | undefined, env: NodeJS.ProcessEnv = {}): MailerService {
  const apiKey = env.MAIL_API_KEY?.trim();
  const from = env.MAIL_FROM?.trim();
  if (env.MAIL_PROVIDER === 'resend' && apiKey && from) return new ResendMailerService({ apiKey, from });
  return nodeEnv === 'production' ? new UnavailableMailerService() : new ConsoleMailerService();
}

@Module({
  providers: [{ provide: MailerService, useFactory: () => mailerServiceFor(process.env.NODE_ENV, process.env) }],
  exports: [MailerService],
})
export class MailerModule {}
