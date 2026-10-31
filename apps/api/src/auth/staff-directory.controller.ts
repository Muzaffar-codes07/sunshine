import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { staffDirectoryQuerySchema, staffDirectoryResponseSchema, type StaffDirectoryQuery } from '@sunshine/contracts';
import { PrismaService } from '../platform/prisma.service';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { AuthGuard } from './auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

/** Active staff for assignment pickers. Sales and admin choose survey technicians and enquiry owners. */
@Controller('staff')
@UseGuards(AuthGuard, RolesGuard)
@Roles('SALES', 'ADMIN')
export class StaffDirectoryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query(new ZodValidationPipe(staffDirectoryQuerySchema)) query: StaffDirectoryQuery) {
    const items = await this.prisma.user.findMany({
      where: { active: true, role: query.role },
      select: { id: true, displayName: true, role: true },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });
    return staffDirectoryResponseSchema.parse({ data: { items } });
  }
}
