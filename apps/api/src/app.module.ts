import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'node:path';
import { PlatformModule } from './platform/platform.module';
import { HealthController } from './platform/health.controller';
import { SalesModule } from './sales/sales.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';

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
    InventoryModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
