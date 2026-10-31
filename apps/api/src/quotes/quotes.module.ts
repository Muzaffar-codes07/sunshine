import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { SalesModule } from '../sales/sales.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

// D4 can supply QUOTE_WARRANTY_POLICY_READER from its core policy module when available.
// Until then the saved product lines explicitly report UNCONFIGURED terms.
@Module({ imports: [AuthModule, CatalogModule, SalesModule], controllers: [QuotesController], providers: [QuotesService], exports: [QuotesService] })
export class QuotesModule {}
