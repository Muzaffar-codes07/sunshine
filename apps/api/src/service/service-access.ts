import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../platform/api-error';

/** D2 must verify authentication and permission to manage ALL customers' tickets.
 * Assigned-technician access needs record scoping before this broad API is enabled.
 * Neither caller role headers nor an unverified request.user are credentials. */
export abstract class ServiceTicketAccess {
  abstract assertCanManage(request: Request): Promise<void>;
}

@Injectable()
export class UnavailableServiceTicketAccess extends ServiceTicketAccess {
  async assertCanManage(_request: Request): Promise<void> {
    throw new ApiError(503, 'SERVICE_AUTH_UNAVAILABLE', 'Ticket management is awaiting staff authorization integration');
  }
}
