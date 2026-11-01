import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../platform/prisma.service';
import { ApiError } from '../platform/api-error';
import '../auth/auth.types';

export interface CustomerRequest extends Request { customerId: string; accountId: string; }

@Injectable()
export class CustomerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const id = request.session?.customerAccountId;
    if (!id) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in as a customer');
    const account = await this.prisma.customerAccount.findUnique({ where: { id }, select: { customerId: true, verifiedAt: true, active: true } });
    if (!account?.active || !account.verifiedAt) throw new ApiError(401, 'UNAUTHENTICATED', 'Customer session is unavailable');
    request.customerId = account.customerId;
    request.accountId = id;
    return true;
  }
}
