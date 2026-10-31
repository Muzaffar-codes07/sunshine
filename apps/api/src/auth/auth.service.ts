import { Injectable } from '@nestjs/common';
import type { StaffIdentity } from '@sunshine/contracts';
import { PrismaService } from '../platform/prisma.service';
import { ApiError } from '../platform/api-error';
import { hashPassword, verifyPassword } from './passwords';

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword('not-a-real-user-password');
  constructor(private readonly prisma: PrismaService) {}

  async checkCredentials(email: string, password: string): Promise<StaffIdentity> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = await verifyPassword(password, user?.passwordHash ?? await this.dummyHash);
    if (!user || !user.active || !valid) throw new ApiError(401, 'UNAUTHENTICATED', 'Email or password is incorrect');
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
  }
  async findActiveStaff(id: string): Promise<StaffIdentity | null> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, email: true, displayName: true, role: true, active: true } });
    if (!user?.active) return null;
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
  }
}
