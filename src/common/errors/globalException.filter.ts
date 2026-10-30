import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { PgError, pgErrorCode } from '../../database/pg-errors.js';
import { DomainError } from './domain.error.js';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const CODES_BY_STATUS: Partial<Record<number, string>> = {
  400: 'VALIDATION_ERROR',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

/** Every error leaves the API in one shape: { error: { code, message, details? } }. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const [status, body] = this.toResponse(exception);
    host.switchToHttp().getResponse<Response>().status(status).json(body);
  }

  private toResponse(exception: unknown): [number, ErrorBody] {
    if (exception instanceof DomainError) {
      return [exception.status, { error: { code: exception.code, message: exception.message, details: exception.details } }];
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const messages =
        typeof response === 'object' && response !== null && 'message' in response
          ? (response as { message: unknown }).message
          : exception.message;
      const code = CODES_BY_STATUS[status] ?? 'HTTP_ERROR';
      if (Array.isArray(messages)) {
        return [status, { error: { code, message: 'Request validation failed', details: { issues: messages } } }];
      }
      return [status, { error: { code, message: typeof messages === 'string' ? messages : exception.message } }];
    }
    if (pgErrorCode(exception) === PgError.NUMERIC_OUT_OF_RANGE) {
      return [
        HttpStatus.UNPROCESSABLE_ENTITY,
        { error: { code: 'BALANCE_LIMIT_EXCEEDED', message: 'Resulting balance exceeds the supported maximum' } },
      ];
    }
    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    return [HttpStatus.INTERNAL_SERVER_ERROR, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }];
  }
}
