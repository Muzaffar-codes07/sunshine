import { Controller, Get, Module, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthModule } from '../auth/auth.module';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProjectSummaryService } from './project-summary.service';

@Controller('enquiries')
@UseGuards(AuthGuard, RolesGuard)
@Roles('SALES', 'ADMIN')
export class ProjectSummaryController {
  constructor(private readonly summaries: ProjectSummaryService) {}

  @Get(':id/summary')
  get(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.summaries.get(id);
  }
}

/** D2's read-only project summary; it reads other D2 tables and writes nothing. */
@Module({ imports: [AuthModule], controllers: [ProjectSummaryController], providers: [ProjectSummaryService], exports: [ProjectSummaryService] })
export class SummaryModule {}
