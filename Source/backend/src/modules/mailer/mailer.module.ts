import { Module } from '@nestjs/common';
import { ConsoleMailerService, MailerService } from './mailer.service.js';

@Module({
  providers: [{ provide: MailerService, useClass: ConsoleMailerService }],
  exports: [MailerService],
})
export class MailerModule {}
