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
 */
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { NoActiveOrgError, NotInOrgError, UnauthenticatedError } from './auth';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function apiError(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: 'invalid_input', details: err.flatten() },
      { status: 400 },
    );
  }
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }
  if (err instanceof NoActiveOrgError) {
    return NextResponse.json({ ok: false, error: 'no_active_org' }, { status: 403 });
  }
  if (err instanceof NotInOrgError) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  // eslint-disable-next-line no-console
  console.error('[api]', err);
  const message = err instanceof Error ? err.message : 'Internal error';
  return NextResponse.json(
    { ok: false, error: 'internal', message },
    { status: 500 },
  );
}
