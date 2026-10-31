import { Injectable } from '@nestjs/common';
import { publicEnquiryResponseSchema, type PublicEnquiryRequest } from '@sunshine/contracts';
import { PrismaService } from '../platform/prisma.service';

@Injectable()
export class EnquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a web enquiry. A returning customer is matched by normalized phone and their
   * existing record is never overwritten from public input; the enquiry keeps what they asked for.
   */
  async createFromWeb(input: PublicEnquiryRequest) {
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
