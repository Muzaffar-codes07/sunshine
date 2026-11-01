import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { approveInstallationTimeSchema, createTechnicianRateSchema, installationTimeQuerySchema, technicianRatesQuerySchema,
  type ApproveInstallationTime, type CreateTechnicianRate, type InstallationTimeQuery, type TechnicianRatesQuery } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IdempotencyKey } from '../platform/idempotency';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { LabourService } from './labour.service';

@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class LabourController {
  constructor(private readonly labour: LabourService) {}
  @Get('technician-rates') @Header('Cache-Control','no-store')
  rates(@Query(new ZodValidationPipe(technicianRatesQuerySchema)) query: TechnicianRatesQuery) { return this.labour.rates(query); }
  @Post('technician-rates') @Header('Cache-Control','no-store')
  rate(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string,
    @Body(new ZodValidationPipe(createTechnicianRateSchema)) input: CreateTechnicianRate) { return this.labour.createRate(request.user.id, key, input); }
  @Get('time-entries') @Header('Cache-Control','no-store')
  list(@Query(new ZodValidationPipe(installationTimeQuerySchema)) query: InstallationTimeQuery) { return this.labour.list(query); }
  @Get('time-entries/:id') @Header('Cache-Control','no-store')
  get(@Param('id', new ParseUUIDPipe()) id: string) { return this.labour.get(id); }
  @Post('time-entries/:id/approve') @Header('Cache-Control','no-store')
  approve(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(approveInstallationTimeSchema)) input: ApproveInstallationTime) { return this.labour.approve(request.user.id, key, id, input); }
}
