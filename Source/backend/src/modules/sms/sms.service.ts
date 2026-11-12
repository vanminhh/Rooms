import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.js';

export interface Sms {
  to: string;
  text: string;
}

// AUTH-13: one adapter; the real provider (Q-07) replaces the class bound in SmsModule without touching callers.
export abstract class SmsService {
  abstract send(sms: Sms): Promise<void>;
}

// shortcut: writes the code (a secret) to the server log, dev and test only; a real provider replaces it once Q-07 is answered
@Injectable()
export class ConsoleSmsService extends SmsService {
  private readonly logger = new Logger(ConsoleSmsService.name);

  send(sms: Sms): Promise<void> {
    this.logger.log(`to: ${sms.to}\n${sms.text}`);
    return Promise.resolve();
  }
}

// Production with no provider: every send fails, so no request reports success without an SMS (AUTH-13).
@Injectable()
export class UnavailableSmsService extends SmsService {
  send(): Promise<void> {
    return Promise.reject(new ServiceUnavailableException(ErrorCode.SMS_UNAVAILABLE));
  }
}
