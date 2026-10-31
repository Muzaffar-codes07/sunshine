import { Module } from '@nestjs/common';
import { WarrantyModule } from '../warranty/warranty.module';
import { FinanceModule } from '../finance/finance.module';
import { AuthModule } from '../auth/auth.module';
import { RepairBillingService } from './repair-billing.service';
import { ReplacementService } from './replacement.service';
import { ReplacementStockWriter, UnavailableReplacementStockWriter } from './replacement.types';
import { RepairSourceReader, UnavailableRepairSourceReader } from './repair-billing.types';
import { ServiceTicketAccess, UnavailableServiceTicketAccess } from './service-access';
import { ServiceController, ServiceTicketGuard } from './service.controller';
import { PrismaTicketRepository, TicketRepository } from './service.repository';
import { ServiceService } from './service.service';
import { ServiceReadController } from './service-read.controller';

@Module({
  imports: [WarrantyModule, FinanceModule, AuthModule],
  controllers: [ServiceController, ServiceReadController],
  providers: [ServiceService, ServiceTicketGuard, RepairBillingService, ReplacementService,
    { provide: ReplacementStockWriter, useClass: UnavailableReplacementStockWriter },
    { provide: RepairSourceReader, useClass: UnavailableRepairSourceReader },
    { provide: TicketRepository, useClass: PrismaTicketRepository },
    { provide: ServiceTicketAccess, useClass: UnavailableServiceTicketAccess },
  ],
  exports: [ServiceService, RepairBillingService, ReplacementService],
})
export class ServiceModule {}
