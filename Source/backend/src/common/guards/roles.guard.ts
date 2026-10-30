import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { ErrorCode } from '../errors/error-code.js';
import { type AuthUser, IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators.js';

// SCOPE-01: deny by default; a route needs @Public() or @Roles(...) to be reachable.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const role = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user?.role;
    if (!roles || !role || !roles.includes(role)) throw new ForbiddenException(ErrorCode.FORBIDDEN);
    return true;
  }
}
