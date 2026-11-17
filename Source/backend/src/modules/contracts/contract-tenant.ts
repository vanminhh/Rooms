import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PENDING_TENANT_PASSWORD_HASH } from '../../common/crypto/password.js';
import { isUniqueOn } from '../../common/errors/db-errors.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuditService } from '../audit/audit.service.js';
import { lockOtpKey } from '../auth/otp.service.js';
import type { CreateContractDto } from './dto/create-contract.dto.js';

const ACCOUNT_SELECT = {
  id: true, role: true, isActive: true, passwordHash: true, emailVerifiedAt: true, fullName: true, email: true,
} satisfies Prisma.UserSelect;

export async function resolveContractTenant(
  tx: Prisma.TransactionClient, dto: CreateContractDto, audit: AuditService, actorId: number, ip?: string,
): Promise<number> {
  const { signer } = dto;
  // AUTH-11 may find an unverified guest by email using a different phone.
  await lockOtpKey(tx, `phone:${signer.phone}`);
  const lookup = { where: { phone: signer.phone }, select: ACCOUNT_SELECT };
  let account = await tx.user.findUnique(lookup);
  const replaceable = account?.role === 'GUEST' && account.isActive && account.emailVerifiedAt === null;
  if (!account || replaceable) {
    const emails = [account?.email, signer.email].filter((email): email is string => Boolean(email));
    for (const email of [...new Set(emails)].sort((a, b) => a.localeCompare(b, 'en'))) {
      await lockOtpKey(tx, `email:${email}`);
    }
    if (account?.email) account = await tx.user.findUnique(lookup);
  }

  if (account?.role === 'TENANT' && (account.isActive || account.passwordHash === PENDING_TENANT_PASSWORD_HASH)) {
    return account.id;
  }
  if (account && !account.isActive) {
    throw new ForbiddenException({ code: ErrorCode.ACCOUNT_LOCKED, fields: { 'signer.phone': 'Tài khoản của số này đang bị khóa' } });
  }
  if (account?.role === 'MANAGER' || account?.role === 'BOSS') throw new ConflictException(ErrorCode.PHONE_TAKEN);

  const verified = account?.emailVerifiedAt != null;
  if (account && verified && dto.confirmedGuestAccountId !== account.id) {
    throw new ConflictException({
      code: ErrorCode.PHONE_TAKEN,
      fields: {
        'signer.phone': 'Vui lòng xác nhận tài khoản này thuộc người ký',
        guestAccountId: String(account.id), guestAccountName: account.fullName, guestAccountEmail: account.email ?? '',
      },
    });
  }

  const pending = {
    role: 'TENANT' as const, fullName: signer.fullName, email: signer.email ?? null,
    passwordHash: PENDING_TENANT_PASSWORD_HASH, isActive: false, mustChangePassword: true,
  };
  try {
    if (!account) {
      return (await tx.user.create({ data: { ...pending, phone: signer.phone }, select: { id: true } })).id;
    }
    await tx.user.update({
      where: { id: account.id }, data: verified ? { role: 'TENANT' } : pending, select: { id: true },
    });
  } catch (error) {
    if (isUniqueOn(error, 'email', 'users_email_key')) {
      throw new ConflictException({
        code: ErrorCode.EMAIL_TAKEN, fields: { 'signer.email': 'Email đã được dùng cho tài khoản khác' },
      });
    }
    if (isUniqueOn(error, 'phone', 'users_phone_key')) throw new ConflictException(ErrorCode.PHONE_TAKEN);
    throw error;
  }
  await audit.log(actorId, 'user.role_change', 'user', account.id, { role: 'GUEST' }, { role: 'TENANT' }, ip, tx);
  return account.id;
}
