import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiError } from '../platform/api-error';
import { AuthService } from './auth.service';
import type { AuthenticatedStaffRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedStaffRequest>();
    const id = request.session?.staffUserId;
    if (!id) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
    const user = await this.auth.findActiveStaff(id);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Your staff session is no longer available');
    request.user = user;
    return true;
  }
}
