import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ERRORS, ErrorCode } from './error-code.js';

export interface ErrorBody {
  error: { code: ErrorCode; message: string; fields?: Record<string, string> };
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT_STATE,
  429: ErrorCode.TOO_MANY_REQUESTS,
};

const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && Object.hasOwn(ERRORS, value);

// http-errors style client errors thrown by body-parser (413 too large, 415 charset, ...).
const isExposedClientError = (e: unknown): e is { status: number } => {
  const { status, expose } = (e ?? {}) as { status?: unknown; expose?: unknown };
  return expose === true && typeof status === 'number' && status >= 400 && status < 500;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    let code = ErrorCode.INTERNAL_ERROR;
    let fields: Record<string, string> | undefined;

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const body = typeof res === 'object' ? (res as Record<string, unknown>) : undefined;
      const status = exception.getStatus();
      if (isErrorCode(body?.code)) {
        code = body.code;
        fields = body.fields as Record<string, string> | undefined;
      } else if (isErrorCode(res)) {
        code = res;
      } else if (isErrorCode(body?.message)) {
        code = body.message;
      } else if (STATUS_TO_CODE[status]) {
        code = STATUS_TO_CODE[status];
      } else if (status >= 400 && status < 500) {
        code = ErrorCode.VALIDATION_FAILED;
      }
    } else if (isExposedClientError(exception)) {
      code = STATUS_TO_CODE[exception.status] ?? ErrorCode.VALIDATION_FAILED;
    }

    if (code === ErrorCode.INTERNAL_ERROR) {
      // The raw error stays in the server log; the response never carries it.
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const { status, message } = ERRORS[code];
    const error: ErrorBody['error'] = { code, message };
    if (fields) error.fields = fields;
    host.switchToHttp().getResponse<Response>().status(status).json({ error } satisfies ErrorBody);
  }
}
