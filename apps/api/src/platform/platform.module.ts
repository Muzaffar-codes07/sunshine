import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Shared infrastructure available to every domain module. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PlatformModule {}
