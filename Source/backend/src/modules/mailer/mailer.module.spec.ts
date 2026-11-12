import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mailerServiceFor, MailerModule } from './mailer.module.js';
import { ConsoleMailerService, MailerService, UnavailableMailerService } from './mailer.service.js';

// AUTH-13, BE-EX-34: with no mail provider (Q-14) production fails with MAIL_UNAVAILABLE (503, 01-architecture#error-codes);
// development and test write the mail to the server log. The app starts without any MAIL_* variable.

describe('BE-EX-34: MailerService choice', () => {
  it('AUTH-13: production gets the failing adapter, development and test get the console one', () => {
    expect(mailerServiceFor('production')).toBeInstanceOf(UnavailableMailerService);
    expect(mailerServiceFor('development')).toBeInstanceOf(ConsoleMailerService);
    expect(mailerServiceFor('test')).toBeInstanceOf(ConsoleMailerService);
  });

  it('AUTH-13: UnavailableMailerService rejects with MAIL_UNAVAILABLE / 503', async () => {
    const err = await new UnavailableMailerService().send().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(503);
    expect((err as HttpException).getResponse()).toMatchObject({ message: 'MAIL_UNAVAILABLE' });
  });

  it('BE-EX-34: MailerModule starts with no MAIL_* variable set', async () => {
    const saved = Object.entries(process.env).filter(([k]) => k.startsWith('MAIL_'));
    for (const [k] of saved) delete process.env[k];
    try {
      const ref = await Test.createTestingModule({ imports: [MailerModule] }).compile();
      expect(ref.get(MailerService)).toBeInstanceOf(ConsoleMailerService); // vitest runs with NODE_ENV=test
      await ref.close();
    } finally {
      for (const [k, v] of saved) process.env[k] = v;
    }
  });
});
