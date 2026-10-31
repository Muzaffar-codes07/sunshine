import { HttpStatus, PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { ApiError, FieldErrors } from './api-error';

/** Validates a request part against a shared contract schema; failures become 400 INVALID_INPUT with field errors. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const flat = z.flattenError(result.error);
    const fieldErrors: FieldErrors = {};
    for (const [field, messages] of Object.entries(flat.fieldErrors as Record<string, string[] | undefined>)) {
      if (messages?.length) fieldErrors[field] = messages;
    }
    // Errors not tied to one field (for example unknown keys) are reported under "_form".
    if (flat.formErrors.length) fieldErrors._form = flat.formErrors;
    throw new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_INPUT', 'Some fields need attention', fieldErrors);
  }
}
