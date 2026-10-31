import { SetMetadata } from '@nestjs/common';
import type { StaffRole } from '@sunshine/contracts';
export const STAFF_ROLES_KEY = 'sunshine:roles';
export const Roles = (...roles: StaffRole[]) => SetMetadata(STAFF_ROLES_KEY, roles);
