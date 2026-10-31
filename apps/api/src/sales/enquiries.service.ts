import { Injectable } from '@nestjs/common';
import { publicEnquiryResponseSchema, type PublicEnquiryRequest } from '@sunshine/contracts';
import { PrismaService } from '../platform/prisma.service';

@Injectable()
export class EnquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a web enquiry. A returning customer is matched by normalized phone and their
   * existing record is never overwritten from public input; the enquiry keeps its own copy
   * of the submitted contact and site details.
   */
  async createFromWeb(input: PublicEnquiryRequest) {
    // Two first-time submissions with the same phone can race on customers_phone_key.
    // The losing transaction rolls back whole; one retry then finds the winner's customer.
    try {
      return await this.insertWebEnquiry(input);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.insertWebEnquiry(input);
    }
  }

  private async insertWebEnquiry(input: PublicEnquiryRequest) {
    const enquiry = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { phone: input.phone },
        update: {},
        create: {
          name: input.name,
          phone: input.phone,
          email: input.email,
          addressLine: input.addressLine,
          city: input.city,
          pincode: input.pincode,
        },
        select: { id: true },
      });
      return tx.enquiry.create({
        data: {
          customerId: customer.id,
          source: 'WEB',
          // Snapshot of what was submitted: a returning customer may enquire for another site.
          contactName: input.name,
          contactEmail: input.email,
          siteAddressLine: input.addressLine,
          siteCity: input.city,
          sitePincode: input.pincode,
          requestedCapacityKw: input.requestedCapacityKw,
          systemType: input.systemType,
          subsidyInterest: input.subsidyInterest,
          message: input.message,
        },
        select: { id: true, status: true, createdAt: true },
      });
    });
    return publicEnquiryResponseSchema.parse({
      data: { id: enquiry.id, status: enquiry.status, createdAt: enquiry.createdAt.toISOString() },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}
