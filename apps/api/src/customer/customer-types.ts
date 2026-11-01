import type { z } from 'zod';
import { customerLoginSchema, customerRegisterSchema, customerProfileUpdateSchema } from '@sunshine/contracts';
export type CustomerLogin = z.output<typeof customerLoginSchema>;
export type CustomerRegister = z.output<typeof customerRegisterSchema>;
export type CustomerProfileUpdate = z.output<typeof customerProfileUpdateSchema>;
