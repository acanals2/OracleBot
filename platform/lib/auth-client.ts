/**
 * Better Auth client (browser) instance.
 *
 * Use the exported helpers in client components:
 *
 *   import { signIn, signUp, signOut, useSession, organization } from '@/lib/auth-client';
 *
 *   const { data: session, isPending } = useSession();
 *   await signIn.email({ email, password });
 *   await organization.create({ name, slug });
 *
 * Mirrors the plugin set on the server (organization), so the typed
 * `organization.*` methods are available client-side.
 */
import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  plugins: [organizationClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  organization,
  useActiveOrganization,
  useListOrganizations,
} = authClient;
