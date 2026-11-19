import { mailLocale, type Lang } from '../../common/i18n/locale.js';
import { emailTemplate } from '../mailer/email-templates.js';
import { sendWithRetry } from '../mailer/send-mail.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role, type User } from '@prisma/client';
import { hashPassword, PENDING_TENANT_PASSWORD_HASH, verifyPassword } from '../../common/crypto/password.js';
import { randomToken, sha256Hex } from '../../common/crypto/token.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import {
  RESET_LINK_MSG,
  type ChangePasswordDto,
  type ForgotPasswordDto,
  type LoginDto,
  type RegisterDto,
  type ResendCodeDto,
  type ResetPasswordDto,
  type UpdateMeDto,
  type VerifyEmailDto,
} from './dto/auth.dto.js';
import { OtpService } from './otp.service.js';
import { RateLimiter } from './rate-limiter.js';
import { TokenService } from './token.service.js';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
// AUTH-11 wording, carried in fields: the PHONE_TAKEN message itself is shared with manager creation.
export const PHONE_TAKEN_SIGNUP_MSG = 'Số điện thoại đã có tài khoản. Hãy đăng nhập hoặc dùng Quên mật khẩu';
export const EMAIL_TAKEN_SIGNUP_MSG = 'Email đã được dùng cho tài khoản khác';

export type Locale = 'vi' | 'en';

export interface MeBuilding {
  id: number;
  code: string;
  name: string;
}

export interface Me {
  id: number;
  role: Role;
  phone: string;
  fullName: string;
  email: string | null;
  mustChangePassword: boolean;
  emailVerified: boolean; // AUTH-12
  locale: string; // AUTH-15
  contactPhone: string | null;
  zaloUrl: string | null;
  facebookUrl: string | null;
  buildings?: MeBuilding[]; // BOSS / MANAGER only
}

// Handed to the controller to build the `rt` cookie; never part of a response body.
export interface IssuedSession {
  token: string;
  expiresAt: Date;
  remember: boolean;
}

@Injectable()
export class AuthService {
  // AUTH-04, keyed by phone. State lives in this instance, so a fresh app has fresh counters.
  private readonly loginLimiter = new RateLimiter();
  // AUTH-07 (Q4e): separate counter, same threshold; a forgot-password flood must not lock login.
  private readonly forgotLimiter = new RateLimiter();
  private readonly logger = new Logger(AuthService.name);
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly otp: OtpService,
  ) {}

  // AUTH-01, AUTH-02, AUTH-04 (Q2).
  async login(
    dto: LoginDto,
    userAgent?: string,
  ): Promise<{ accessToken: string; user: Me; session: IssuedSession }> {
    const { phone, password } = dto;
    // A blocked phone gets 429 even with the right password, and a 429 is not counted again.
    if (this.loginLimiter.isBlocked(phone)) {
      throw new HttpException(ErrorCode.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS);
    }
    // Counted before the first await: the check and the record run in one sync step, so parallel wrong logins cannot all pass.
    const attemptAt = Date.now();
    this.loginLimiter.record(phone, attemptAt);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    // Unknown phones and pending tenants pay for one Argon2 verify (AUTH-01, CON-07).
    const pending = user?.passwordHash === PENDING_TENANT_PASSWORD_HASH;
    const matches = await verifyPassword(user && !pending ? user.passwordHash : await this.getDummyHash(), password);
    if (!user || pending || !matches) throw new UnauthorizedException(ErrorCode.INVALID_CREDENTIALS);
    // Right password on a locked account: not counted, so take back this attempt only (Q2d).
    if (!user.isActive) {
      this.loginLimiter.remove(phone, attemptAt);
      throw new ForbiddenException(ErrorCode.ACCOUNT_LOCKED);
    }
    // AUTH-12: checked only after the right password, so it reveals nothing to a guesser (owner 12/11/2026). No code is sent.
    if (isUnverifiedGuest(user)) {
      this.loginLimiter.remove(phone, attemptAt);
      throw new ForbiddenException(ErrorCode.EMAIL_NOT_VERIFIED);
    }

    const remember = dto.remember ?? false;
    const { session, credentials } = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current || current.passwordHash !== user.passwordHash || current.phone !== phone) {
        throw new UnauthorizedException(ErrorCode.INVALID_CREDENTIALS);
      }
      if (!current.isActive) throw new ForbiddenException(ErrorCode.ACCOUNT_LOCKED);
      if (isUnverifiedGuest(current)) throw new ForbiddenException(ErrorCode.EMAIL_NOT_VERIFIED);
      return { session: await this.startSession(tx, current.id, remember, userAgent), credentials: current };
    });
    this.loginLimiter.reset(phone);
    return {
      accessToken: await this.tokens.signAccessToken(credentials),
      user: await this.getMe(user.id),
      session,
    };
  }

  // AUTH-T2: one session row + lastLoginAt, inside the caller's transaction.
  private async startSession(
    tx: Prisma.TransactionClient,
    userId: number,
    remember: boolean,
    userAgent: string | undefined,
    now: Date = new Date(),
  ): Promise<IssuedSession> {
    const token = randomToken();
    const expiresAt = this.tokens.refreshExpiresAt(remember, now);
    await tx.user.update({ where: { id: userId }, data: { lastLoginAt: now } });
    await tx.session.create({
      data: { userId, tokenHash: sha256Hex(token), remember, expiresAt, userAgent },
    });
    return { token, expiresAt, remember };
  }

  // AUTH-11. A self-registered account that never passed the code is replaced (by phone or by email), so nobody can
  // block a number or an address they do not own. A phone and an email that belong to two different accounts are
  // never merged: the email is refused (owner 12/11/2026).
  async register(dto: RegisterDto, locale: Locale, ip?: string): Promise<void> {
    const { phone } = dto;
    const email = dto.email.trim().toLowerCase();
    this.otp.takeIp(ip);
    const passwordHash = await hashPassword(dto.password);
    const fullName = dto.fullName.trim();
    const issued = await this.prisma.$transaction(async (tx) => {
      // Phone lock first, then email lock (OtpService.issue takes the email lock again, which is harmless).
      await this.otp.lock(tx, `phone:${phone}`);
      await this.otp.lock(tx, `email:${email}`);
      const byPhone = await tx.user.findUnique({ where: { phone } });
      const byEmail = await tx.user.findUnique({ where: { email } });
      // Verified, created by staff, or locked by staff (owner 12/11/2026: never revived) -> taken.
      if (byPhone && !isReplaceable(byPhone)) {
        throw new ConflictException({ code: ErrorCode.PHONE_TAKEN, fields: { phone: PHONE_TAKEN_SIGNUP_MSG } });
      }
      if (byEmail && (!isReplaceable(byEmail) || (byPhone && byPhone.id !== byEmail.id))) {
        throw new ConflictException({ code: ErrorCode.EMAIL_TAKEN, fields: { email: EMAIL_TAKEN_SIGNUP_MSG } });
      }
      const data = { fullName, phone, email, passwordHash, mustChangePassword: false, locale };
      const target = byPhone ?? byEmail;
      if (target) await tx.user.update({ where: { id: target.id }, data });
      else await tx.user.create({ data: { role: 'GUEST', ...data } });
      return this.otp.issue(tx, email);
    });
    await this.otp.deliver(email, issued, locale);
  }

  // AUTH-12: the code proves the email; the account is verified and logged in, like login (AUTH-T1, AUTH-T2).
  // The code is looked up through the account's current email, so a replaced account cannot be verified with an old code.
  async verifyEmail(
    dto: VerifyEmailDto,
    userAgent?: string,
  ): Promise<{ accessToken: string; user: Me; session: IssuedSession }> {
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user || !isUnverifiedGuest(user) || !user.email) throw new BadRequestException(ErrorCode.OTP_INVALID);
    const email = user.email;
    const codeId = await this.otp.check(email, dto.code);
    if (!user.isActive) throw new ForbiddenException(ErrorCode.ACCOUNT_LOCKED);
    const { session, credentials } = await this.prisma.$transaction(async (tx) => {
      // AUTH-12 / CON-07: the account may be replaced or promoted while the code is checked.
      await this.otp.lock(tx, `phone:${dto.phone}`);
      await this.otp.lock(tx, `email:${email}`);
      const current = await tx.user.findUnique({ where: { phone: dto.phone } });
      if (!current || current.id !== user.id || current.email !== email || !isUnverifiedGuest(current)) {
        throw new BadRequestException(ErrorCode.OTP_INVALID);
      }
      if (!current.isActive) throw new ForbiddenException(ErrorCode.ACCOUNT_LOCKED);
      const now = new Date();
      await this.otp.markUsed(tx, codeId, now);
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
      return { session: await this.startSession(tx, user.id, false, userAgent, now), credentials: current };
    });
    return {
      accessToken: await this.tokens.signAccessToken(credentials),
      user: await this.getMe(user.id),
      session,
    };
  }

  // AUTH-13. Always the same empty reply (owner 12/11/2026): the work runs after it, so neither the body nor the time
  // tells whether the phone has an account; limits and mail failures are only logged.
  resendCode(dto: ResendCodeDto, ip?: string): void {
    void this.resendInBackground(dto, ip).catch((e: unknown) =>
      this.logger.warn(`Resend code not sent (${e instanceof HttpException ? JSON.stringify(e.getResponse()) : 'error'})`),
    );
  }

  // Only an account still waiting for its code gets one.
  private async resendInBackground({ phone }: ResendCodeDto, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || !isReplaceable(user) || !user.email) return;
    await this.otp.send(user.email, ip, mailLocale(user));
  }

  // AUTH-T2 rotation. The new session keeps the old expiresAt: the 12 h / 30 d cap counts from login (Q1).
  async refresh(
    rawToken: string | undefined,
    userAgent?: string,
  ): Promise<{ accessToken: string; session: IssuedSession }> {
    if (!rawToken) throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);
    const old = await this.prisma.session.findUnique({ where: { tokenHash: sha256Hex(rawToken) } });
    const now = new Date();
    if (!old || old.revokedAt !== null || old.expiresAt <= now) {
      throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);
    }
    const user = await this.prisma.user.findUnique({ where: { id: old.userId } });
    if (!user?.isActive) throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);

    const token = randomToken();
    const credentials = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${old.userId} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: old.userId } });
      if (!current?.isActive || current.passwordHash !== user.passwordHash) {
        throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);
      }
      const { count } = await tx.session.updateMany({
        where: { id: old.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: now },
      });
      // Another request rotated the same token first.
      if (count === 0) throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);
      await tx.session.create({
        data: {
          userId: old.userId,
          tokenHash: sha256Hex(token),
          remember: old.remember,
          expiresAt: old.expiresAt,
          userAgent,
        },
      });
      return current;
    });
    return {
      accessToken: await this.tokens.signAccessToken(credentials),
      session: { token, expiresAt: old.expiresAt, remember: old.remember },
    };
  }

  // Always succeeds: no cookie or an unknown token is already "logged out".
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: sha256Hex(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // AUTH-09 (Q5). undefined = leave as is, null = clear. Staff-only contact fields are refused for a tenant.
  async updateMe(user: AuthUser, dto: UpdateMeDto): Promise<Me> {
    const { email, contactPhone, zaloUrl, facebookUrl, locale } = dto;
    if (
      ((user.role === 'TENANT' || user.role === 'GUEST') &&
        (contactPhone !== undefined || zaloUrl !== undefined || facebookUrl !== undefined)) ||
      // AUTH-09, AUTH-12: a guest's email is the address the code verified; changing or clearing it here would skip that check.
      (user.role === 'GUEST' && email !== undefined)
    ) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }
    const data: Prisma.UserUpdateInput = {};
    if (email !== undefined) data.email = email === null ? null : email.toLowerCase();
    if (contactPhone !== undefined) data.contactPhone = contactPhone;
    if (zaloUrl !== undefined) data.zaloUrl = zaloUrl;
    if (facebookUrl !== undefined) data.facebookUrl = facebookUrl;
    if (locale !== undefined) data.locale = locale;
    try {
      await this.prisma.user.update({ where: { id: user.id }, data });
    } catch (e) {
      // Only the email can collide here (phone is not editable).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          fields: { email: 'Email đã được sử dụng' },
        });
      }
      throw e;
    }
    return this.getMe(user.id);
  }

  // AUTH-05, AUTH-T3 (Q3). Keeps the session of `rawToken`, revokes the others (P12).
  async changePassword(
    user: AuthUser,
    dto: ChangePasswordDto,
    rawToken: string | undefined,
    ip?: string,
  ): Promise<void> {
    const current = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!current) throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);
    // Not counted by the AUTH-04 limiter (Q3c): the caller already holds a valid access token.
    if (!(await verifyPassword(current.passwordHash, dto.currentPassword))) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        fields: { currentPassword: 'Mật khẩu hiện tại không đúng' },
      });
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        fields: { newPassword: 'Mật khẩu mới phải khác mật khẩu hiện tại' },
      });
    }
    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const latest = await tx.user.findUnique({ where: { id: user.id } });
      if (!latest?.isActive || latest.passwordHash !== current.passwordHash) {
        throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);
      }
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.session.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          ...(rawToken ? { tokenHash: { not: sha256Hex(rawToken) } } : {}),
        },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(user.id, 'user.change_password', 'user', user.id, undefined, undefined, ip, tx);
    });
  }

  // AUTH-07 (Q4). Every outcome returns normally, so the reply never tells whether the phone has an account.
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const { phone } = dto;
    if (this.forgotLimiter.isBlocked(phone)) return;
    this.forgotLimiter.record(phone); // counts unknown phones too
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || !user.isActive || !user.email) return;
    // AUTH-07: a self-registered guest whose email is not verified gets no link; staff-created accounts never verify, so they keep theirs.
    if (user.role === Role.GUEST && !user.emailVerifiedAt) return;

    // Not awaited: the reply time must not depend on the token write or the mail send (AUTH-07).
    void this.sendResetLink({ id: user.id, email: user.email, passwordHash: user.passwordHash, locale: mailLocale(user) }).catch((e) =>
      // Name only: the error text could echo the mail body, which holds the token.
      this.logger.error(`Could not send the password reset link (${e instanceof Error ? e.name : 'unknown error'})`),
    );
  }

  // Runs after forgotPassword has replied; its caller catches errors.
  private async sendResetLink(user: { id: number; email: string; passwordHash: string; locale: Lang }): Promise<void> {
    const token = randomToken();
    const now = new Date();
    const issued = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current?.isActive || current.email !== user.email || current.passwordHash !== user.passwordHash) return false;
      // A new link voids the older unused ones (Q4d).
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256Hex(token),
          expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
        },
      });
      return true;
    });
    if (!issued) return;
    await sendWithRetry(this.mailer, {
      to: user.email,
      ...await emailTemplate(this.prisma, 'passwordReset', user.locale, { url: `${process.env.APP_URL}/quen-mat-khau?token=${token}` }),
    }, `password-reset/${sha256Hex(token)}`);
  }

  // AUTH-07, AUTH-T3 (Q4). Revokes every session of the user (spec section 3.4 of the plan).
  async resetPassword(dto: ResetPasswordDto, ip?: string): Promise<void> {
    const invalidLink = () =>
      new BadRequestException({ code: ErrorCode.VALIDATION_FAILED, fields: { token: RESET_LINK_MSG } });
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(dto.token) },
    });
    const now = new Date();
    if (!record || record.usedAt !== null || record.expiresAt <= now) throw invalidLink();

    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${record.userId} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: record.userId } });
      if (!current?.isActive) throw invalidLink();
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: now },
      });
      // Another request used the same link first.
      if (count === 0) throw invalidLink();
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.audit.log(record.userId, 'user.reset_password', 'user', record.userId, undefined, undefined, ip, tx);
    });
  }

  private getDummyHash(): Promise<string> {
    return (this.dummyHash ??= hashPassword('not-a-real-password'));
  }

  // Picks fields one by one: passwordHash, isActive and timestamps can never leak (BE-LOGIN-15).
  async getMe(userId: number): Promise<Me> {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);
    const me: Me = {
      id: u.id,
      role: u.role,
      phone: u.phone,
      fullName: u.fullName,
      email: u.email,
      mustChangePassword: u.mustChangePassword,
      emailVerified: u.emailVerifiedAt !== null,
      locale: u.locale,
      contactPhone: u.contactPhone,
      zaloUrl: u.zaloUrl,
      facebookUrl: u.facebookUrl,
    };
    if (u.role === 'BOSS' || u.role === 'MANAGER') {
      me.buildings = await this.prisma.building.findMany({
        where: u.role === 'BOSS' ? { isActive: true } : { managerId: u.id, isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      });
    }
    return me;
  }
}

// AUTH-11, AUTH-12: staff never create a GUEST, so "self-registered and never verified" is exactly this.
const isUnverifiedGuest = (u: Pick<User, 'role' | 'emailVerifiedAt'>): boolean =>
  u.role === 'GUEST' && u.emailVerifiedAt === null;

// Such an account may be replaced by a new sign-up and may get a new code; a locked one never (D-26).
const isReplaceable = (u: Pick<User, 'role' | 'emailVerifiedAt' | 'isActive'>): boolean =>
  isUnverifiedGuest(u) && u.isActive;
