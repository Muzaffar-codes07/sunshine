import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SalesModule } from '../sales/sales.module';
import { WarrantyModule } from '../warranty/warranty.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

// A product with no configured policy still saves its lines as explicitly UNCONFIGURED.
@Module({ imports: [AuthModule, CatalogModule, SalesModule, WarrantyModule], controllers: [QuotesController], providers: [QuotesService], exports: [QuotesService] })
export class QuotesModule {}
