import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

/**
 * A global-ish pipe. When applied with a schema it validates; otherwise passes
 * through. Apply per-param: `@Body(new ZodValidationPipe(schema))`.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private schema?: ZodSchema<T>) {}
  transform(value: unknown) {
    if (!this.schema) return value;
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      );
    }
    return parsed.data;
  }
}

export function zodError(message: string, _e: ZodError): never {
  throw new BadRequestException(message);
}
