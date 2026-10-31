import { CanActivate, Controller, ExecutionContext, Get, Header, Injectable, Query, UseGuards } from '@nestjs/common';
import { warrantyLookupQuerySchema, type WarrantyLookupQuery } from '@sunshine/contracts';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { WarrantyLookupAccess } from './warranty-readers';
import { WarrantyService } from './warranty.service';

@Injectable()
export class WarrantyLookupGuard implements CanActivate {
  constructor(private readonly access: WarrantyLookupAccess) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.access.assertCanLookup(context.switchToHttp().getRequest());
    return true;
  }
}

@Controller('warranties')
@UseGuards(WarrantyLookupGuard)
export class WarrantyController {
  constructor(private readonly warranty: WarrantyService) {}

  @Get('lookup')
  @Header('Cache-Control', 'no-store')
  lookup(@Query(new ZodValidationPipe(warrantyLookupQuerySchema)) query: WarrantyLookupQuery) {
    return this.warranty.lookup(query);
  }
}
