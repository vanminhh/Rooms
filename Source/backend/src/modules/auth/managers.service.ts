import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { hashPassword } from '../../common/crypto/password.js';
import { randomToken } from '../../common/crypto/token.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';
import { pageParams, paginated } from '../../common/pagination.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateManagerDto, ManagersQueryDto, UpdateManagerDto } from './dto/managers.dto.js';

const MANAGER_INCLUDE = {
  managedBuildings: {
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: { code: 'asc' },
  },
} satisfies PrismaTypes.UserInclude;

type ManagerRecord = PrismaTypes.UserGetPayload<{ include: typeof MANAGER_INCLUDE }>;

export interface ManagerView {
  id: number;
  phone: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  contactPhone: string | null;
  zaloUrl: string | null;
  facebookUrl: string | null;
  buildings: { id: number; code: string; name: string; isActive: boolean }[];
  createdAt: string;
}

export interface CreatedManager {
  manager: ManagerView;
  temporaryPassword: string;
}

function uniqueTargets(error: unknown): unknown[] {
  if (typeof error !== 'object' || error === null) return [];
  const dbError = error as { code?: unknown; meta?: { target?: unknown } };
  if (dbError.code !== 'P2002') return [];
  const target = dbError.meta?.target;
  return Array.isArray(target) ? target : [target];
}

function isPhoneUniqueError(error: unknown): boolean {
  const targets = uniqueTargets(error);
  return targets.includes('users_phone_key') || targets.includes('phone');
}

function isEmailUniqueError(error: unknown): boolean {
  const targets = uniqueTargets(error);
  return targets.includes('users_email_key') || targets.includes('email');
}

function throwManagerUniqueConflict(error: unknown): never {
  if (isPhoneUniqueError(error)) throw new ConflictException(ErrorCode.PHONE_TAKEN);
  if (isEmailUniqueError(error)) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_FAILED,
      fields: { email: 'Email đã được sử dụng' },
    });
  }
  throw error;
}

@Injectable()
export class ManagersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: ManagersQueryDto) {
    if (user.role !== 'BOSS') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const { page, limit, skip, take } = pageParams(query);
    const where: Prisma.UserWhereInput = {
      role: 'MANAGER',
      ...(query.buildingId !== undefined
        ? { managedBuildings: { some: { id: query.buildingId } } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: MANAGER_INCLUDE,
        orderBy: this.orderBy(query.sort),
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(rows.map((row) => this.toView(row)), page, limit, total);
  }

  async create(user: AuthUser, dto: CreateManagerDto, ip?: string): Promise<CreatedManager> {
    if (user.role !== 'BOSS') throw new ForbiddenException(ErrorCode.FORBIDDEN);
    const temporaryPassword = randomToken();
    const passwordHash = await hashPassword(temporaryPassword);
    const email = dto.email == null ? null : dto.email.toLowerCase();

    try {
      const manager = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            role: 'MANAGER',
            phone: dto.phone,
            fullName: dto.fullName,
            email,
            passwordHash,
            mustChangePassword: true,
            isActive: true,
          },
          include: MANAGER_INCLUDE,
        });
        await this.audit.log(
          user.id,
          'manager.create',
          'user',
          created.id,
          undefined,
          {
            role: created.role,
            phone: created.phone,
            fullName: created.fullName,
            email: created.email,
            isActive: created.isActive,
            mustChangePassword: created.mustChangePassword,
          },
          ip,
          tx,
        );
        return created;
      });
      return { manager: this.toView(manager), temporaryPassword };
    } catch (error) {
      throwManagerUniqueConflict(error);
    }
  }

  async update(user: AuthUser, id: number, dto: UpdateManagerDto, ip?: string): Promise<ManagerView> {
    if (user.role !== 'BOSS') throw new ForbiddenException(ErrorCode.FORBIDDEN);

    return this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
        const current = await tx.user.findUnique({
          where: { id },
          include: MANAGER_INCLUDE,
        });
        if (!current || current.role !== 'MANAGER') throw new NotFoundException(ErrorCode.NOT_FOUND);
        if (current.isActive === dto.isActive) return this.toView(current);

        const updated = await tx.user.update({
          where: { id },
          data: { isActive: dto.isActive },
          include: MANAGER_INCLUDE,
        });
        if (!dto.isActive) {
          await tx.session.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await this.audit.log(
            user.id,
            'manager.deactivate',
            'user',
            id,
            { isActive: true },
            { isActive: false },
            ip,
            tx,
          );
        }
        return this.toView(updated);
    });
  }

  private orderBy(sort: ManagersQueryDto['sort']): Prisma.UserOrderByWithRelationInput {
    switch (sort) {
      case '-createdAt':
        return { createdAt: 'desc' };
      case 'createdAt':
        return { createdAt: 'asc' };
      case 'fullName':
        return { fullName: 'asc' };
      case '-fullName':
        return { fullName: 'desc' };
      default:
        return { createdAt: 'desc' };
    }
  }

  private toView(user: ManagerRecord): ManagerView {
    return {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      email: user.email,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      contactPhone: user.contactPhone,
      zaloUrl: user.zaloUrl,
      facebookUrl: user.facebookUrl,
      buildings: user.managedBuildings,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
