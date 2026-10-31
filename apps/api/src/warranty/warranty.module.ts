import { Module } from '@nestjs/common';
import { QUOTE_WARRANTY_POLICY_READER } from '../quotes/quote-policy.port';
import { PrismaQuoteWarrantyPolicyReader } from './quote-warranty-policy.reader';
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
    { provide: QUOTE_WARRANTY_POLICY_READER, useClass: PrismaQuoteWarrantyPolicyReader },
  ],
  exports: [WarrantyService, WarrantyEquipmentReader, QUOTE_WARRANTY_POLICY_READER],
})
export class WarrantyModule {}
