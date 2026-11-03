import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { AuthUser } from '../../common/guards/auth.decorators.js';

const MANAGER_BUILDING_FIELDS = new Set(['amenities', 'description']);

export function assertBuildingPatchFields(user: Pick<AuthUser, 'role'>, body: unknown): void {
  if (user.role !== 'MANAGER' || body === null || typeof body !== 'object' || Array.isArray(body)) return;

  const hasForbiddenField = Object.entries(body).some(
    ([field, value]) => value !== undefined && !MANAGER_BUILDING_FIELDS.has(field),
  );
  if (hasForbiddenField) throw new ForbiddenException(ErrorCode.FORBIDDEN);
}

@Injectable()
export class BuildingWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (request.user) assertBuildingPatchFields(request.user, request.body);
    return true;
  }
}
