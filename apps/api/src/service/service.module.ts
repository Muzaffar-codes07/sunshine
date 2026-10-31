import { Module } from '@nestjs/common';
import { WarrantyModule } from '../warranty/warranty.module';
import { FinanceModule } from '../finance/finance.module';
import { RepairBillingService } from './repair-billing.service';
import { RepairSourceReader, UnavailableRepairSourceReader } from './repair-billing.types';
import { ServiceTicketAccess, UnavailableServiceTicketAccess } from './service-access';
import { ServiceController, ServiceTicketGuard } from './service.controller';
import { PrismaTicketRepository, TicketRepository } from './service.repository';
import { ServiceService } from './service.service';

@Module({
  imports: [WarrantyModule, FinanceModule],
  controllers: [ServiceController],
  providers: [ServiceService, ServiceTicketGuard, RepairBillingService,
    { provide: RepairSourceReader, useClass: UnavailableRepairSourceReader },
    { provide: TicketRepository, useClass: PrismaTicketRepository },
    { provide: ServiceTicketAccess, useClass: UnavailableServiceTicketAccess },
  ],
  exports: [ServiceService, RepairBillingService],
})
export class ServiceModule {}
