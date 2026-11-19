import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashPassword, PENDING_TENANT_PASSWORD_HASH } from '../../common/crypto/password.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { scopeWhere } from '../../common/scope/scope.js';
import { lockViewingMapping } from '../../common/viewings/viewing-lock.js';
import { AuditService } from '../audit/audit.service.js';
import { lockOtpKey } from '../auth/otp.service.js';
import { assertViewingScope } from '../viewings/viewing-reservations.js';

@Injectable()
export class ContractPasswordService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async resetPassword(actor: AuthUser, id: number, ip?: string) {
    if (actor.role !== 'BOSS' && actor.role !== 'MANAGER') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const existing = await this.prisma.contract.findUnique({ where: { id, ...scopeWhere(actor) }, select: { id: true } });
    if (!existing) {
      if (await this.prisma.contract.findUnique({ where: { id }, select: { id: true } })) {
        throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      }
      throw new NotFoundException(ErrorCode.NOT_FOUND);
    }
    const temporaryPassword = randomBytes(8).toString('base64url').slice(0, 10);
    const passwordHash = await hashPassword(temporaryPassword);
    return this.prisma.$transaction(async tx => {
      await lockViewingMapping(tx);
      await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${id} FOR UPDATE`;
      const contract = await tx.contract.findUnique({ where: { id, ...scopeWhere(actor) }, select: {
        tenantId: true, tenant: { select: { phone: true } },
        building: { select: { managerId: true, isActive: true, manager: { select: { isActive: true } } } },
      } });
      if (!contract) throw new ForbiddenException(ErrorCode.OUT_OF_SCOPE);
      assertViewingScope(actor, contract);
      await lockOtpKey(tx, `phone:${contract.tenant.phone}`);
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${contract.tenantId} FOR UPDATE`;
      const tenant = await tx.user.findUniqueOrThrow({ where: { id: contract.tenantId } });
      if (tenant.role !== 'TENANT') throw new NotFoundException(ErrorCode.NOT_FOUND);
      // A-23: the first signature issues the initial password; reset does not activate a pending account.
      if (tenant.passwordHash === PENDING_TENANT_PASSWORD_HASH) throw new ConflictException(ErrorCode.CONFLICT_STATE);
      const now = new Date();
      await tx.user.update({ where: { id: tenant.id }, data: { passwordHash, mustChangePassword: true } });
      await tx.session.updateMany({ where: { userId: tenant.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.passwordResetToken.updateMany({ where: { userId: tenant.id, usedAt: null }, data: { usedAt: now } });
      await this.audit.log(actor.id, 'user.reset_password_by_staff', 'user', tenant.id, undefined, { contractId: id }, ip, tx);
      // Plaintext leaves the method only after the whole transaction commits, never through replay storage.
      return { temporaryPassword };
    });
  }
}
