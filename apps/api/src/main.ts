import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './platform/api-exception.filter';
import { AuthRuntime } from './auth/auth.runtime';
import type { Request } from 'express';

// npm workspaces start this process in apps/api; also support repository-root execution.
config({ path: [resolve(process.cwd(), '.env'), resolve(__dirname, '../../../.env')], quiet: true });

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and start local PostgreSQL.');
  }
  const port = Number(process.env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());
  if (process.env.TRUST_PROXY) app.getHttpAdapter().getInstance().set('trust proxy', process.env.TRUST_PROXY);
  app.enableCsrfProtection({
    trustedOrigins: app.get(AuthRuntime).origins,
    exclude: (request: Request) => request.method === 'POST' && /^\/api\/v1\/enquiries\/?$/i.test(request.path),
  });
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'API startup failed');
  process.exitCode = 1;
});
