import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { loginRequestSchema, staffSessionResponseSchema, logoutResponseSchema, type LoginRequest } from '@sunshine/contracts';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { PublicFormRateLimitGuard } from '../platform/rate-limit.guard';
import { ApiError } from '../platform/api-error';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthRuntime, SESSION_COOKIE_NAME } from './auth.runtime';
import type { AuthenticatedStaffRequest } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly runtime: AuthRuntime) {}
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(PublicFormRateLimitGuard)
  async login(@Body(new ZodValidationPipe(loginRequestSchema)) input: LoginRequest, @Req() request: Request) {
    const user = await this.auth.checkCredentials(input.email, input.password);
    await new Promise<void>((resolve, reject) => request.session.regenerate((error) => error ? reject(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Unable to create a staff session')) : resolve()));
    request.session.staffUserId = user.id;
    delete request.session.customerAccountId;
    await new Promise<void>((resolve, reject) => request.session.save((error) => error ? reject(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Unable to save a staff session')) : resolve()));
    return staffSessionResponseSchema.parse({ data: user });
  }
  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedStaffRequest) { return staffSessionResponseSchema.parse({ data: request.user }); }

  @Post('logout')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await new Promise<void>((resolve, reject) => request.session.destroy((error) => error ? reject(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Unable to end your staff session')) : resolve()));
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'strict', secure: this.runtime.cookieSecure });
    return logoutResponseSchema.parse({ data: { loggedOut: true } });
  }
}
