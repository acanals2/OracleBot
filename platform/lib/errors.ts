/**
 * Error taxonomy for the platform.
 *
 * Throw `AppError` (or a subclass) from API routes / actions; a thin handler
 * at the route boundary turns it into the right HTTP response and emits a
 * structured log line with the traceId.
 *
 * Never `throw new Error('...')` for things the caller might handle — use a
 * subclass so the response shape and status are consistent.
 */

export type AppErrorContext = Record<string, unknown>;

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly context: AppErrorContext;
  readonly traceId?: string;

  constructor(
    code: string,
    message: string,
    statusCode = 500,
    context: AppErrorContext = {},
    traceId?: string,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    this.traceId = traceId;
  }

  toJSON() {
    return {
      error: { code: this.code, message: this.message, ...(this.traceId ? { traceId: this.traceId } : {}) },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context: AppErrorContext = {}, traceId?: string) {
    super('validation_error', message, 400, context, traceId);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Not signed in', context: AppErrorContext = {}, traceId?: string) {
    super('unauthorized', message, 401, context, traceId);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', context: AppErrorContext = {}, traceId?: string) {
    super('forbidden', message, 403, context, traceId);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', context: AppErrorContext = {}, traceId?: string) {
    super('not_found', message, 404, context, traceId);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context: AppErrorContext = {}, traceId?: string) {
    super('conflict', message, 409, context, traceId);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', context: AppErrorContext = {}, traceId?: string) {
    super('rate_limited', message, 429, context, traceId);
    this.name = 'RateLimitError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, context: AppErrorContext = {}, traceId?: string) {
    super('external_service_error', message, 502, { service, ...context }, traceId);
    this.name = 'ExternalServiceError';
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
