/**
 * Error taxonomy for the worker.
 *
 * Throw `AppError` (or a subclass) inside processors. The top-level run wrapper
 * catches them, attaches the traceId to the log line, reports to Sentry, and
 * fails the BullMQ job — letting the queue handle retry semantics.
 */

export type AppErrorContext = Record<string, unknown>;

export class AppError extends Error {
  readonly code: string;
  readonly retriable: boolean;
  readonly context: AppErrorContext;
  readonly traceId?: string;

  constructor(
    code: string,
    message: string,
    opts: { retriable?: boolean; context?: AppErrorContext; traceId?: string } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retriable = opts.retriable ?? false;
    this.context = opts.context ?? {};
    this.traceId = opts.traceId;
  }
}

export class ConfigError extends AppError {
  constructor(message: string, context: AppErrorContext = {}, traceId?: string) {
    super('config_error', message, { retriable: false, context, traceId });
    this.name = 'ConfigError';
  }
}

export class TargetUnreachableError extends AppError {
  constructor(message: string, context: AppErrorContext = {}, traceId?: string) {
    super('target_unreachable', message, { retriable: true, context, traceId });
    this.name = 'TargetUnreachableError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, context: AppErrorContext = {}, traceId?: string) {
    super('external_service_error', message, {
      retriable: true,
      context: { service, ...context },
      traceId,
    });
    this.name = 'ExternalServiceError';
  }
}

export class RunCanceledError extends AppError {
  constructor(runId: string, traceId?: string) {
    super('run_canceled', 'Run canceled by user', { retriable: false, context: { runId }, traceId });
    this.name = 'RunCanceledError';
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
