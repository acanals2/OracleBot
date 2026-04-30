import type { Config } from 'drizzle-kit';
import { config } from 'dotenv';

// Drizzle Kit doesn't auto-load .env.local. Pull it in here so
// `npm run db:generate / db:push` see DATABASE_URL.
config({ path: '.env.local' });
config({ path: '.env' });

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
} satisfies Config;
