/**
 * POST /api/integrations/<platform>/deploy
 *
 * Phase 18 — codegen-platform deploy webhooks. Lovable / v0 / Bolt /
 * Replit Agent / generic.
 *
 * Flow:
 *   1. Resolve <platform> from the URL path. Reject unknown platforms.
 *   2. Read the raw body (we need it byte-exact to verify HMAC signatures).
 *   3. Normalise the payload into a common DeployEvent shape.
 *   4. Look up an enabled webhook subscription for (platform, externalProjectId).
 *      No subscription = silent 200 (don't tell unknown senders we have a
 *      table named webhook_subscriptions).
 *   5. Verify the HMAC signature using the subscription's stored secret.
 *      Mismatch = 401.
 *   6. Idempotency: insert a webhook_events row keyed on
 *      `<platform>:<deliveryId>`. Duplicate = 200 with no side effect.
 *   7. Create + enqueue an OracleBot run targeting the deployedUrl,
 *      using the subscription's pre-configured packs/productKey.
 *   8. Mark the subscription's lastTriggeredAt.
 *   9. Return 202 with the runId.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { webhookEvents } from '@/lib/db/schema';
import { findSubscription, isWebhookPlatform, markTriggered, verifyHmacSignature } from '@/lib/webhook-subscriptions';
import {
  DELIVERY_HEADER_BY_PLATFORM,
  SIGNATURE_HEADER_BY_PLATFORM,
  normalizePayload,
} from '@/lib/webhook-platforms';
import { createRun } from '@/lib/runs';
import { enqueueExecuteRun } from '@/lib/queue';
import { estimateRunCostCents } from '@/lib/billing';
import { logger, newTraceId } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type Params = Promise<{ platform: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const traceId = newTraceId();
  const log = logger.child({ traceId, route: '/api/integrations/[platform]/deploy' });
  const { platform } = await params;

  if (!isWebhookPlatform(platform)) {
    return NextResponse.json({ ok: false, error: 'unknown_platform' }, { status: 404 });
  }

  // Coarse per-IP rate limit. Applied before any DB work or signature
  // verification so spammers can't make us do crypto + a row lookup per
  // request. Real codegen platforms send dozens of webhooks per hour at
  // most; 60/min is generous. X-Forwarded-For is what Vercel sets.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
  const ipLimit = checkRateLimit(`webhook:${platform}:ip:${ip}`, {
    windowMs: 60_000,
    max: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSec) } },
    );
  }

  // Read the raw body exactly — needed for signature verification. We can't
  // use req.json() and re-stringify because property ordering can change.
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ ok: false, error: 'unreadable_body' }, { status: 400 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  // Normalise.
  const normalized = normalizePayload(platform, body, {
    get: (n) => req.headers.get(n),
  });
  if (!normalized.ok) {
    log.warn({ event: 'webhook.normalize_failed', platform, reason: normalized.reason }, 'normalize failed');
    return NextResponse.json({ ok: false, error: normalized.reason }, { status: 400 });
  }
  const event = normalized.event;

  // Look up subscription.
  const sub = await findSubscription(platform, event.externalProjectId);
  if (!sub) {
    // Silent 200: don't leak the existence of subscription rows to unknown
    // senders. Logged so the operator can debug.
    log.info(
      { event: 'webhook.no_subscription', platform, externalProjectId: event.externalProjectId },
      'webhook for unknown project',
    );
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Verify signature.
  const sigHeader = req.headers.get(SIGNATURE_HEADER_BY_PLATFORM[platform]);
  const valid = verifyHmacSignature(raw, sigHeader, sub.secret);
  if (!valid) {
    log.warn(
      { event: 'webhook.bad_signature', platform, externalProjectId: event.externalProjectId },
      'signature verification failed',
    );
    return NextResponse.json({ ok: false, error: 'bad_signature' }, { status: 401 });
  }

  // Per-subscription rate limit. Defends against a leaked secret being
  // used to drive run creation. 20 runs/hour per subscription is well
  // above realistic deploy frequency (Lovable / Bolt / v0 pipelines push
  // a few times an hour at peak).
  const subLimit = checkRateLimit(`webhook:sub:${sub.id}`, {
    windowMs: 60 * 60_000,
    max: 20,
  });
  if (!subLimit.allowed) {
    log.warn(
      { event: 'webhook.rate_limited', subscriptionId: sub.id, platform },
      'subscription rate-limited',
    );
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(subLimit.retryAfterSec) } },
    );
  }

  // Idempotency: dedupe by (<platform>:<deliveryId>).
  const idempotencyId = `${platform}:${event.deliveryId}`;
  try {
    await db.insert(webhookEvents).values({
      id: idempotencyId,
      type: `${platform}.deploy`,
      processedAt: null,
    });
  } catch {
    // Conflict on PK = already processed.
    log.info({ event: 'webhook.duplicate', idempotencyId }, 'duplicate delivery');
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Create + enqueue the run.
  try {
    const productKey = sub.productKey as 'free' | 'scout' | 'builder' | 'studio' | 'stack';
    const costCentsEstimated = estimateRunCostCents({
      productKey,
      botCount: 5,
      durationMinutes: 3,
    });
    const run = await createRun({
      orgId: sub.orgId,
      userId: sub.createdByUserId,
      input: {
        mode: 'site',
        name: `${platform} · ${event.environment ?? 'deploy'} · ${event.deliveryId.slice(0, 8)}`,
        productKey,
        botCount: 5,
        durationMinutes: 3,
        target: { kind: 'liveUrl', url: event.deployedUrl },
        packs: sub.packs as ('web_classics' | 'ai_built_apps' | 'llm_endpoints' | 'mcp_server' | 'agent_runtime')[],
        hardCapCents: 5000,
        idempotencyKey: idempotencyId,
      },
      costCentsEstimated,
    });
    try {
      await enqueueExecuteRun({ runId: run.id, orgId: sub.orgId });
    } catch (err) {
      log.warn(
        { event: 'webhook.enqueue_failed', runId: run.id, err: (err as Error).message },
        'enqueue failed; run remains queued',
      );
    }

    await markTriggered(sub.id);

    // Mark the webhook event as processed.
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(idempotencyEq(idempotencyId));

    log.info(
      {
        event: 'webhook.run_created',
        platform,
        runId: run.id,
        deployedUrl: event.deployedUrl,
        externalProjectId: event.externalProjectId,
      },
      'webhook triggered scan',
    );

    return NextResponse.json(
      { ok: true, runId: run.id, runUrl: `/app/tests/${run.id}/results` },
      { status: 202 },
    );
  } catch (e) {
    // Mark the webhook event row with the error so it can be retried after
    // ops investigates. We deliberately do NOT delete the row — Stripe-style
    // idempotency means subsequent retries hit the duplicate path until the
    // operator clears the row.
    await db
      .update(webhookEvents)
      .set({ error: (e as Error).message })
      .where(idempotencyEq(idempotencyId))
      .catch(() => null);
    log.error({ event: 'webhook.run_create_failed', err: (e as Error).message }, 'run create failed');
    return NextResponse.json(
      { ok: false, error: 'run_create_failed', message: (e as Error).message },
      { status: 500 },
    );
  }
}

// Tiny helper for the update predicate — keeps the imports light.
function idempotencyEq(id: string) {
  // Re-imported here so we don't pull `eq` and `webhook_events` types into
  // the top of the file when only used in two places.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { eq } = require('drizzle-orm');
  return eq(webhookEvents.id, id);
}
