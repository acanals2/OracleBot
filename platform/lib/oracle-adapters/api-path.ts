/**
 * API path adapter — the bundle's `lib/api-path.ts` resolved a basePath prefix
 * for sites deployed under a non-root path. We don't have a basePath, so this
 * is a passthrough.
 */
export function api(p: string): string {
  return p;
}
