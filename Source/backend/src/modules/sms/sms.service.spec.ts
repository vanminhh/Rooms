import { HttpException, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmsModule, smsServiceFor } from './sms.module.js';
import { ConsoleSmsService, SmsService, UnavailableSmsService } from './sms.service.js';

// AUTH-13, BE-EX-02: one SmsService adapter; dev/test write the code to the server log; production without a provider
// (Q-07 open) fails with SMS_UNAVAILABLE (503, 01-architecture#error-codes). No SMS_* variable is needed to start.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BE-EX-02: SmsService', () => {
  it('AUTH-13: ConsoleSmsService writes the recipient and the text to the server log and resolves', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await expect(new ConsoleSmsService().send({ to: '0900000006', text: 'Mã 123456' })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('0900000006');
    expect(String(log.mock.calls[0][0])).toContain('Mã 123456');
  });

  it('AUTH-13: UnavailableSmsService rejects with SMS_UNAVAILABLE / 503', async () => {
    const err = await new UnavailableSmsService().send().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(503);
    expect((err as HttpException).getResponse()).toMatchObject({ message: 'SMS_UNAVAILABLE' });
  });

  it('AUTH-13 / DEP-05: production gets the failing adapter, development and test get the console one', () => {
    expect(smsServiceFor('production')).toBeInstanceOf(UnavailableSmsService);
    expect(smsServiceFor('development')).toBeInstanceOf(ConsoleSmsService);
    expect(smsServiceFor('test')).toBeInstanceOf(ConsoleSmsService);
  });

  it('BE-EX-02: SmsModule starts with no SMS_* variable set', async () => {
    const saved = Object.entries(process.env).filter(([k]) => k.startsWith('SMS_'));
    for (const [k] of saved) delete process.env[k];
    try {
      const ref = await Test.createTestingModule({ imports: [SmsModule] }).compile();
      expect(ref.get(SmsService)).toBeInstanceOf(ConsoleSmsService); // vitest runs with NODE_ENV=test
      await ref.close();
    } finally {
      for (const [k, v] of saved) process.env[k] = v;
    }
  });
});
