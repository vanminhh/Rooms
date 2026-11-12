import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { OtpPurpose, Prisma } from '@prisma/client';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from '../../common/crypto/token.js';
import { HANOI_OFFSET_MS, todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SmsService } from '../sms/sms.service.js';
import { RateLimiter } from './rate-limiter.js';

// AUTH-13, A-11.
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_TRIES = 5;
export const OTP_RESEND_MS = 60 * 1000;
export const OTP_PER_PHONE_PER_DAY = 5;
export const OTP_PER_IP_PER_HOUR = 10;

type Tx = Prisma.TransactionClient;
export interface IssuedCode {
  id: number;
  code: string;
}

const tooMany = () => new HttpException(ErrorCode.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS);
const invalid = () => new BadRequestException(ErrorCode.OTP_INVALID);
const hashCode = (phone: string, purpose: OtpPurpose, code: string) => sha256Hex(`${phone}:${purpose}:${code}`);

// Start of the current calendar day in Asia/Ho_Chi_Minh, as an instant (owner 12/11/2026: the day resets at 00:00).
export const hanoiDayStart = (now: Date): Date => new Date(todayHanoi(now).getTime() - HANOI_OFFSET_MS);

@Injectable()
export class OtpService {
  // In memory, one instance only (DEP-02); the per-phone day limit is counted in phone_otps and survives a restart.
  private readonly ipLimiter = new RateLimiter(OTP_PER_IP_PER_HOUR, 60 * 60 * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  /** Counts one SMS for this IP, or throws 429. Sync, before any await, so parallel requests cannot all pass. */
  takeIp(ip: string | undefined): void {
    if (!ip) return;
    if (this.ipLimiter.isBlocked(ip)) throw tooMany();
    this.ipLimiter.record(ip);
  }

  /** Serializes every count-then-write on one phone until the transaction ends. */
  async lock(tx: Tx, phone: string): Promise<void> {
    await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${`otp:${phone}`}))`;
  }

  /** Stores a new code (the older unused one stops working). Throws 429 over the day limit or before 60 s. */
  async issue(tx: Tx, phone: string, purpose: OtpPurpose, now: Date = new Date()): Promise<IssuedCode> {
    await this.lock(tx, phone);
    const today = await tx.phoneOtp.count({ where: { phone, createdAt: { gte: hanoiDayStart(now) } } });
    if (today >= OTP_PER_PHONE_PER_DAY) throw tooMany();
    const last = await tx.phoneOtp.findFirst({ where: { phone, purpose }, orderBy: { createdAt: 'desc' } });
    if (last && now.getTime() - last.createdAt.getTime() < OTP_RESEND_MS) throw tooMany();

    await tx.phoneOtp.updateMany({ where: { phone, purpose, usedAt: null }, data: { usedAt: now } });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const row = await tx.phoneOtp.create({
      data: {
        phone,
        purpose,
        codeHash: hashCode(phone, purpose, code),
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        createdAt: now,
      },
    });
    return { id: row.id, code };
  }

  /** Sends a stored code. On failure the code is removed (no SMS left, so it costs no daily quota) and 503 is thrown. */
  async deliver(phone: string, issued: IssuedCode): Promise<void> {
    try {
      await this.sms.send({
        to: phone,
        text: `Mã xác minh Trọ Thông Minh: ${issued.code}. Mã có hiệu lực 5 phút.`,
      });
    } catch {
      await this.prisma.phoneOtp.deleteMany({ where: { id: issued.id } });
      throw new HttpException(ErrorCode.SMS_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /** IP limit + issue + deliver, for flows with no other write. */
  async send(phone: string, purpose: OtpPurpose, ip: string | undefined): Promise<void> {
    this.takeIp(ip);
    const issued = await this.prisma.$transaction((tx) => this.issue(tx, phone, purpose));
    await this.deliver(phone, issued);
  }

  /**
   * Checks a code and returns its id; the caller marks it used with `markUsed` in its own transaction.
   * Every attempt takes one of the 5 tries before the compare, so parallel guesses cannot exceed the limit.
   * Runs outside the caller's transaction: a wrong try must stay counted.
   */
  async check(phone: string, purpose: OtpPurpose, code: string, now: Date = new Date()): Promise<number> {
    const row = await this.prisma.phoneOtp.findFirst({
      where: { phone, purpose, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.expiresAt <= now) throw invalid();
    const { count } = await this.prisma.phoneOtp.updateMany({
      where: { id: row.id, usedAt: null, tries: { lt: OTP_MAX_TRIES } },
      data: { tries: { increment: 1 } },
    });
    if (count === 0) throw invalid();
    const given = Buffer.from(hashCode(phone, purpose, code));
    if (!timingSafeEqual(given, Buffer.from(row.codeHash))) throw invalid();
    return row.id;
  }

  /** Single use: a second request with the same code finds it used. */
  async markUsed(tx: Tx, id: number, now: Date = new Date()): Promise<void> {
    const { count } = await tx.phoneOtp.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count === 0) throw invalid();
  }
}
