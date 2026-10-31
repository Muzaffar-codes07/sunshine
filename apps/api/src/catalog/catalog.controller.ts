import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { packageListQuerySchema, productListQuerySchema, type PackageListQuery, type ProductListQuery } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { CatalogService } from './catalog.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles('SALES', 'ADMIN')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('products')
  products(@Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery) { return this.catalog.listProducts(query); }
  @Get('products/:id')
  product(@Param('id', new ParseUUIDPipe()) id: string) { return this.catalog.getProduct(id); }
  @Get('packages')
  packages(@Query(new ZodValidationPipe(packageListQuerySchema)) query: PackageListQuery) { return this.catalog.listPackages(query); }
  @Get('packages/:id')
  package(@Param('id', new ParseUUIDPipe()) id: string) { return this.catalog.getPackage(id); }
}
