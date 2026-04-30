/**
 * Provider selector. Reads `ORACLE_PREVIEW_PROVIDER` (default: `local`)
 * and returns the matching implementation.
 *
 * Most callers can keep importing from `lib/oracle-preview` directly while
 * we're on `local` only. New entrypoints (and the eventual E2B switchover)
 * should go through `getProvider()` so the change is mechanical.
 */
import { getActiveProviderName, type PreviewProvider } from './types';
import { localProvider } from './local';
import { e2bProvider } from './e2b';

export function getProvider(): PreviewProvider {
  switch (getActiveProviderName()) {
    case 'e2b':
      return e2bProvider;
    case 'local':
    default:
      return localProvider;
  }
}

export type { PreviewProvider, PreviewStartOptions, PreviewStartResult } from './types';
