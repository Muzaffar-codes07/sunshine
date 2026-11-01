import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { ApiError } from '../platform/api-error';

@Injectable()
export class CustomerMailService {
  assertConfigured() {
    if (!process.env.CUSTOMER_SMTP_HOST || !process.env.CUSTOMER_SMTP_USER || !process.env.CUSTOMER_SMTP_PASSWORD || !process.env.CUSTOMER_SMTP_FROM || !process.env.CUSTOMER_PORTAL_ORIGIN) {
      throw new ApiError(503, 'CUSTOMER_MAIL_UNAVAILABLE', 'Customer verification email is not configured');
    }
  }
  async sendVerification(email: string, token: string, purpose: 'register' | 'email') {
    this.assertConfigured();
    const host = process.env.CUSTOMER_SMTP_HOST;
    const user = process.env.CUSTOMER_SMTP_USER;
    const pass = process.env.CUSTOMER_SMTP_PASSWORD;
    const from = process.env.CUSTOMER_SMTP_FROM;
    const origin = process.env.CUSTOMER_PORTAL_ORIGIN;
    const port = Number(process.env.CUSTOMER_SMTP_PORT ?? '587');
    if (!host || !user || !pass || !from || !origin || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ApiError(503, 'CUSTOMER_MAIL_UNAVAILABLE', 'Customer verification email is not configured');
    }
    let portal: URL;
    try {
      portal = new URL(origin);
      if (!['https:', 'http:'].includes(portal.protocol) || portal.username || portal.password || portal.search || portal.hash || portal.pathname !== '/' || (portal.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(portal.hostname))) throw new Error();
    } catch { throw new ApiError(503, 'CUSTOMER_MAIL_UNAVAILABLE', 'Customer portal origin is invalid'); }
    const link = new URL('/customer/verify', portal);
    link.searchParams.set('token', token);
    const transport = nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465, auth: { user, pass } });
    try {
      await transport.sendMail({ from, to: email, subject: purpose === 'register' ? 'Verify your Sunshine customer account' : 'Verify your new Sunshine email',
        text: `Open this link within 24 hours to verify your email:\n\n${link.toString()}\n\nIf you did not request this, ignore the message.` });
    } catch { throw new ApiError(503, 'CUSTOMER_MAIL_UNAVAILABLE', 'Unable to send verification email. Please try again.'); }
    finally { transport.close(); }
  }
}
