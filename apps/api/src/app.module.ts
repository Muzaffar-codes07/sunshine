import { QuotesModule } from './quotes/quotes.module';
import { OrdersModule } from './orders/orders.module';
<<<<<<< HEAD
=======
import { SummaryModule } from './summary/summary.module';
>>>>>>> origin/main
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'node:path';
import { PlatformModule } from './platform/platform.module';
import { HealthController } from './platform/health.controller';
import { SalesModule } from './sales/sales.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: resolve(__dirname, '../../web/dist'),
      exclude: ['/api/{*path}'],
    }),
    PlatformModule,
    AuthModule,
    SalesModule,
    CatalogModule,
    QuotesModule,
    OrdersModule,
<<<<<<< HEAD
=======
    SummaryModule,
>>>>>>> origin/main
  ],
  controllers: [HealthController],
})
export class AppModule {}
