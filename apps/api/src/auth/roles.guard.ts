import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StaffRole } from '@sunshine/contracts';
import { ApiError } from '../platform/api-error';
import { STAFF_ROLES_KEY } from './roles.decorator';
import type { AuthenticatedStaffRequest } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<StaffRole[]>(STAFF_ROLES_KEY, [context.getHandler(), context.getClass()]);
    const user = context.switchToHttp().getRequest<AuthenticatedStaffRequest>().user;
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
    if (roles?.length && !roles.includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Your staff role cannot perform this action');
    return true;
  }
}
