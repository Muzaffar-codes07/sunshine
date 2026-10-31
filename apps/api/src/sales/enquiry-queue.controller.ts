import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import {
  archiveEnquirySchema, assignEnquirySchema, enquiryListQuerySchema, markEnquiryContactedSchema, qualifyEnquirySchema,
  type ArchiveEnquiry, type AssignEnquiry, type EnquiryListQuery, type MarkEnquiryContacted, type QualifyEnquiry,
} from '@sunshine/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { EnquiryQueueService } from './enquiry-queue.service';

const uuid = new ParseUUIDPipe({ version: '4' });

/** Staff enquiry queue. Sales and admin only; the public form posts to EnquiriesController instead. */
@Controller('enquiries')
@UseGuards(AuthGuard, RolesGuard)
@Roles('SALES', 'ADMIN')
export class EnquiryQueueController {
  constructor(private readonly queue: EnquiryQueueService) {}

  @Get()
  list(@Query(new ZodValidationPipe(enquiryListQuerySchema)) query: EnquiryListQuery) {
    return this.queue.list(query);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.queue.get(id);
  }

  @Post(':id/contacted')
  markContacted(@Param('id', uuid) id: string, @Body(new ZodValidationPipe(markEnquiryContactedSchema)) body: MarkEnquiryContacted) {
    return this.queue.markContacted(id, body);
  }

  @Post(':id/qualify')
  qualify(@Param('id', uuid) id: string, @Body(new ZodValidationPipe(qualifyEnquirySchema)) body: QualifyEnquiry) {
    return this.queue.qualify(id, body);
  }

  @Post(':id/assign')
  assign(@Param('id', uuid) id: string, @Body(new ZodValidationPipe(assignEnquirySchema)) body: AssignEnquiry) {
    return this.queue.assign(id, body);
  }

  @Post(':id/archive')
  archive(@Param('id', uuid) id: string, @Body(new ZodValidationPipe(archiveEnquirySchema)) body: ArchiveEnquiry) {
    return this.queue.archive(id, body);
  }
}
