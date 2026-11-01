import { Injectable } from '@nestjs/common';
import { PrismaService } from '../platform/prisma.service';
import { ApiError } from '../platform/api-error';
import { PrivateFileStore } from '../files/private-file.store';
import { CustomerAuthService } from './customer-auth.service';

const iso = (date: Date | null) => date?.toISOString() ?? null;

@Injectable()
export class CustomerPortalService {
  constructor(private readonly prisma: PrismaService, private readonly auth: CustomerAuthService, private readonly files: PrivateFileStore) {}

  async snapshot(customerId: string, accountId: string) {
    const [profile, enquiries, orders, quotes, invoices, allocations, tickets, jobs] = await Promise.all([
      this.auth.profile(customerId, accountId),
      this.prisma.enquiry.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 100,
        select: { id: true, status: true, requestedCapacityKw: true, systemType: true, subsidyInterest: true, createdAt: true } }),
      this.prisma.order.findMany({ where: { customerId }, orderBy: { confirmedAt: 'desc' }, take: 100,
        include: { job: true, dispatch: true } }),
      this.prisma.quote.findMany({ where: { customerId, status: { in: ['SENT', 'ACCEPTED', 'REJECTED'] } }, orderBy: { createdAt: 'desc' }, take: 100,
        include: { lines: { orderBy: { position: 'asc' } } } }),
      this.prisma.invoice.findMany({ where: { customerId }, orderBy: { postedAt: 'desc' }, take: 100,
        include: { lines: { orderBy: { position: 'asc' } } } }),
      this.prisma.allocation.findMany({ where: { job: { order: { customerId } }, status: { in: ['DELIVERED', 'INSTALLED'] }, unitId: { not: null } }, take: 300,
        include: { unit: { include: { product: true, manufacturer: true, warranty: true } } } }),
      this.prisma.serviceTicket.findMany({ where: { customerId }, orderBy: { createdAt: 'desc' }, take: 100,
        select: { id: true, ticketNumber: true, status: true, faultDescription: true, createdAt: true, resolvedAt: true, closedAt: true } }),
      this.prisma.job.findMany({ where: { order: { customerId } }, take: 100,
        include: { photos: { include: { file: true } }, signatureFile: true } }),
    ]);
    const units = new Map<string, (typeof allocations)[number]['unit']>();
    for (const allocation of allocations) if (allocation.unit) units.set(allocation.unit.id, allocation.unit);
    const documents = jobs.flatMap(job => [
      ...job.photos.map(photo => ({ id: photo.file.id, name: photo.file.originalName, kind: 'Installation photo', createdAt: photo.file.createdAt.toISOString() })),
      ...(job.signatureFile ? [{ id: job.signatureFile.id, name: job.signatureFile.originalName, kind: 'Installation signature', createdAt: job.signatureFile.createdAt.toISOString() }] : []),
    ]);
    return { data: {
      profile,
      enquiries: enquiries.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
      projects: orders.map(row => ({ id: row.id, number: `ORD-${String(row.number).padStart(6, '0')}`, confirmedAt: row.confirmedAt.toISOString(),
        jobStatus: row.job?.status ?? null, scheduledStart: iso(row.job?.scheduledStart ?? null), completedAt: iso(row.job?.completedAt ?? null),
        dispatchStatus: row.dispatch?.status ?? null, deliveredAt: iso(row.dispatch?.deliveredAt ?? null) })),
      quotes: quotes.map(row => ({ id: row.id, revision: row.revision, status: row.status, totalPrice: row.totalPrice.toString(), sentAt: iso(row.sentAt),
        lines: row.lines.map(line => ({ description: line.description, quantity: line.quantity.toString(), lineTotal: line.lineTotal.toString() })) })),
      invoices: invoices.map(row => ({ id: row.id, number: `INV-${String(row.number).padStart(6, '0')}`, kind: row.kind, status: row.status,
        total: row.total.toString(), paidAmount: row.paidAmount.toString(), postedAt: row.postedAt.toISOString(),
        lines: row.lines.map(line => ({ description: line.description, quantity: line.quantity.toString(), lineTotal: line.lineTotal.toString() })) })),
      equipment: [...units.values()].map(unit => ({ id: unit!.id, serial: unit!.rawSerial, product: unit!.product.name, manufacturer: unit!.manufacturer.name,
        warranty: unit!.warranty ? { policyName: unit!.warranty.policyName, scope: unit!.warranty.scope,
          startDate: unit!.warranty.startDate.toISOString().slice(0, 10), expiryDate: unit!.warranty.expiryDate.toISOString().slice(0, 10), active: unit!.warranty.active } : null })),
      tickets: tickets.map(row => ({ id: row.id, number: row.ticketNumber, status: row.status, faultDescription: row.faultDescription,
        createdAt: row.createdAt.toISOString(), resolvedAt: iso(row.resolvedAt), closedAt: iso(row.closedAt) })),
      documents,
    } };
  }

  async download(customerId: string, id: string) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) throw new ApiError(404, 'NOT_FOUND', 'Document not found');
    const [photo, signature] = await Promise.all([
      this.prisma.jobPhoto.findFirst({ where: { fileId: id, job: { order: { customerId } } }, select: { id: true } }),
      this.prisma.job.findFirst({ where: { signatureFileId: id, order: { customerId } }, select: { id: true } }),
    ]);
    if (!photo && !signature) throw new ApiError(404, 'NOT_FOUND', 'Document not found');
    return { file, buffer: await this.files.read(file.storageKey, file.sizeBytes, file.sha256) };
  }
}
