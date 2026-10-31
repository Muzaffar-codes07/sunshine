import { z } from 'zod';
export const staffRoleSchema = z.enum(['ADMIN', 'SALES', 'WAREHOUSE', 'TECHNICIAN', 'SUPPORT']);
export type StaffRole = z.infer<typeof staffRoleSchema>;

/** Staff directory for pickers (survey technician, enquiry owner). Names and roles only; never emails or sessions. */
export const staffDirectoryQuerySchema = z.object({ role: staffRoleSchema.optional() }, { error: 'Unknown filter' }).strict();
export type StaffDirectoryQuery = z.output<typeof staffDirectoryQuerySchema>;
export const staffMemberSchema = z.object({ id: z.uuid(), displayName: z.string(), role: staffRoleSchema });
export type StaffMember = z.infer<typeof staffMemberSchema>;
export const staffDirectoryResponseSchema = z.object({ data: z.object({ items: z.array(staffMemberSchema) }) });
