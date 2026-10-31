import { z } from 'zod';
import { staffRoleSchema } from './staff';

export const loginRequestSchema = z.object({
  email: z.string({ error: 'Enter a valid staff email address' }).trim().toLowerCase().max(254, 'Email is too long').pipe(z.email({ error: 'Enter a valid staff email address' })),
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password').max(200, 'Password is too long'),
}).strict();
export type LoginRequest = z.output<typeof loginRequestSchema>;
export const staffIdentitySchema = z.object({
  id: z.uuid(), email: z.email(), displayName: z.string(), role: staffRoleSchema,
});
export type StaffIdentity = z.infer<typeof staffIdentitySchema>;
export const staffSessionResponseSchema = z.object({ data: staffIdentitySchema });
export const logoutResponseSchema = z.object({ data: z.object({ loggedOut: z.literal(true) }) });
