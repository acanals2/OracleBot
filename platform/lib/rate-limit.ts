/**
 * Lightweight in-memory rate limiter.
 *
 * Per-process token bucket keyed by an arbitrary string. Vercel serverless
 * runs multiple instances, so this is best-effort defense rather than a
 * hard guarantee — but it keeps a single misbehaving share token from
 * spinning up 1000 SSE streams against the same hot Lambda.
 *
 * For a true distributed limiter we'd back this with Redis (BullMQ already
 * uses ioredis); deferred until we observe a real abuse pattern.
 *
 *   const ok = checkRateLimit('share:stream:' + token, { windowMs: 60_000, max: 30 });
 *   if (!ok.allowed) throw new RateLimitError(`retry in ${ok.retryAfterSec}s`);
 */

interface Bucket {
  /** Timestamps (ms) of recent hits inside the current window. */
  hits: number[];
}

const BUCKETS = new Map<string, Bucket>();

export interface RateLimitOpts {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max hits permitted inside the window. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** How many of the window's slots are currently free (after this hit). */
  remaining: number;
  /** Seconds until the oldest hit ages out — caller can surface as Retry-After. */
  retryAfterSec: number;
}

export function checkRateLimit(key: string, opts: RateLimitOpts): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;

  let bucket = BUCKETS.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    BUCKETS.set(key, bucket);
  }

  // Drop expired hits.
  while (bucket.hits.length > 0 && bucket.hits[0] < cutoff) {
    bucket.hits.shift();
  }

  if (bucket.hits.length >= opts.max) {
    const oldest = bucket.hits[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.hits.push(now);
  return {
    allowed: true,
    remaining: Math.max(0, opts.max - bucket.hits.length),
    retryAfterSec: 0,
  };
}

/**
 * Periodic cleanup so abandoned keys (one-off tokens that were hit once
 * and never again) don't leak memory. Called opportunistically; we don't
 * spawn a background interval because Vercel serverless cycles instances
 * frequently anyway.
 */
export function pruneRateLimitBuckets(now = Date.now(), maxAgeMs = 5 * 60_000): void {
  for (const [key, bucket] of BUCKETS) {
    const last = bucket.hits[bucket.hits.length - 1] ?? 0;
    if (now - last > maxAgeMs) BUCKETS.delete(key);
  }
}
