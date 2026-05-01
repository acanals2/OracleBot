/**
 * Standardized JSON responses + error mapping for API route handlers.
 *
 * Pattern in every route:
 *   try {
 *     const session = await requireSession();
 *     ...
 *     return ok({ ...payload });
 *   } catch (e) {
 *     return apiError(e);
 *   }
 *
 * Every error response includes a `traceId` so user reports can be correlated
 * with structured server logs. The traceId is generated automatically if the
 * caller doesn't supply one.
 */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { NoActiveOrgError, NotInOrgError, UnauthenticatedError } from './auth';
import { isAppError } from './errors';
import { logger, newTraceId } from './logger';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

interface ApiErrorOpts {
  /** Caller-supplied traceId for log correlation. If omitted, one is generated. */
  traceId?: string;
  /** Extra structured fields to log alongside the error. */
  context?: Record<string, unknown>;
}

export function apiError(err: unknown, opts: ApiErrorOpts = {}) {
  // Next's redirect() and notFound() throw special errors with a `digest`
  // field. They MUST propagate out of route handlers so Next can perform the
  // navigation. If apiError swallows them we end up with a 500 carrying
  // 'NEXT_REDIRECT' as the message and the page blanks.
  const digest = (err as { digest?: unknown })?.digest;
  if (typeof digest === 'string' && /^NEXT_(REDIRECT|NOT_FOUND)/.test(digest)) {
    throw err;
  }

  const traceId = opts.traceId ?? newTraceId();
  const log = logger.child({ traceId, ...(opts.context ?? {}) });

  // ── ZodError ────────────────────────────────────────────────────────────
  if (err instanceof ZodError) {
    log.warn({ event: 'api.validation_error', issues: err.issues }, 'invalid input');
    return NextResponse.json(
      { ok: false, error: 'invalid_input', details: err.flatten(), traceId },
      { status: 400 },
    );
  }

  // ── AppError taxonomy from lib/errors.ts ────────────────────────────────
  if (isAppError(err)) {
    const level = err.statusCode >= 500 ? 'error' : 'warn';
    log[level](
      {
        event: 'api.app_error',
        code: err.code,
        statusCode: err.statusCode,
        context: err.context,
      },
      err.message,
    );
    return NextResponse.json(
      { ok: false, error: err.code, message: err.message, traceId },
      { status: err.statusCode },
    );
  }

  // ── Auth-side errors thrown by lib/auth.ts ──────────────────────────────
  // These predate the AppError taxonomy; keep mapping them explicitly so we
  // don't have to refactor lib/auth.ts in this pass.
  if (err instanceof UnauthenticatedError) {
    log.warn({ event: 'api.unauthenticated' }, 'unauthenticated');
    return NextResponse.json(
      { ok: false, error: 'unauthenticated', traceId },
      { status: 401 },
    );
  }
  if (err instanceof NoActiveOrgError) {
    log.warn({ event: 'api.no_active_org' }, 'no active org');
    return NextResponse.json(
      { ok: false, error: 'no_active_org', traceId },
      { status: 403 },
    );
  }
  if (err instanceof NotInOrgError) {
    log.warn({ event: 'api.not_in_org' }, 'not in org');
    return NextResponse.json(
      { ok: false, error: 'forbidden', traceId },
      { status: 403 },
    );
  }

  // ── Unknown / catch-all ────────────────────────────────────────────────
  // This is the path that previously surfaced as an opaque 500. We now log
  // the full Error (name, message, stack) under the traceId so the user can
  // ship the traceId from their browser console and we can find the cause.
  const e = err as Error | undefined;
  log.error(
    {
      event: 'api.internal_error',
      err: e ? { name: e.name, message: e.message, stack: e.stack } : err,
    },
    'unhandled error in API route',
  );
  const message = e instanceof Error ? e.message : 'Internal error';
  return NextResponse.json(
    { ok: false, error: 'internal', message, traceId },
    { status: 500 },
  );
}
