import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type Role } from '@prisma/client';
import { hashPassword, verifyPassword } from '../../common/crypto/password.js';
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
  type ResetPasswordDto,
  type UpdateMeDto,
} from './dto/auth.dto.js';
import { RateLimiter } from './rate-limiter.js';
import { TokenService } from './token.service.js';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

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
    // Unknown phone still pays for one argon2 verify, so the reply time does not reveal it (AUTH-01).
    const matches = await verifyPassword(user?.passwordHash ?? (await this.getDummyHash()), password);
    if (!user || !matches) throw new UnauthorizedException(ErrorCode.INVALID_CREDENTIALS);
    // Right password on a locked account: not counted, so take back this attempt only (Q2d).
    if (!user.isActive) {
      this.loginLimiter.remove(phone, attemptAt);
      throw new ForbiddenException(ErrorCode.ACCOUNT_LOCKED);
    }

    this.loginLimiter.reset(phone);
    const now = new Date();
    const remember = dto.remember ?? false;
    const token = randomToken();
    const expiresAt = this.tokens.refreshExpiresAt(remember, now);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
      await tx.session.create({
        data: { userId: user.id, tokenHash: sha256Hex(token), remember, expiresAt, userAgent },
      });
    });
    return {
      accessToken: await this.tokens.signAccessToken(user),
      user: await this.getMe(user.id),
      session: { token, expiresAt, remember },
    };
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
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.session.updateMany({
        where: { id: old.id, revokedAt: null },
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
    });
    return {
      accessToken: await this.tokens.signAccessToken(user),
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
    const { email, contactPhone, zaloUrl, facebookUrl } = dto;
    if (
      user.role === 'TENANT' &&
      (contactPhone !== undefined || zaloUrl !== undefined || facebookUrl !== undefined)
    ) {
      throw new ForbiddenException(ErrorCode.FORBIDDEN);
    }
    const data: Prisma.UserUpdateInput = {};
    if (email !== undefined) data.email = email === null ? null : email.toLowerCase();
    if (contactPhone !== undefined) data.contactPhone = contactPhone;
    if (zaloUrl !== undefined) data.zaloUrl = zaloUrl;
    if (facebookUrl !== undefined) data.facebookUrl = facebookUrl;
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

    // Not awaited: the reply time must not depend on the token write or the mail send (AUTH-07).
    void this.sendResetLink({ id: user.id, email: user.email }).catch((e) =>
      // Name only: the error text could echo the mail body, which holds the token.
      this.logger.error(`Could not send the password reset link (${e instanceof Error ? e.name : 'unknown error'})`),
    );
  }

  // Runs after forgotPassword has replied; its caller catches errors.
  private async sendResetLink(user: { id: number; email: string }): Promise<void> {
    const token = randomToken();
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
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
    });
    await this.mailer.send({
      to: user.email,
      subject: 'Đặt lại mật khẩu – Trọ Thông Minh',
      text:
        `Bấm vào liên kết sau để đặt lại mật khẩu (có hiệu lực 30 phút):\n` +
        `${process.env.APP_URL}/quen-mat-khau?token=${token}\n\n` +
        'Nếu không phải bạn yêu cầu, hãy bỏ qua email này.',
    });
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
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
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
      contactPhone: u.contactPhone,
      zaloUrl: u.zaloUrl,
      facebookUrl: u.facebookUrl,
    };
    if (u.role !== 'TENANT') {
      me.buildings = await this.prisma.building.findMany({
        where: u.role === 'BOSS' ? { isActive: true } : { managerId: u.id, isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      });
    }
    return me;
  }
}
