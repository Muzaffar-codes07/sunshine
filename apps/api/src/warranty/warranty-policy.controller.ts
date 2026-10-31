import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { saveWarrantyPolicyInputSchema, type SaveWarrantyPolicyInput } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IdempotencyKey } from '../platform/idempotency';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { WarrantyPolicyService } from './warranty-policy.service';

@Controller('warranty-policies')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class WarrantyPolicyController {
  constructor(private readonly policies: WarrantyPolicyService) {}
  @Get(':productId')
  @Header('Cache-Control', 'no-store')
  get(@Param('productId', new ParseUUIDPipe()) id: string) { return this.policies.get(id); }
  @Post(':productId')
  @Header('Cache-Control', 'no-store')
  save(@Param('productId', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(saveWarrantyPolicyInputSchema)) input: SaveWarrantyPolicyInput,
    @IdempotencyKey() key: string, @Req() request: AuthenticatedStaffRequest) {
    return this.policies.save(id, input, key, request.user.id);
  }
}
