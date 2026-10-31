import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { PlatformModule } from '../platform/platform.module';
import { PublicFormRateLimitGuard } from '../platform/rate-limit.guard';
import { AuthController } from './auth.controller';
import { StaffDirectoryController } from './staff-directory.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthRuntime } from './auth.runtime';
import { AuthSessionMiddleware, AuthOriginMiddleware } from './auth.middleware';

@Module({
  imports: [PlatformModule], controllers: [AuthController, StaffDirectoryController],
  providers: [AuthService, AuthGuard, RolesGuard, AuthRuntime, AuthSessionMiddleware, AuthOriginMiddleware, PublicFormRateLimitGuard],
  exports: [AuthGuard, RolesGuard, AuthService, AuthRuntime],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthSessionMiddleware, AuthOriginMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
