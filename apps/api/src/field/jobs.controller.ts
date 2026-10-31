import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { completeInstallationRequestSchema, jobListQuerySchema, scheduleJobRequestSchema, startInstallationRequestSchema,
  type CompleteInstallationRequest, type JobListQuery, type ScheduleJobRequest, type StartInstallationRequest } from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { IdempotencyKey } from '../platform/idempotency';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { InstallationService } from './installation.service';
import { JobsService } from './jobs.service';

@Controller('jobs')
@UseGuards(AuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService, private readonly installation: InstallationService) {}
  @Get()
  @Roles('SALES', 'ADMIN', 'WAREHOUSE')
  list(@Query(new ZodValidationPipe(jobListQuerySchema)) query: JobListQuery) { return this.jobs.list(query); }
  @Get('assigned')
  @Roles('TECHNICIAN')
  assigned(@Req() request: AuthenticatedStaffRequest) { return this.jobs.assigned(request.user); }
  @Get(':id')
  @Roles('SALES', 'ADMIN', 'WAREHOUSE', 'TECHNICIAN')
  get(@Req() request: AuthenticatedStaffRequest, @Param('id', ParseUUIDPipe) id: string) { return this.jobs.get(id, request.user); }
  @Post(':id/schedule')
  @HttpCode(200)
  @Roles('SALES', 'ADMIN')
  schedule(@Req() request: AuthenticatedStaffRequest, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(scheduleJobRequestSchema)) body: ScheduleJobRequest) {
    return this.jobs.schedule(id, body, request.user);
  }
  @Post(':id/start')
  @HttpCode(200)
  @Roles('TECHNICIAN', 'ADMIN')
  start(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(startInstallationRequestSchema)) body: StartInstallationRequest) {
    return this.installation.start(request.user, key, id, body);
  }
  @Post(':id/complete')
  @HttpCode(200)
  @Roles('TECHNICIAN', 'ADMIN')
  complete(@Req() request: AuthenticatedStaffRequest, @IdempotencyKey() key: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(completeInstallationRequestSchema)) body: CompleteInstallationRequest) {
    return this.installation.complete(request.user, key, id, body);
  }
}
