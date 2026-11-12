import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.js';

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

// Production with no mail provider (Q-14: Resend, set up by the owner): every send fails, so a sign-up never
// reports success when no email left (AUTH-13). Callers that must not fail (forgot password) only log it.
@Injectable()
export class UnavailableMailerService extends MailerService {
  send(): Promise<void> {
    return Promise.reject(new ServiceUnavailableException(ErrorCode.MAIL_UNAVAILABLE));
  }
}
