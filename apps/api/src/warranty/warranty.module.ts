import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QUOTE_WARRANTY_POLICY_READER } from '../quotes/quote-policy.port';
import { PrismaQuoteWarrantyPolicyReader } from './quote-warranty-policy.reader';
import { WarrantyController, WarrantyLookupGuard } from './warranty.controller';
import { WarrantyEquipmentReader, WarrantyLookupAccess } from './warranty-readers';
import { WarrantyReader } from './warranty.repository';
import { PersistedWarrantyEquipmentReader, StaffWarrantyLookupAccess, ValidatedWarrantyReader } from './persisted-warranty-readers';
import { WarrantyPolicyController } from './warranty-policy.controller';
import { WarrantyPolicyService } from './warranty-policy.service';
import { WarrantyService } from './warranty.service';

@Module({
  imports: [AuthModule],
  controllers: [WarrantyController, WarrantyPolicyController],
  providers: [WarrantyService, WarrantyLookupGuard, WarrantyPolicyService,
    { provide: WarrantyReader, useClass: ValidatedWarrantyReader },
    { provide: WarrantyEquipmentReader, useClass: PersistedWarrantyEquipmentReader },
    { provide: WarrantyLookupAccess, useClass: StaffWarrantyLookupAccess },
    { provide: QUOTE_WARRANTY_POLICY_READER, useClass: PrismaQuoteWarrantyPolicyReader },
  ],
  exports: [WarrantyService, WarrantyEquipmentReader, QUOTE_WARRANTY_POLICY_READER],
})
export class WarrantyModule {}
