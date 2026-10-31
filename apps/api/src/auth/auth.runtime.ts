import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

export const SESSION_COOKIE_NAME = 'sunshine.sid';
const localOrigins = 'http://127.0.0.1:3001,http://localhost:3001,http://127.0.0.1:5173,http://localhost:5173';
export function trustedOrigins(value = process.env.AUTH_TRUSTED_ORIGINS ?? localOrigins): string[] {
  return value.split(',').map((part) => {
    const raw = part.trim();
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.hostname.includes('*')) {
      throw new Error('AUTH_TRUSTED_ORIGINS must contain exact HTTP(S) origins');
    }
    return url.origin;
  });
}
@Injectable()
export class AuthRuntime implements OnModuleDestroy {
  readonly origins = trustedOrigins();
  readonly cookieSecure = process.env.SESSION_COOKIE_SECURE === 'true';
  private readonly logger = new Logger(AuthRuntime.name);
  readonly store: connectPgSimple.PGStore;
  readonly middleware: ReturnType<typeof session>;
  constructor() {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters; generate a random local secret');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for staff sessions');
    if (process.env.SESSION_COOKIE_SECURE && !['true', 'false'].includes(process.env.SESSION_COOKIE_SECURE)) throw new Error('SESSION_COOKIE_SECURE must be true or false');
    const Store = connectPgSimple(session);
    this.store = new Store({
      conString: process.env.DATABASE_URL, tableName: 'staff_sessions', createTableIfMissing: false,
      pruneSessionInterval: 60, errorLog: () => this.logger.error('Staff session store operation failed'),
    });
    this.middleware = session({
      name: SESSION_COOKIE_NAME, secret, store: this.store, resave: false, saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'strict', secure: this.cookieSecure, maxAge: 8 * 60 * 60 * 1000, path: '/' },
    });
  }
  onModuleDestroy() { this.store.close(); }
}
