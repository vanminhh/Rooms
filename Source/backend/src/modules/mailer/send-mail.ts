import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { Mail, MailerService } from './mailer.service.js';

const logger = new Logger('MailerService');

// NOTI-07: two bounded attempts, one key. Abort alone cannot undo a provider acceptance.
export async function sendWithRetry(mailer: MailerService, mail: Mail, idempotencyKey: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        mailer.send(mail, { idempotencyKey, signal: controller.signal }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Mail timeout')); }, 5_000);
        }),
      ]);
      return;
    } catch {
      logger.warn(`Email attempt ${attempt + 1} failed`);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  throw new ServiceUnavailableException(ErrorCode.MAIL_UNAVAILABLE);
}
