import { HttpException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mailerServiceFor } from './mailer.module.js';
import { ConsoleMailerService, UnavailableMailerService } from './mailer.service.js';
import { ResendMailerService } from './resend-mailer.service.js';
import { sendWithRetry } from './send-mail.js';

const mail = { to: 'recipient@example.test', subject: 'Subject', text: 'Body with a private code' };
const config = { apiKey: 'private-api-key', from: 'Rooms <rooms@example.test>' };
afterEach(() => vi.useRealTimers());

describe('BE-EX-28: Resend HTTP boundary', () => {
  it('AUTH-13: sends the documented body, bearer header and stable idempotency key', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 }));
    await new ResendMailerService(config, http).send(mail, { idempotencyKey: 'event-1' });
    const [url, options] = http.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer private-api-key', 'Content-Type': 'application/json', 'Idempotency-Key': 'event-1' } });
    expect(JSON.parse(options!.body as string)).toEqual({ from: config.from, to: [mail.to], subject: mail.subject, text: mail.text });
  });
  for (const status of [400, 401, 403, 409, 422, 429, 500]) it(`AUTH-13: provider ${status} becomes a safe 503 without its response body`, async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response('private-api-key private-code', { status }));
    const error = await new ResendMailerService(config, http).send(mail).catch(e => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(503);
    expect(JSON.stringify(error)).not.toMatch(/private-api-key|private-code/);
    expect(error.getResponse()).toMatchObject({ message: 'MAIL_UNAVAILABLE' });
  });
  it('AUTH-13: an acknowledgement without a message id is not reported as sent', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(new ResendMailerService(config, http).send(mail)).rejects.toThrow('MAIL_UNAVAILABLE');
  });
  it('NOTI-07: aborts a timed-out request and retries once with the same key and content', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const http = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      const signal = options!.signal!;
      signals.push(signal);
      signal.addEventListener('abort', () => reject(new Error('timeout with private-api-key')), { once: true });
    }));
    const outcome = sendWithRetry(new ResendMailerService(config, http), mail, 'same-event').catch(e => e);
    await vi.advanceTimersByTimeAsync(10_001);
    expect((await outcome).getResponse()).toMatchObject({ message: 'MAIL_UNAVAILABLE' });
    expect(http).toHaveBeenCalledTimes(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(http.mock.calls.map(([, options]) => (options!.headers as Record<string, string>)['Idempotency-Key'])).toEqual(['same-event', 'same-event']);
    expect(http.mock.calls[0][1]!.body).toBe(http.mock.calls[1][1]!.body);
  });
  it('NOTI-07: a transient failure retries exactly once and can succeed', async () => {
    const http = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(new Response('{"id":"mail-2"}'));
    await sendWithRetry(new ResendMailerService(config, http), mail, 'event-2');
    expect(http).toHaveBeenCalledTimes(2);
  });
  it('BE-EX-28: only complete Resend configuration selects the provider; no keys are required to boot', () => {
    expect(mailerServiceFor('development', { MAIL_PROVIDER: 'resend', MAIL_API_KEY: config.apiKey, MAIL_FROM: config.from })).toBeInstanceOf(ResendMailerService);
    expect(mailerServiceFor('production', { MAIL_PROVIDER: 'resend', MAIL_API_KEY: config.apiKey, MAIL_FROM: config.from })).toBeInstanceOf(ResendMailerService);
    expect(mailerServiceFor('test', {})).toBeInstanceOf(ConsoleMailerService);
    expect(mailerServiceFor('production', { MAIL_PROVIDER: 'resend', MAIL_API_KEY: config.apiKey })).toBeInstanceOf(UnavailableMailerService);
    expect(mailerServiceFor('production', { MAIL_PROVIDER: 'unknown', MAIL_API_KEY: config.apiKey, MAIL_FROM: config.from })).toBeInstanceOf(UnavailableMailerService);
  });
});
