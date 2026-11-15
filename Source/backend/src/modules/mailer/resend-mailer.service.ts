import { ServiceUnavailableException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.js';
import { MailerService, type Mail, type MailOptions } from './mailer.service.js';

// BE-EX-28: one HTTP attempt. sendWithRetry owns retries and the logical email's key.
export class ResendMailerService extends MailerService {
  constructor(private readonly config: { apiKey: string; from: string }, private readonly http: typeof fetch = fetch) {
    super();
  }

  async send(mail: Mail, options: MailOptions = {}): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await this.http('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
          ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
        },
        body: JSON.stringify({ from: this.config.from, to: [mail.to], subject: mail.subject, text: mail.text }),
        signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal,
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Mail provider refused the request');
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string' || !result.id) {
        throw new Error('Mail provider did not acknowledge delivery');
      }
    } catch {
      // Provider bodies/errors can contain the API key, recipient or one-time token.
      throw new ServiceUnavailableException(ErrorCode.MAIL_UNAVAILABLE);
    } finally {
      clearTimeout(timer);
    }
  }
}
