import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { healthResponseSchema, readinessResponseSchema } from '@sunshine/contracts';
import { PrismaService } from './prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  live() {
    return healthResponseSchema.parse({ data: {
      service: 'sunshine-api', status: 'ok', timestamp: new Date().toISOString(),
    } });
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return readinessResponseSchema.parse({ data: { database: 'ready' } });
    } catch {
      throw new ServiceUnavailableException('Local PostgreSQL is unavailable');
    }
  }
}
