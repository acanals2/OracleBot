# Oracle Bot — SaaS platform (React)

Ethical, permission-based stress-testing **product UI**: landing page, dashboard, test wizard, live monitor, reports, billing, and safety/compliance.

## Stack

- **Vite** + **React 18** + **TypeScript**
- **Tailwind CSS**
- **React Router**
- **Recharts** (metrics chart placeholder)
- **Lucide** icons

## Commands

```bash
cd platform
npm install
npm run dev
```

Dev server defaults to **http://localhost:3000** (see `vite.config.ts`).

```bash
npm run build   # output in dist/
npm run preview # serve production build locally
```

## Routes (placeholder data)

| Path | Screen |
|------|--------|
| `/` | Landing (hero + features + pricing) |
| `/safety` | Safety & compliance |
| `/app` | Dashboard home |
| `/app/tests/new` | New test wizard (4 steps) |
| `/app/tests/:testId/live` | Live monitoring |
| `/app/tests/:testId/results` | Results / report |
| `/app/billing` | Account & billing |

Future backend: replace `src/data/mock.ts` with API clients; types live in `src/types/api.ts`.

## Deploying to **oraclebot.net** (Vercel)

1. Import this Git repository in [Vercel](https://vercel.com/).
2. Keep **Root Directory** as the repository root — [`vercel.json`](../vercel.json) runs `scripts/sync-public-assets.mjs` then `platform`’s production build.
3. Sync copies `css/`, `js/`, `trading.html`, and `sample-readiness-report.html` into `platform/public/` so legacy URLs keep working next to the React SPA.
4. Add **oraclebot.net** under Project → Settings → Domains.

Production build from repo root:

```bash
npm install && npm install --prefix platform   # first time
npm run build
```

Output: `platform/dist/`. Preview with `npm run preview --prefix platform`.

## Note

The React app is the primary **oraclebot.net** experience at `/`. Legacy static pages remain available at `/trading.html` and `/sample-readiness-report.html` after build. The original root `index.html` is not deployed as the homepage when using this pipeline (the SPA `index.html` is).
