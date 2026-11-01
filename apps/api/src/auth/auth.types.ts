import type { Request } from 'express';
import type { StaffIdentity } from '@sunshine/contracts';
import 'express-session';

declare module 'express-session' {
  interface SessionData { staffUserId?: string; customerAccountId?: string; }
}
export interface AuthenticatedStaffRequest extends Request { user: StaffIdentity; }
