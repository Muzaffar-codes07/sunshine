import { z } from 'zod';
export const staffRoleSchema = z.enum(['ADMIN', 'SALES', 'WAREHOUSE', 'TECHNICIAN', 'SUPPORT']);
export type StaffRole = z.infer<typeof staffRoleSchema>;
