import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { publicEnquiryRequestSchema, type PublicEnquiryRequest } from '@sunshine/contracts';
import { PublicFormRateLimitGuard } from '../platform/rate-limit.guard';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { EnquiriesService } from './enquiries.service';

@Controller('enquiries')
export class EnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  /** Public web form: the only unauthenticated business entry point. No listing is exposed here. */
  @Post()
  @UseGuards(PublicFormRateLimitGuard)
  create(@Body(new ZodValidationPipe(publicEnquiryRequestSchema)) body: PublicEnquiryRequest) {
    return this.enquiries.createFromWeb(body);
  }
}
