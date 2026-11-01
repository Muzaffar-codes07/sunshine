import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { CustomerLogin, CustomerRegister, CustomerProfileUpdate } from './customer-types';
import { PrismaService } from '../platform/prisma.service';
import { ApiError } from '../platform/api-error';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { CustomerMailService } from './customer-mail.service';

const generic = { data: { message: 'If this email belongs to a customer, a verification link has been sent.' } };
const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
const expires = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

@Injectable()
export class CustomerAuthService {
  private readonly dummyHash = hashPassword('not-a-real-customer-password');
  constructor(private readonly prisma: PrismaService, private readonly mail: CustomerMailService) {}

  async register(input: CustomerRegister) {
    this.mail.assertConfigured();
    const candidates = await this.prisma.customer.findMany({ where: { email: { equals: input.email, mode: 'insensitive' } }, take: 2, select: { id: true } });
    if (candidates.length !== 1) { await hashPassword(input.password); return generic; }
    const customerId = candidates[0]!.id;
    const existing = await this.prisma.customerAccount.findUnique({ where: { customerId } });
    if (existing && (existing.verifiedAt || !existing.active)) { await hashPassword(input.password); return generic; }
    const token = randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(input.password);
    await this.prisma.customerAccount.upsert({ where: { customerId },
      create: { customerId, email: input.email, passwordHash, registrationTokenHash: tokenHash(token), registrationExpiresAt: expires() },
      update: { email: input.email, passwordHash, registrationTokenHash: tokenHash(token), registrationExpiresAt: expires() } });
    await this.mail.sendVerification(input.email, token, 'register');
    return generic;
  }

  async verify(token: string) {
    const hash = tokenHash(token);
    const registration = await this.prisma.customerAccount.findUnique({ where: { registrationTokenHash: hash } });
    if (registration) {
      if (!registration.registrationExpiresAt || registration.registrationExpiresAt <= new Date() || !registration.active) throw new ApiError(400, 'VERIFICATION_EXPIRED', 'Verification link has expired');
      await this.prisma.$transaction(async tx => {
        const claimed = await tx.customerAccount.updateMany({ where: { id: registration.id, registrationTokenHash: hash, verifiedAt: null }, data: { verifiedAt: new Date(), registrationTokenHash: null, registrationExpiresAt: null } });
        if (claimed.count !== 1) throw new ApiError(400, 'VERIFICATION_EXPIRED', 'Verification link is invalid or expired');
        await tx.customer.update({ where: { id: registration.customerId }, data: { email: registration.email } });
      });
      return { data: { message: 'Email verified. You can sign in.' } };
    }
    const pending = await this.prisma.customerAccount.findUnique({ where: { pendingEmailTokenHash: hash } });
    if (!pending || !pending.pendingEmail || !pending.pendingEmailExpiresAt || pending.pendingEmailExpiresAt <= new Date() || !pending.active || !pending.verifiedAt) {
      throw new ApiError(400, 'VERIFICATION_EXPIRED', 'Verification link is invalid or expired');
    }
    await this.prisma.$transaction(async tx => {
      const claimed = await tx.customerAccount.updateMany({ where: { id: pending.id, pendingEmailTokenHash: hash }, data: { email: pending.pendingEmail!, pendingEmail: null, pendingEmailTokenHash: null, pendingEmailExpiresAt: null } });
      if (claimed.count !== 1) throw new ApiError(400, 'VERIFICATION_EXPIRED', 'Verification link is invalid or expired');
      await tx.customer.update({ where: { id: pending.customerId }, data: { email: pending.pendingEmail! } });
    });
    return { data: { message: 'New email verified. Please sign in again.' } };
  }

  async login(input: CustomerLogin) {
    const account = await this.prisma.customerAccount.findUnique({ where: { email: input.email } });
    const valid = await verifyPassword(input.password, account?.passwordHash ?? await this.dummyHash);
    if (!account?.active || !account.verifiedAt || !valid) throw new ApiError(401, 'UNAUTHENTICATED', 'Email or password is incorrect, or email is not verified');
    return account;
  }

  async profile(customerId: string, accountId: string) {
    const [customer, account] = await Promise.all([
      this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
      this.prisma.customerAccount.findUniqueOrThrow({ where: { id: accountId } }),
    ]);
    return { id: customer.id, name: customer.name, phone: customer.phone, email: account.email,
      addressLine: customer.addressLine, city: customer.city, pincode: customer.pincode, pendingEmail: account.pendingEmail };
  }

  async updateProfile(customerId: string, accountId: string, input: CustomerProfileUpdate) {
    const account = await this.prisma.customerAccount.findUniqueOrThrow({ where: { id: accountId } });
    if (!await verifyPassword(input.currentPassword, account.passwordHash)) throw new ApiError(401, 'UNAUTHENTICATED', 'Current password is incorrect');
    if (input.email !== account.email) {
      const taken = await this.prisma.customerAccount.findFirst({ where: { OR: [{ email: input.email }, { pendingEmail: input.email }], NOT: { id: accountId } }, select: { id: true } });
      if (taken) throw new ApiError(409, 'EMAIL_IN_USE', 'This email is already in use');
    }
    const token = input.email !== account.email ? randomBytes(32).toString('hex') : null;
    try {
      await this.prisma.$transaction(async tx => {
        await tx.customer.update({ where: { id: customerId }, data: { phone: input.phone, addressLine: input.addressLine, city: input.city, pincode: input.pincode } });
        if (token) await tx.customerAccount.update({ where: { id: accountId }, data: { pendingEmail: input.email,
          pendingEmailTokenHash: tokenHash(token), pendingEmailExpiresAt: expires() } });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ApiError(409, 'CONTACT_IN_USE', 'Phone or email is already in use');
      throw error;
    }
    if (token) await this.mail.sendVerification(input.email, token, 'email');
    return { data: await this.profile(customerId, accountId) };
  }
}
