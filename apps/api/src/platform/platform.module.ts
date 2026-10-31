import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency';
import { PrismaService } from './prisma.service';

/** Shared infrastructure available to every domain module. */
@Global()
@Module({
  providers: [PrismaService, IdempotencyService],
  exports: [PrismaService, IdempotencyService],
})
export class PlatformModule {}
