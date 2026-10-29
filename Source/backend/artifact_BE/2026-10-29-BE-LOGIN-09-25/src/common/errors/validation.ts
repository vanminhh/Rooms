import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ErrorCode } from './error-code.js';

// [ASSUMPTION] wording for properties the DTO does not declare.
const FORBIDDEN_FIELD_MESSAGE = 'Trường này không được phép gửi lên';

function collect(
  errors: ValidationError[],
  prefix: string,
  fields: Record<string, string>,
): void {
  for (const error of errors) {
    // No property = class-validator `unknownValue` (body is an array or not an object): its text is English, so skip it.
    if (error.property === undefined) continue;
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    const constraints = error.constraints;
    if (constraints) {
      fields[path] =
        'whitelistValidation' in constraints
          ? FORBIDDEN_FIELD_MESSAGE
          : Object.values(constraints)[0];
    }
    if (error.children?.length) collect(error.children, path, fields);
  }
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const fields: Record<string, string> = {};
  collect(errors, '', fields);
  return new BadRequestException(
    Object.keys(fields).length > 0
      ? { code: ErrorCode.VALIDATION_FAILED, fields }
      : { code: ErrorCode.VALIDATION_FAILED },
  );
}
