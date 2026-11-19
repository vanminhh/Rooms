import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import { createFakePrisma, type FakePrisma, IDS } from '../../../test/fixtures/fake-prisma.js';
import { credentialVersion } from '../../common/crypto/credential-version.js';
import { hashPassword } from '../../common/crypto/password.js';
import { sha256Hex } from '../../common/crypto/token.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { MailerService } from '../mailer/mailer.service.js';
import { AuthService } from './auth.service.js';
import type { OtpService } from './otp.service.js';
import { TokenService } from './token.service.js';

// The DB boundary schedules a committed competing write between verification and the
// transaction's locked read. No AuthService, Argon2, token or audit method is mocked.
describe('BE-P3-17 / AUTH-T3: stale credential work cannot undo a staff reset', () => {
  let fake: FakePrisma;
  let service: AuthService;
  let tokens: TokenService;
  let replacementHash: string;
  let previousSecret: string | undefined;
  const mail = { sendMail: vi.fn() };
  const originalPassword = 'NguoiThue@2026';
  const replacementPassword = 'Staff-reset-race-password-2026';
  const newPassword = 'Self-change-race-password-2026';
  const actor: AuthUser = { id: IDS.users.tenant, role: 'TENANT', buildingIds: [], mustChangePassword: false };

  beforeAll(async () => { replacementHash = await hashPassword(replacementPassword); });
  beforeEach(async () => {
    previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-only-credential-race-secret-0123456789';
    fake = await createFakePrisma();
    fake.account('tenant').mustChangePassword = false;
    const prisma = fake as unknown as PrismaService;
    tokens = new TokenService(new JwtService(), prisma);
    mail.sendMail.mockReset();
    service = new AuthService(prisma, tokens, new AuditService(prisma), mail as unknown as MailerService, {} as OtpService);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  // Returns completion so background forgot-password work is awaited, not asserted too early.
  function beforeNextTransaction(effect: () => void): Promise<void> {
    const original = fake.$transaction.bind(fake);
    let complete!: () => void;
    const finished = new Promise<void>(resolve => { complete = resolve; });
    fake.$transaction = async function<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
      fake.$transaction = original;
      effect();
      try { return await original(work); } finally { complete(); }
    };
    return finished;
  }

  function committedStaffReset() {
    fake.account('tenant').passwordHash = replacementHash;
    fake.account('tenant').mustChangePassword = true;
    for (const session of fake.db.session) {
      if (session.userId === actor.id && session.revokedAt === null) session.revokedAt = new Date();
    }
    for (const link of fake.db.passwordResetToken) {
      if (link.userId === actor.id && link.usedAt === null) link.usedAt = new Date();
    }
  }

  async function seedSession(raw = 'existing-refresh-cookie') {
    return fake.session.create({ data: {
      userId: actor.id, tokenHash: sha256Hex(raw), expiresAt: new Date(Date.now() + 60_000), remember: false,
    } });
  }
  async function seedLink(raw = 'existing-email-reset-link') {
    return fake.passwordResetToken.create({ data: {
      userId: actor.id, tokenHash: sha256Hex(raw), expiresAt: new Date(Date.now() + 60_000),
    } });
  }

  it('AUTH-01/T3: a password verified before reset cannot create a new surviving login session', async () => {
    void beforeNextTransaction(committedStaffReset);
    const create = vi.spyOn(fake.session, 'create');
    await expect(service.login({ phone: '0900000004', password: originalPassword })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(create).not.toHaveBeenCalled();
    expect(fake.db.session).toHaveLength(0);
    expect(fake.account('tenant')).toMatchObject({ passwordHash: replacementHash, mustChangePassword: true });
  });

  it('AUTH-02/T3: locking an account after password verification is rechecked before login writes', async () => {
    void beforeNextTransaction(() => { fake.account('tenant').isActive = false; });
    await expect(service.login({ phone: '0900000004', password: originalPassword })).rejects.toBeInstanceOf(ForbiddenException);
    expect(fake.db.session).toHaveLength(0);
    expect(fake.account('tenant').lastLoginAt).toBeNull();
  });

  it.each(['reset', 'revoked', 'expired', 'locked'] as const)('AUTH-T2/T3: refresh cannot revive a session after a competing %s', async reason => {
    await seedSession();
    void beforeNextTransaction(() => {
      if (reason === 'reset') committedStaffReset();
      if (reason === 'revoked') fake.db.session[0].revokedAt = new Date();
      if (reason === 'expired') fake.db.session[0].expiresAt = new Date(Date.now() - 1);
      if (reason === 'locked') fake.account('tenant').isActive = false;
    });
    const create = vi.spyOn(fake.session, 'create');
    await expect(service.refresh('existing-refresh-cookie')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(create).not.toHaveBeenCalled();
    expect(fake.db.session).toHaveLength(1);
  });

  it('AUTH-05/T3: a self-change that verified the old password cannot overwrite a completed staff reset', async () => {
    await seedSession();
    void beforeNextTransaction(committedStaffReset);
    const update = vi.spyOn(fake.user, 'update');
    await expect(service.changePassword(actor, { currentPassword: originalPassword, newPassword }, 'existing-refresh-cookie'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(update).not.toHaveBeenCalled();
    expect(fake.account('tenant')).toMatchObject({ passwordHash: replacementHash, mustChangePassword: true });
    expect(fake.db.session[0].revokedAt).toBeInstanceOf(Date);
    expect(fake.db.auditLog).toHaveLength(0);
  });

  it('AUTH-02/T3: deactivation during self-change is rechecked before changing credentials', async () => {
    const originalHash = fake.account('tenant').passwordHash;
    void beforeNextTransaction(() => { fake.account('tenant').isActive = false; });
    await expect(service.changePassword(actor, { currentPassword: originalPassword, newPassword }, undefined))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(fake.account('tenant').passwordHash).toBe(originalHash);
    expect(fake.account('tenant').isActive).toBe(false);
    expect(fake.db.auditLog).toHaveLength(0);
  });

  it('AUTH-07/T3: a previously read email reset link cannot clear the flag or replace a newer staff password', async () => {
    await seedLink();
    void beforeNextTransaction(committedStaffReset);
    const update = vi.spyOn(fake.user, 'update');
    await expect(service.resetPassword({ token: 'existing-email-reset-link', newPassword }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
    expect(fake.account('tenant')).toMatchObject({ passwordHash: replacementHash, mustChangePassword: true });
    expect(fake.db.passwordResetToken[0].usedAt).toBeInstanceOf(Date);
    expect(fake.db.auditLog).toHaveLength(0);
  });

  it.each(['expired', 'locked'] as const)('AUTH-07/T3: a link that becomes %s during hashing cannot change the password', async reason => {
    await seedLink();
    const originalHash = fake.account('tenant').passwordHash;
    void beforeNextTransaction(() => {
      if (reason === 'expired') fake.db.passwordResetToken[0].expiresAt = new Date(Date.now() - 1);
      else fake.account('tenant').isActive = false;
    });
    await expect(service.resetPassword({ token: 'existing-email-reset-link', newPassword }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(fake.account('tenant').passwordHash).toBe(originalHash);
    expect(fake.db.passwordResetToken[0].usedAt).toBeNull();
  });

  it.each(['reset', 'email', 'locked'] as const)('AUTH-07/T3: background recovery does not issue a fresh link after a competing %s', async reason => {
    fake.account('tenant').email = 'tenant@example.test';
    const finished = beforeNextTransaction(() => {
      if (reason === 'reset') committedStaffReset();
      if (reason === 'email') fake.account('tenant').email = 'replacement@example.test';
      if (reason === 'locked') fake.account('tenant').isActive = false;
    });
    await service.forgotPassword({ phone: '0900000004' });
    await finished;
    expect(fake.db.passwordResetToken).toHaveLength(0);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('AUTH-T1/T3: a login completing just before reset signs its verified snapshot, not newer credentials', async () => {
    const verifiedHash = fake.account('tenant').passwordHash as string;
    const original = fake.$transaction.bind(fake);
    fake.$transaction = async function<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
      fake.$transaction = original;
      const result = await original(work);
      committedStaffReset();
      return result;
    };
    const login = await service.login({ phone: '0900000004', password: originalPassword });
    const payload = await tokens.verifyAccessToken(login.accessToken);
    expect(payload.cv).toBe(credentialVersion(actor.id, verifiedHash));
    expect(payload.cv).not.toBe(credentialVersion(actor.id, replacementHash));
    expect(fake.db.session[0].revokedAt).toBeInstanceOf(Date);
    expect(fake.account('tenant').mustChangePassword).toBe(true);
  });
});
