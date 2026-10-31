import { z } from 'zod';

const mobileMessage = 'Enter a valid 10-digit Indian mobile number';

export const enquirySourceSchema = z.enum(['WEB', 'PHONE', 'WHATSAPP'], {
  error: 'Choose a valid enquiry source',
});
export const enquiryStatusSchema = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'ARCHIVED'], {
  error: 'Choose a valid enquiry status',
});
export const systemTypeSchema = z.enum(['ON_GRID', 'OFF_GRID'], {
  error: 'Choose On-Grid or Off-Grid',
});

const mobileSchema = z.string({ error: mobileMessage }).trim()
  .transform((value) => {
    const compact = value.replace(/[\s-]/g, '');
    if (compact.startsWith('+91')) return compact.slice(3);
    if (compact.startsWith('0')) return compact.slice(1);
    return compact;
  })
  .pipe(z.string().regex(/^[6-9][0-9]{9}$/, mobileMessage));

const optionalEmailSchema = z.string({ error: 'Enter a valid email address' }).trim()
  .max(254, 'Email must be at most 254 characters')
  .transform((value) => value === '' ? undefined : value)
  .pipe(z.email({ error: 'Enter a valid email address' }).optional())
  .optional();

const capacityMessage = 'Choose a whole-number capacity from 1 to 5 kW';
const capacitySchema = z.union([z.string(), z.number()], { error: capacityMessage })
  .pipe(z.coerce.number<string | number>({ error: capacityMessage })
    .int(capacityMessage).min(1, capacityMessage).max(5, capacityMessage));

export const publicEnquiryRequestSchema = z.object({
  name: z.string({ error: 'Enter your name' }).trim()
    .min(2, 'Name must contain at least 2 characters')
    .max(120, 'Name must be at most 120 characters'),
  phone: mobileSchema,
  email: optionalEmailSchema,
  addressLine: z.string({ error: 'Enter your address' }).trim()
    .min(5, 'Address must contain at least 5 characters')
    .max(300, 'Address must be at most 300 characters'),
  city: z.string({ error: 'Enter your city' }).trim()
    .min(2, 'City must contain at least 2 characters')
    .max(80, 'City must be at most 80 characters'),
  pincode: z.string({ error: 'Enter a valid 6-digit Indian pincode' }).trim()
    .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit Indian pincode'),
  requestedCapacityKw: capacitySchema,
  systemType: systemTypeSchema.optional(),
  subsidyInterest: z.boolean({ error: 'Choose whether you are interested in a subsidy' }).default(false),
  message: z.string({ error: 'Enter a text message' }).trim()
    .max(1000, 'Message must be at most 1000 characters')
    .transform((value) => value === '' ? undefined : value).optional(),
}, { error: 'Only send the fields allowed on the enquiry form' }).strict();

export type PublicEnquiryRequest = z.output<typeof publicEnquiryRequestSchema>;
export type PublicEnquiryInput = z.input<typeof publicEnquiryRequestSchema>;

export const publicEnquiryResponseSchema = z.object({
  data: z.object({
    id: z.uuid({ error: 'Enquiry ID must be a valid UUID' }),
    status: z.literal('NEW', { error: 'A new enquiry must have NEW status' }),
    createdAt: z.iso.datetime({ error: 'Enquiry creation time must be a valid ISO timestamp' }),
  }),
});
