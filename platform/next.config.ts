import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // chokidar uses native fsevents on macOS — must be loaded at runtime via
  // require() rather than bundled, or webpack throws "Module not found:
  // fsevents" on Linux build hosts.
  serverExternalPackages: ['chokidar', 'fsevents'],
  typedRoutes: false,
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Defensive: keep these as commonjs externals even on Node builds.
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('chokidar', 'fsevents');
      }
    }
    return config;
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

// Sentry source-map upload + tunnel. Source-map upload only fires when
// SENTRY_AUTH_TOKEN is set in the build environment (CI / Vercel).
export default withSentryConfig(nextConfig, {
  org: 'oraclebot',
  project: 'platform',
  silent: !process.env.CI,
  // Tunnel proxies Sentry events through a Next route to bypass ad blockers.
  tunnelRoute: '/monitoring',
});
