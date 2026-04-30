/**
 * Better Auth server-side configuration.
 *
 * Wires Better Auth into our Drizzle/Neon database via the official adapter.
 * Enables:
 *   - email/password auth (sign-in, sign-up, password reset)
 *   - the `organization` plugin (orgs, members, invitations, role checks)
 *   - the `nextCookies` plugin (Server Actions get the auth cookie set
 *     correctly without per-action plumbing)
 *
 * Add OAuth providers (Google, GitHub) here when ready.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { db } from '@/lib/db';
import {
  accounts,
  invitations,
  members,
  orgs,
  sessions,
  users,
  verifications,
} from '@/lib/db/schema';

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret && process.env.NODE_ENV === 'production') {
  throw new Error('BETTER_AUTH_SECRET is required in production.');
}

export const auth = betterAuth({
  // The base URL Better Auth uses to construct callback URLs etc.
  // Falls back to NEXT_PUBLIC_APP_URL or localhost for dev.
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  secret: secret ?? 'dev-only-not-for-production',

  database: drizzleAdapter(db, {
    provider: 'pg',
    // Tell the adapter which Drizzle table corresponds to each Better Auth concept.
    // Our table names are 'orgs' (not 'organization') for historical reasons; everything
    // else lines up with BA's defaults thanks to the schema we just wrote.
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      organization: orgs,
      member: members,
      invitation: invitations,
    },
  }),

  emailAndPassword: {
    enabled: true,
    // Email verification is a follow-up — for now, allow sign-in immediately.
    // When we wire Resend for verification, set requireEmailVerification: true.
    requireEmailVerification: false,
    autoSignIn: true,
    // Default Better Auth minimum is 8. We allow 4 in dev so the
    // /api/dev-login button (password "1530") works. Production keeps 8.
    minPasswordLength: process.env.NODE_ENV === 'production' ? 8 : 4,
  },

  // OAuth providers — uncomment once you add the env vars.
  // socialProviders: {
  //   google: {
  //     clientId: process.env.GOOGLE_CLIENT_ID!,
  //     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  //   },
  //   github: {
  //     clientId: process.env.GITHUB_CLIENT_ID!,
  //     clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  //   },
  // },

  plugins: [
    organization({
      // Our app is org-scoped end-to-end. Auto-create a personal org on signup
      // so a brand-new user has somewhere to land instead of a "create org" wall.
      // (We can always remove this later if we want a deliberate org-creation step.)
      // Note: the BA org plugin doesn't have built-in auto-create; we do it
      // ourselves in the sign-up route (lib/auth.ts) to keep the magic visible.
      allowUserToCreateOrganization: true,
    }),
    // Must come last — sets the auth cookie correctly inside Next.js Server Actions.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
