import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '../errors/error-code.js';
import { ALLOW_PCR_KEY, type AuthUser, IS_PUBLIC_KEY } from './auth.decorators.js';

// AUTH-05: runs before RolesGuard so a flagged user gets PASSWORD_CHANGE_REQUIRED, not FORBIDDEN.
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) ||
      this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_PCR_KEY, targets)
    ) {
      return true;
    }
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (user?.mustChangePassword) throw new ForbiddenException(ErrorCode.PASSWORD_CHANGE_REQUIRED);
    return true;
  }
}
