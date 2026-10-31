import { Module } from '@nestjs/common';
import { WarrantyModule } from '../warranty/warranty.module';
import { ServiceTicketAccess, UnavailableServiceTicketAccess } from './service-access';
import { ServiceController, ServiceTicketGuard } from './service.controller';
import { PrismaTicketRepository, TicketRepository } from './service.repository';
import { ServiceService } from './service.service';

@Module({
  imports: [WarrantyModule],
  controllers: [ServiceController],
  providers: [ServiceService, ServiceTicketGuard,
    { provide: TicketRepository, useClass: PrismaTicketRepository },
    { provide: ServiceTicketAccess, useClass: UnavailableServiceTicketAccess },
  ],
  exports: [ServiceService],
})
export class ServiceModule {}
