/**
 * POST /api/dev-login — DEV-ONLY
 *
 * Auto-creates (if missing) and signs in a fixed dev user so you don't have
 * to fill out the email+password form every time you test.
 *
 * Hard-locked to non-production environments. Refuses to run if either
 *   - NODE_ENV === 'production', OR
 *   - VERCEL_ENV === 'production'
 *
 * Both checks are server-side; the button on /sign-in also gates itself
 * client-side by hostname for defense-in-depth.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEV_EMAIL = 'dev@oraclebot.local';
const DEV_PASSWORD = '1530';
const DEV_NAME = 'Dev User';

function isProductionEnvironment(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  if (process.env.VERCEL_ENV === 'production') return true;
  return false;
}

export async function POST(req: Request) {
  if (isProductionEnvironment()) {
    return NextResponse.json(
      { ok: false, error: 'dev-login disabled in production' },
      { status: 403 },
    );
  }

  // Try to sign in first. If the dev user already exists, this is the path.
  try {
    const signInResp = await auth.api.signInEmail({
      body: { email: DEV_EMAIL, password: DEV_PASSWORD },
      asResponse: true,
    });
    if (signInResp.ok) {
      // Forward Set-Cookie from Better Auth to the browser.
      return new NextResponse(JSON.stringify({ ok: true, created: false }), {
        status: 200,
        headers: forwardSetCookies(signInResp, {
          'content-type': 'application/json',
        }),
      });
    }
  } catch {
    // Fall through to sign-up path.
  }

  // Sign-in failed. Create the user, then sign in (autoSignIn: true returns
  // the cookie on signUp directly).
  try {
    const signUpResp = await auth.api.signUpEmail({
      body: { email: DEV_EMAIL, password: DEV_PASSWORD, name: DEV_NAME },
      asResponse: true,
    });
    if (!signUpResp.ok) {
      const text = await signUpResp.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: 'sign-up failed', detail: text },
        { status: 500 },
      );
    }
    return new NextResponse(JSON.stringify({ ok: true, created: true }), {
      status: 200,
      headers: forwardSetCookies(signUpResp, {
        'content-type': 'application/json',
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** Copy `Set-Cookie` from Better Auth's response into the response headers
 *  we hand back to the browser. Without this the auth cookie never reaches
 *  the user agent. */
function forwardSetCookies(
  source: Response,
  base: Record<string, string>,
): Headers {
  const headers = new Headers(base);
  // Response's headers iterator handles multiple Set-Cookie correctly when
  // we use `.getSetCookie()` (Node 20+).
  const cookies = (source.headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie?.();
  if (cookies && cookies.length) {
    for (const c of cookies) headers.append('Set-Cookie', c);
  } else {
    // Fallback: single Set-Cookie header.
    const single = source.headers.get('set-cookie');
    if (single) headers.append('Set-Cookie', single);
  }
  return headers;
}
