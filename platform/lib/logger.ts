/**
 * Structured JSON logger for the platform.
 *
 * Use `logger.info({ event: 'name', ...ctx }, 'message')`.
 * Pull a per-request child with `logger.child({ traceId })` and pass that down.
 *
 * In dev, output is pretty-printed via pino-pretty when stdout is a TTY.
 * In production, stays as JSON for log aggregation (Sentry, Datadog, etc).
 */
import pino, { type Logger } from 'pino';
import { env } from './env';

const isDev = env.NODE_ENV !== 'production';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: { app: 'platform', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev && process.stdout.isTTY
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,app,env' },
        },
      }
    : {}),
});

/** Generate a new trace id (UUID v4) for a request, job, or webhook. */
export function newTraceId(): string {
  return crypto.randomUUID();
}

/** Logger bound to a traceId — pass this around for the duration of a request. */
export function withTrace(traceId: string): Logger {
  return logger.child({ traceId });
}
