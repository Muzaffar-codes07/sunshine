import { Module } from '@nestjs/common';
import { WarrantyController, WarrantyLookupGuard } from './warranty.controller';
import { UnavailableWarrantyEquipmentReader, UnavailableWarrantyLookupAccess,
  WarrantyEquipmentReader, WarrantyLookupAccess } from './warranty-readers';
import { PrismaWarrantyReader, WarrantyReader } from './warranty.repository';
import { WarrantyService } from './warranty.service';

@Module({
  controllers: [WarrantyController],
  providers: [WarrantyService, WarrantyLookupGuard,
    { provide: WarrantyReader, useClass: PrismaWarrantyReader },
    { provide: WarrantyEquipmentReader, useClass: UnavailableWarrantyEquipmentReader },
    { provide: WarrantyLookupAccess, useClass: UnavailableWarrantyLookupAccess },
  ],
  exports: [WarrantyService],
})
export class WarrantyModule {}
