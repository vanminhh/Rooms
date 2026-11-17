import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { createFakePrisma } from '../../../test/fixtures/fake-prisma.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { MailerService } from '../mailer/mailer.service.js';
import { AuthService } from './auth.service.js';
import type { OtpService } from './otp.service.js';
import type { TokenService } from './token.service.js';

it('AUTH-12 / CON-07: an already checked OTP cannot log in after the account becomes a pending tenant', async () => {
  const fake = await createFakePrisma();
  const phone = '0912345678';
  const guest = await fake.user.create({ data: {
    phone, role: 'GUEST', fullName: 'Khách', email: 'old@example.test', emailVerifiedAt: null, isActive: true,
  } });
  const otp = {
    lock: vi.fn(),
    check: vi.fn(async () => {
      // The contract transaction finishes while verifyEmail holds its first account snapshot.
      await fake.user.update({ where: { id: guest.id }, data: { role: 'TENANT', isActive: false } });
      return 1;
    }),
    markUsed: vi.fn(),
  };
  const tokens = {
    signAccessToken: vi.fn(async () => 'test-access-token'),
    refreshExpiresAt: vi.fn(() => new Date('2027-01-01')),
  };
  const service = new AuthService(fake as unknown as PrismaService, tokens as unknown as TokenService,
    {} as AuditService, {} as MailerService, otp as unknown as OtpService);

  await expect(service.verifyEmail({ phone, code: '123456' })).rejects.toBeInstanceOf(BadRequestException);
  expect(otp.markUsed).not.toHaveBeenCalled();
  expect(tokens.signAccessToken).not.toHaveBeenCalled();
  expect(fake.db.session).toHaveLength(0);
});

it('AUTH-01 / CON-07: a password attempt on a pending tenant takes the same Argon2 path as an unknown phone', async () => {
  const fake = await createFakePrisma();
  const phone = '0912345678';
  await fake.user.create({ data: {
    phone, role: 'TENANT', isActive: false, passwordHash: '!pending-contract-tenant',
  } });
  const service = new AuthService(fake as unknown as PrismaService, {} as TokenService,
    {} as AuditService, {} as MailerService, {} as OtpService);
  const verify = vi.spyOn(argon2, 'verify');
  try {
    await expect(service.login({ phone: '0912345679', password: 'invalid-test-password' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.login({ phone, password: 'invalid-test-password' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[0][0]).toMatch(/^\$argon2id\$/);
    expect(verify.mock.calls[1][0]).toBe(verify.mock.calls[0][0]);
    expect(fake.db.session).toHaveLength(0);
  } finally {
    verify.mockRestore();
  }
});
