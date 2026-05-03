/**
 * Probe manifest — typed wrapper around js/data/probes.json.
 *
 * The marketing site uses the JSON directly (so it's static-deployable).
 * The Next.js dashboard imports through this wrapper to get types + a
 * stable shape that survives JSON-schema drift.
 *
 * IMPORTANT: keep js/data/probes.json + worker/src/engine/probes/* in sync.
 * This file just re-exports — no probe metadata lives here.
 */
// JSON imports work because resolveJsonModule is enabled in tsconfig.
import raw from '../../js/data/probes.json';
import type { PackId } from './packs';

export type ProbeSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ManifestProbe {
  id: string;
  title: string;
  severity: ProbeSeverity;
  description: string;
}

export interface ManifestPack {
  id: PackId;
  label: string;
  tagline: string;
  description: string;
  audience: string;
  shipped: boolean;
  probes: ManifestProbe[];
}

export interface ProbeManifest {
  version: number;
  packs: ManifestPack[];
}

export const PROBE_MANIFEST: ProbeManifest = raw as unknown as ProbeManifest;

/** Convenience: get the probe list for a single pack. */
export function probesForPack(packId: PackId): ManifestProbe[] {
  return PROBE_MANIFEST.packs.find((p) => p.id === packId)?.probes ?? [];
}
