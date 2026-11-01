import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { customerLoginSchema, customerProfileResponseSchema, customerProfileUpdateSchema, customerPortalResponseSchema, customerRegisterSchema, customerRegistrationResponseSchema, customerVerifySchema, logoutResponseSchema } from '@sunshine/contracts';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { PublicFormRateLimitGuard } from '../platform/rate-limit.guard';
import { ApiError } from '../platform/api-error';
import { AuthRuntime, SESSION_COOKIE_NAME } from '../auth/auth.runtime';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerGuard, type CustomerRequest } from './customer.guard';
import { CustomerPortalService } from './customer-portal.service';

@Controller('customer/auth')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService, private readonly runtime: AuthRuntime) {}

  @Post('register') @HttpCode(200) @Header('Cache-Control', 'no-store') @UseGuards(PublicFormRateLimitGuard)
  async register(@Body(new ZodValidationPipe(customerRegisterSchema)) input: { email: string; password: string }) {
    return customerRegistrationResponseSchema.parse(await this.auth.register(input));
  }

  @Post('verify') @HttpCode(200) @Header('Cache-Control', 'no-store') @UseGuards(PublicFormRateLimitGuard)
  async verify(@Body(new ZodValidationPipe(customerVerifySchema)) input: { token: string }) {
    return customerRegistrationResponseSchema.parse(await this.auth.verify(input.token));
  }

  @Post('login') @HttpCode(200) @Header('Cache-Control', 'no-store') @UseGuards(PublicFormRateLimitGuard)
  async login(@Body(new ZodValidationPipe(customerLoginSchema)) input: { email: string; password: string }, @Req() request: Request) {
    const account = await this.auth.login(input);
    await new Promise<void>((resolve, reject) => request.session.regenerate(error => error ? reject(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Unable to create a customer session')) : resolve()));
    delete request.session.staffUserId;
    request.session.customerAccountId = account.id;
    await new Promise<void>((resolve, reject) => request.session.save(error => error ? reject(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Unable to save a customer session')) : resolve()));
    return customerProfileResponseSchema.parse({ data: await this.auth.profile(account.customerId, account.id) });
  }

  @Get('me') @Header('Cache-Control', 'no-store') @UseGuards(CustomerGuard)
  async me(@Req() request: CustomerRequest) { return customerProfileResponseSchema.parse({ data: await this.auth.profile(request.customerId, request.accountId) }); }

  @Post('logout') @HttpCode(200) @Header('Cache-Control', 'no-store') @UseGuards(CustomerGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await new Promise<void>((resolve, reject) => request.session.destroy(error => error ? reject(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Unable to end customer session')) : resolve()));
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'strict', secure: this.runtime.cookieSecure });
    return logoutResponseSchema.parse({ data: { loggedOut: true } });
  }
}

@Controller('customer')
@UseGuards(CustomerGuard)
export class CustomerController {
  constructor(private readonly auth: CustomerAuthService, private readonly portal: CustomerPortalService) {}
  @Get('portal') @Header('Cache-Control', 'private, no-store')
  async portalSnapshot(@Req() request: CustomerRequest) { return customerPortalResponseSchema.parse(await this.portal.snapshot(request.customerId, request.accountId)); }

  @Patch('profile') @Header('Cache-Control', 'no-store')
  async updateProfile(@Req() request: CustomerRequest, @Body(new ZodValidationPipe(customerProfileUpdateSchema)) input: { phone: string; email: string; addressLine: string; city: string; pincode: string; currentPassword: string }) {
    return customerProfileResponseSchema.parse(await this.auth.updateProfile(request.customerId, request.accountId, input));
  }

  @Get('documents/:id') @Header('Cache-Control', 'private, no-store') @Header('X-Content-Type-Options', 'nosniff')
  async document(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string, @Req() request: CustomerRequest) {
    const { file, buffer } = await this.portal.download(request.customerId, id);
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[file.mediaType] ?? 'bin';
    return new StreamableFile(buffer, { type: file.mediaType, length: buffer.length, disposition: `attachment; filename="${file.id}.${extension}"` });
  }
}
