import { z } from 'zod';

const email = z.email().max(254).transform(value => value.trim().toLowerCase());
const password = z.string().min(12).max(200);
const mobile = z.string().trim().regex(/^[6-9][0-9]{9}$/, 'Enter a 10-digit Indian mobile number');

export const customerRegisterSchema = z.object({ email, password }).strict();
export const customerLoginSchema = z.object({ email, password: z.string().min(1).max(200) }).strict();
export const customerVerifySchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const customerProfileUpdateSchema = z.object({
  phone: mobile,
  email,
  addressLine: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/),
  currentPassword: z.string().min(1).max(200),
}).strict();

export const customerProfileSchema = z.object({
  id: z.uuid(), name: z.string(), phone: mobile, email: z.email(),
  addressLine: z.string(), city: z.string(), pincode: z.string(),
  pendingEmail: z.email().nullable(),
});
export const customerProfileResponseSchema = z.object({ data: customerProfileSchema });
export const customerRegistrationResponseSchema = z.object({ data: z.object({ message: z.string() }) });
export const customerPortalResponseSchema = z.object({ data: z.object({
  profile: customerProfileSchema,
  enquiries: z.array(z.object({ id: z.uuid(), status: z.string(), requestedCapacityKw: z.number(), systemType: z.string().nullable(), subsidyInterest: z.boolean(), createdAt: z.iso.datetime() })),
  projects: z.array(z.object({ id: z.uuid(), number: z.string(), confirmedAt: z.iso.datetime(), jobStatus: z.string().nullable(), scheduledStart: z.iso.datetime().nullable(), completedAt: z.iso.datetime().nullable(), dispatchStatus: z.string().nullable(), deliveredAt: z.iso.datetime().nullable() })),
  quotes: z.array(z.object({ id: z.uuid(), revision: z.number(), status: z.string(), totalPrice: z.string(), sentAt: z.iso.datetime().nullable(), lines: z.array(z.object({ description: z.string(), quantity: z.string(), lineTotal: z.string() })) })),
  invoices: z.array(z.object({ id: z.uuid(), number: z.string(), kind: z.string(), status: z.string(), total: z.string(), paidAmount: z.string(), postedAt: z.iso.datetime(), lines: z.array(z.object({ description: z.string(), quantity: z.string(), lineTotal: z.string() })) })),
  equipment: z.array(z.object({ id: z.uuid(), serial: z.string(), product: z.string(), manufacturer: z.string(), warranty: z.object({ policyName: z.string(), scope: z.string(), startDate: z.string(), expiryDate: z.string(), active: z.boolean() }).nullable() })),
  tickets: z.array(z.object({ id: z.uuid(), number: z.string(), status: z.string(), faultDescription: z.string(), createdAt: z.iso.datetime(), resolvedAt: z.iso.datetime().nullable(), closedAt: z.iso.datetime().nullable() })),
  documents: z.array(z.object({ id: z.uuid(), name: z.string(), kind: z.string(), createdAt: z.iso.datetime() })),
}) });
export type CustomerPortal = z.infer<typeof customerPortalResponseSchema>['data'];
