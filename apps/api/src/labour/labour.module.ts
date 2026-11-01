import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { LabourController } from './labour.controller';
import { LabourService } from './labour.service';
@Module({ imports: [AuthModule, FinanceModule], controllers: [LabourController], providers: [LabourService] })
export class LabourModule {}
