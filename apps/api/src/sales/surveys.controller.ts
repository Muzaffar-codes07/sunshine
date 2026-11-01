import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import {
  approveSurveySchema, rejectSurveySchema, rescheduleSurveySchema, scheduleSurveySchema, submitSurveySchema,
  type ApproveSurvey, type RejectSurvey, type RescheduleSurvey, type ScheduleSurvey, type SubmitSurvey,
} from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedStaffRequest } from '../auth/auth.types';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { SurveysService } from './surveys.service';

const uuid = new ParseUUIDPipe({ version: '4' });

/** Site surveys. Sales schedules and decides; the assigned technician records the measurements. */
@Controller()
@UseGuards(AuthGuard, RolesGuard)
@Roles('SALES', 'ADMIN')
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  @Post('enquiries/:id/surveys')
  schedule(@Param('id', uuid) enquiryId: string, @Body(new ZodValidationPipe(scheduleSurveySchema)) body: ScheduleSurvey) {
    return this.surveys.schedule(enquiryId, body);
  }

  @Get('enquiries/:id/surveys')
  listForEnquiry(@Param('id', uuid) enquiryId: string) {
    return this.surveys.listForEnquiry(enquiryId);
  }

  @Get('surveys/awaiting-approval')
  awaitingApproval() {
    return this.surveys.awaitingApproval();
  }

  // Declared before surveys/:id so "assigned" is never read as an ID.
  @Get('surveys/assigned')
  @Roles('TECHNICIAN')
  assigned(@Req() request: AuthenticatedStaffRequest) {
    return this.surveys.assigned(request.user);
  }

  @Get('surveys/:id')
  @Roles('SALES', 'ADMIN', 'TECHNICIAN')
  get(@Param('id', uuid) id: string, @Req() request: AuthenticatedStaffRequest) {
    return this.surveys.get(id, request.user);
  }

  @Post('surveys/:id/reschedule')
  reschedule(@Param('id', uuid) id: string, @Body(new ZodValidationPipe(rescheduleSurveySchema)) body: RescheduleSurvey) {
    return this.surveys.reschedule(id, body);
  }

  @Post('surveys/:id/submit')
  @Roles('TECHNICIAN', 'ADMIN')
  submit(
    @Param('id', uuid) id: string, @Body(new ZodValidationPipe(submitSurveySchema)) body: SubmitSurvey,
    @Req() request: AuthenticatedStaffRequest,
  ) {
    return this.surveys.submit(id, body, request.user);
  }

  @Post('surveys/:id/approve')
  approve(
    @Param('id', uuid) id: string, @Body(new ZodValidationPipe(approveSurveySchema)) body: ApproveSurvey,
    @Req() request: AuthenticatedStaffRequest,
  ) {
    return this.surveys.approve(id, body, request.user);
  }

  @Post('surveys/:id/reject')
  reject(
    @Param('id', uuid) id: string, @Body(new ZodValidationPipe(rejectSurveySchema)) body: RejectSurvey,
    @Req() request: AuthenticatedStaffRequest,
  ) {
    return this.surveys.reject(id, body, request.user);
  }
}
