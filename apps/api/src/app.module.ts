import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'node:path';
import { PrismaService } from './platform/prisma.service';
import { HealthController } from './platform/health.controller';

@Module({
  imports: [ServeStaticModule.forRoot({
    rootPath: resolve(__dirname, '../../web/dist'),
    exclude: ['/api/{*path}'],
  })],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}
