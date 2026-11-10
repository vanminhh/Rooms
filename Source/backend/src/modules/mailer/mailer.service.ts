import { Injectable, Logger } from '@nestjs/common';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

// Abstract so a real provider can replace the console one in MailerModule without touching callers.
export abstract class MailerService {
  abstract send(mail: Mail): Promise<void>;
}

// shortcut: logs the reset link (secret) to the console, dev only; replace with a real provider before production
@Injectable()
export class ConsoleMailerService extends MailerService {
  private readonly logger = new Logger(ConsoleMailerService.name);

  send(mail: Mail): Promise<void> {
    this.logger.log(`to: ${mail.to}\nsubject: ${mail.subject}\n${mail.text}`);
    return Promise.resolve();
  }
}
