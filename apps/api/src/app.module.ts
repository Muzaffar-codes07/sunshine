import { FilesModule } from './files/files.module';
import { QuotesModule } from './quotes/quotes.module';
import { OrdersModule } from './orders/orders.module';
import { SummaryModule } from './summary/summary.module';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'node:path';
import { PlatformModule } from './platform/platform.module';
import { HealthController } from './platform/health.controller';
import { SalesModule } from './sales/sales.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { WarrantyModule } from './warranty/warranty.module';
import { FinanceModule } from './finance/finance.module';
import { ReportingModule } from './reporting/reporting.module';
import { ServiceModule } from './service/service.module';
import { InventoryModule } from './inventory/inventory.module';
import { LabourModule } from './labour/labour.module';
import { CustomerModule } from './customer/customer.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: resolve(__dirname, '../../web/dist'),
      exclude: ['/api/{*path}'],
    }),
    FilesModule,
    PlatformModule,
    AuthModule,
    SalesModule,
    CatalogModule,
    WarrantyModule,
    FinanceModule,
    LabourModule,
    CustomerModule,
    ReportingModule,
    ServiceModule,
    InventoryModule,
    QuotesModule,
    OrdersModule,
    SummaryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
