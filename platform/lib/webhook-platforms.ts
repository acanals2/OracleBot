/**
 * Per-platform webhook payload normalizers — Phase 18.
 *
 * Each codegen platform has its own deploy-event shape. We normalise into a
 * common DeployEvent so the rest of the pipeline (subscription lookup,
 * scan creation, callback) doesn't have to branch on platform.
 *
 * If your platform isn't on this list yet, use `generic` and document the
 * shape in docs/integrations/webhooks.md — we'll formalise it later.
 */
import type { WebhookPlatform } from './webhook-subscriptions';

export interface DeployEvent {
  /** The newly-deployed URL OracleBot should scan. */
  deployedUrl: string;
  /** Platform-specific project id used to look up the subscription. */
  externalProjectId: string;
  /** "production" / "preview" / etc. — surfaced in the run name. */
  environment: string | null;
  /** Commit SHA if the platform reports one. */
  sha: string | null;
  /** Idempotency token — webhooks retry; we dedupe by this. */
  deliveryId: string;
}

export interface NormalizeResult {
  ok: true;
  event: DeployEvent;
}

export interface NormalizeError {
  ok: false;
  reason: string;
}

/** Header name each platform uses for its HMAC signature. */
export const SIGNATURE_HEADER_BY_PLATFORM: Record<WebhookPlatform, string> = {
  lovable: 'x-lovable-signature',
  v0: 'x-v0-signature',
  bolt: 'x-bolt-signature',
  replit_agent: 'x-replit-signature',
  generic: 'x-oraclebot-signature',
};

/** Header name each platform uses for the delivery / idempotency id. */
export const DELIVERY_HEADER_BY_PLATFORM: Record<WebhookPlatform, string> = {
  lovable: 'x-lovable-delivery',
  v0: 'x-v0-delivery',
  bolt: 'x-bolt-delivery',
  replit_agent: 'x-replit-delivery',
  generic: 'x-oraclebot-delivery',
};

/**
 * Normalise a parsed JSON body + headers into a DeployEvent. Each platform's
 * shape is documented inline so a future contributor can add cases without
 * spelunking docs.
 */
export function normalizePayload(
  platform: WebhookPlatform,
  body: unknown,
  headers: { get(name: string): string | null | undefined },
): NormalizeResult | NormalizeError {
  const deliveryId = (headers.get(DELIVERY_HEADER_BY_PLATFORM[platform]) ?? '').toString();
  if (!deliveryId) {
    return { ok: false, reason: `missing ${DELIVERY_HEADER_BY_PLATFORM[platform]} header` };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'body must be a JSON object' };
  }
  const obj = body as Record<string, unknown>;

  switch (platform) {
    case 'lovable':
      // Lovable sends:
      //   { event: "deploy.succeeded", project: { id, name }, deployment:
      //     { url, environment, commit_sha } }
      return extractLovable(obj, deliveryId);
    case 'v0':
      // v0 sends a flatter shape on its preview-deploy webhook:
      //   { type: "preview.deployed", projectId, previewUrl, environment, sha }
      return extractV0(obj, deliveryId);
    case 'bolt':
      // Bolt's deploy webhook closely mirrors Vercel's:
      //   { type: "deployment.ready", payload: { projectId, url, target, meta:{ githubCommitSha } } }
      return extractBolt(obj, deliveryId);
    case 'replit_agent':
      // Replit Agent sends:
      //   { kind: "deploy.completed", repl: { id }, url, branch }
      return extractReplit(obj, deliveryId);
    case 'generic':
      // Plain shape — useful for custom integrations + tests.
      //   { externalProjectId, deployedUrl, environment?, sha? }
      return extractGeneric(obj, deliveryId);
  }
}

// ── Per-platform extractors ────────────────────────────────────────────────

function extractLovable(o: Record<string, unknown>, deliveryId: string): NormalizeResult | NormalizeError {
  const project = o.project as Record<string, unknown> | undefined;
  const deployment = o.deployment as Record<string, unknown> | undefined;
  const id = typeof project?.id === 'string' ? project.id : null;
  const url = typeof deployment?.url === 'string' ? deployment.url : null;
  if (!id || !url) return { ok: false, reason: 'lovable: missing project.id or deployment.url' };
  return {
    ok: true,
    event: {
      deployedUrl: url,
      externalProjectId: id,
      environment: stringOrNull(deployment?.environment),
      sha: stringOrNull(deployment?.commit_sha),
      deliveryId,
    },
  };
}

function extractV0(o: Record<string, unknown>, deliveryId: string): NormalizeResult | NormalizeError {
  const id = stringOrNull(o.projectId);
  const url = stringOrNull(o.previewUrl) ?? stringOrNull(o.url);
  if (!id || !url) return { ok: false, reason: 'v0: missing projectId or previewUrl' };
  return {
    ok: true,
    event: {
      deployedUrl: url,
      externalProjectId: id,
      environment: stringOrNull(o.environment) ?? 'preview',
      sha: stringOrNull(o.sha),
      deliveryId,
    },
  };
}

function extractBolt(o: Record<string, unknown>, deliveryId: string): NormalizeResult | NormalizeError {
  const payload = (o.payload ?? o) as Record<string, unknown>;
  const id = stringOrNull(payload.projectId) ?? stringOrNull(payload.project_id);
  const url = stringOrNull(payload.url);
  if (!id || !url) return { ok: false, reason: 'bolt: missing payload.projectId or payload.url' };
  const meta = payload.meta as Record<string, unknown> | undefined;
  return {
    ok: true,
    event: {
      deployedUrl: url,
      externalProjectId: id,
      environment: stringOrNull(payload.target),
      sha: stringOrNull(meta?.githubCommitSha),
      deliveryId,
    },
  };
}

function extractReplit(o: Record<string, unknown>, deliveryId: string): NormalizeResult | NormalizeError {
  const repl = o.repl as Record<string, unknown> | undefined;
  const id = stringOrNull(repl?.id);
  const url = stringOrNull(o.url);
  if (!id || !url) return { ok: false, reason: 'replit_agent: missing repl.id or url' };
  return {
    ok: true,
    event: {
      deployedUrl: url,
      externalProjectId: id,
      environment: stringOrNull(o.branch) ?? 'main',
      sha: null,
      deliveryId,
    },
  };
}

function extractGeneric(o: Record<string, unknown>, deliveryId: string): NormalizeResult | NormalizeError {
  const id = stringOrNull(o.externalProjectId) ?? stringOrNull(o.projectId);
  const url = stringOrNull(o.deployedUrl) ?? stringOrNull(o.url);
  if (!id || !url) return { ok: false, reason: 'generic: missing externalProjectId or deployedUrl' };
  return {
    ok: true,
    event: {
      deployedUrl: url,
      externalProjectId: id,
      environment: stringOrNull(o.environment),
      sha: stringOrNull(o.sha),
      deliveryId,
    },
  };
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}
