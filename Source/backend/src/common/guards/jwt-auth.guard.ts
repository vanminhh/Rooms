import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode } from '../errors/error-code.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { allowedBuildingIds } from '../scope/scope.js';
import { TokenService } from '../../modules/auth/token.service.js';
import { type AuthUser, IS_PUBLIC_KEY } from './auth.decorators.js';

const POSITIVE_INT = /^[1-9][0-9]*$/;
const MAX_INT4 = 2147483647; // users.id is a Postgres integer

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);

    let sub: unknown;
    try {
      sub = (await this.tokens.verifyAccessToken(token)).sub;
    } catch {
      throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);
    }
    if (typeof sub !== 'string' || !POSITIVE_INT.test(sub) || Number(sub) > MAX_INT4) {
      throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);
    }

    // Role and flags come from the DB, not the token (AUTH-T1, P5).
    const user = await this.prisma.user.findUnique({ where: { id: Number(sub) } });
    if (!user?.isActive) throw new UnauthorizedException(ErrorCode.UNAUTHENTICATED);

    req.user = {
      id: user.id,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      buildingIds: await allowedBuildingIds(this.prisma, user),
    };
    return true;
  }
}
