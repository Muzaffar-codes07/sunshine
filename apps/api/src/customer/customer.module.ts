import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { CustomerAuthController, CustomerController } from './customer.controller';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerGuard } from './customer.guard';
import { CustomerMailService } from './customer-mail.service';
import { CustomerPortalService } from './customer-portal.service';

@Module({ imports: [AuthModule, FilesModule], controllers: [CustomerAuthController, CustomerController],
  providers: [CustomerAuthService, CustomerGuard, CustomerMailService, CustomerPortalService] })
export class CustomerModule {}
