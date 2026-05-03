/**
 * Auth middleware. Better Auth sets a session cookie on sign-in; we check
 * for its presence on protected routes and bounce to /sign-in if missing.
 *
 * Note: cookie presence ≠ valid session. We only do a cheap presence check
 * here (middleware runs on every request and can't hit the DB cleanly).
 * Real session validation happens in `requireSession()` inside server
 * components / API route handlers.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

const PROTECTED_PREFIXES = [
  '/app',
  '/api/runs',
  '/api/billing',
  '/api/workspaces',
  '/api/oracle',
  '/api/verify-target',
  '/api/entitlements',
  '/api/tokens',
  '/api/webhook-subscriptions',
];

const PREVIEW_PROXY_PREFIX = '/preview/';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The `/preview/<id>/*` iframe proxy is unprotected — the iframe is loaded
  // from inside an authenticated page, and the child server only listens on
  // 127.0.0.1, so nobody can reach it from outside without going through us.
  if (pathname.startsWith(PREVIEW_PROXY_PREFIX)) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (!isProtected) return NextResponse.next();

  const cookie = getSessionCookie(req);
  // Phase 17: API routes also accept `Authorization: Bearer obt_*` for
  // CI / GitHub Action / CLI clients. Middleware does a cheap presence check
  // — full validation (hash, expiry, revocation) happens in the route via
  // requireSessionOrToken().
  const hasBearerToken =
    pathname.startsWith('/api/') &&
    /^Bearer\s+obt_/i.test(req.headers.get('authorization') ?? '');

  if (!cookie && !hasBearerToken) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, error: 'unauthenticated' },
        { status: 401 },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('redirect_to', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};
