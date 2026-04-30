/**
 * Structured JSON logger for the worker.
 *
 * Per-job: `const log = withTrace(traceId)` and pass `log` through processor stages.
 * In dev, output is pretty-printed via pino-pretty when stdout is a TTY.
 */
import pino, { type Logger } from 'pino';
import { env } from './env.js';

const isDev = env.NODE_ENV !== 'production';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: { app: 'worker', env: env.NODE_ENV },
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

export function newTraceId(): string {
  return crypto.randomUUID();
}

export function withTrace(traceId: string): Logger {
  return logger.child({ traceId });
}
