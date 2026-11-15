import type { Lang } from '../../common/i18n/locale.js';
import { emailTemplate } from '../mailer/email-templates.js';
import { sendWithRetry } from '../mailer/send-mail.js';
import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from '../../common/crypto/token.js';
import { HANOI_OFFSET_MS, todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { MailerService } from '../mailer/mailer.service.js';
import { RateLimiter } from './rate-limiter.js';

// AUTH-13, A-11: the code goes to an email address, so every limit counts per address.
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_TRIES = 5;
export const OTP_RESEND_MS = 60 * 1000;
export const OTP_PER_EMAIL_PER_DAY = 5;
export const OTP_PER_IP_PER_HOUR = 10;

type Tx = Prisma.TransactionClient;
export interface IssuedCode {
  id: number;
  code: string;
  replacedId: number | null; // the still-unused code this one retired, given back if the mail never leaves
}

const tooMany = () => new HttpException(ErrorCode.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS);
const invalid = () => new BadRequestException(ErrorCode.OTP_INVALID);
// `email` is always the lowercase form the caller stored on the account.
const hashCode = (email: string, code: string) => sha256Hex(`${email}:${code}`);

// Start of the current calendar day in Asia/Ho_Chi_Minh, as an instant (owner 12/11/2026: the day resets at 00:00).
export const hanoiDayStart = (now: Date): Date => new Date(todayHanoi(now).getTime() - HANOI_OFFSET_MS);

@Injectable()
export class OtpService {
  // In memory, one instance only (DEP-02); the per-email day limit is counted in email_otps and survives a restart.
  private readonly ipLimiter = new RateLimiter(OTP_PER_IP_PER_HOUR, 60 * 60 * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  /** Counts one email for this IP, or throws 429. Sync, before any await, so parallel requests cannot all pass. */
  takeIp(ip: string | undefined): void {
    if (!ip) return;
    if (this.ipLimiter.isBlocked(ip)) throw tooMany();
    this.ipLimiter.record(ip);
  }

  /** Serializes every count-then-write on one key until the transaction ends. Always lock a phone before an email. */
  async lock(tx: Tx, key: string): Promise<void> {
    await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${`otp:${key}`}))`;
  }

  /** Stores a new code (the older unused one stops working). Throws 429 over the day limit or before 60 s. */
  async issue(tx: Tx, email: string, now: Date = new Date()): Promise<IssuedCode> {
    await this.lock(tx, `email:${email}`);
    const today = await tx.emailOtp.count({ where: { email, createdAt: { gte: hanoiDayStart(now) } } });
    if (today >= OTP_PER_EMAIL_PER_DAY) throw tooMany();
    const last = await tx.emailOtp.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
    if (last && now.getTime() - last.createdAt.getTime() < OTP_RESEND_MS) throw tooMany();

    await tx.emailOtp.updateMany({ where: { email, usedAt: null }, data: { usedAt: now } });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const row = await tx.emailOtp.create({
      data: {
        email,
        codeHash: hashCode(email, code),
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        createdAt: now,
      },
    });
    // At most one code per email is unused (email_otps_one_active), and it is always the newest row.
    return { id: row.id, code, replacedId: last && last.usedAt === null ? last.id : null };
  }

  /**
   * Mails a stored code. On failure the code is removed (no email left, so it costs no daily quota), the code it
   * retired works again unless a newer request has issued another one meanwhile, and 503 is thrown.
   */
  async deliver(email: string, issued: IssuedCode, lang: Lang = 'vi'): Promise<void> {
    try {
      await sendWithRetry(this.mailer, {
        to: email,
        ...await emailTemplate(this.prisma, 'emailCode', lang, { code: issued.code }),
      }, `email-code/${issued.id}`);
    } catch {
      await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, `email:${email}`);
        await tx.emailOtp.deleteMany({ where: { id: issued.id } });
        if (issued.replacedId === null) return;
        if ((await tx.emailOtp.count({ where: { email, usedAt: null } })) > 0) return;
        await tx.emailOtp.updateMany({ where: { id: issued.replacedId }, data: { usedAt: null } });
      });
      throw new HttpException(ErrorCode.MAIL_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /** IP limit + issue + deliver, for flows with no other write. */
  async send(email: string, ip: string | undefined, lang: Lang = 'vi'): Promise<void> {
    this.takeIp(ip);
    const issued = await this.prisma.$transaction((tx) => this.issue(tx, email));
    await this.deliver(email, issued, lang);
  }

  /**
   * Checks a code and returns its id; the caller marks it used with `markUsed` in its own transaction.
   * Every attempt takes one of the 5 tries before the compare, so parallel guesses cannot exceed the limit.
   * Runs outside the caller's transaction: a wrong try must stay counted.
   */
  async check(email: string, code: string, now: Date = new Date()): Promise<number> {
    const row = await this.prisma.emailOtp.findFirst({
      where: { email, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.expiresAt <= now) throw invalid();
    const { count } = await this.prisma.emailOtp.updateMany({
      where: { id: row.id, usedAt: null, tries: { lt: OTP_MAX_TRIES } },
      data: { tries: { increment: 1 } },
    });
    if (count === 0) throw invalid();
    const given = Buffer.from(hashCode(email, code));
    if (!timingSafeEqual(given, Buffer.from(row.codeHash))) throw invalid();
    return row.id;
  }

  /** Single use: a second request with the same code finds it used. */
  async markUsed(tx: Tx, id: number, now: Date = new Date()): Promise<void> {
    const { count } = await tx.emailOtp.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count === 0) throw invalid();
  }
}
