/**
 * Better Auth catch-all handler.
 *
 * Better Auth handles all of /api/auth/* (sign-in, sign-up, sign-out, session,
 * forgot-password, OAuth callbacks, organization endpoints) through its own
 * router. We just hand HTTP requests to it.
 */
import { auth } from '@/lib/auth-config';
import { toNextJsHandler } from 'better-auth/next-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST } = toNextJsHandler(auth);
