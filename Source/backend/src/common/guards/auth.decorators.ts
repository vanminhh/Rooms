import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';

// buildingIds: null = BOSS (every building), [] = sees nothing (SCOPE-02).
export interface AuthUser {
  id: number;
  role: Role;
  mustChangePassword: boolean;
  buildingIds: number[] | null;
}

export const IS_PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';
export const ALLOW_PCR_KEY = 'auth:allowPasswordChangeRequired';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const AllowPasswordChangeRequired = () => SetMetadata(ALLOW_PCR_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
