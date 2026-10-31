import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformModule } from '../platform/platform.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
@Module({ imports: [PlatformModule, AuthModule], controllers: [CatalogController], providers: [CatalogService], exports: [CatalogService] })
export class CatalogModule {}
