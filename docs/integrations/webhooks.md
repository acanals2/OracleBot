# Codegen webhooks — operator runbook

Phase 18. OracleBot listens for deploy events from codegen platforms and
auto-triggers a readiness scan against the freshly-deployed URL.

## Supported platforms

| Platform     | Endpoint                                          | Signature header              | Delivery header              |
| ---          | ---                                               | ---                           | ---                          |
| Lovable      | `POST /api/integrations/lovable/deploy`           | `x-lovable-signature`         | `x-lovable-delivery`         |
| v0 (Vercel)  | `POST /api/integrations/v0/deploy`                | `x-v0-signature`              | `x-v0-delivery`              |
| Bolt         | `POST /api/integrations/bolt/deploy`              | `x-bolt-signature`            | `x-bolt-delivery`            |
| Replit Agent | `POST /api/integrations/replit_agent/deploy`      | `x-replit-signature`          | `x-replit-delivery`          |
| Generic      | `POST /api/integrations/generic/deploy`           | `x-oraclebot-signature`       | `x-oraclebot-delivery`       |

The signature is `HMAC-SHA256(rawBody, secret)`, hex-encoded. The `sha256=`
prefix is optional (we strip it before comparing).

## Per-platform payload shapes the normaliser expects

### Lovable

```json
{
  "event": "deploy.succeeded",
  "project": { "id": "<uuid>", "name": "..." },
  "deployment": {
    "url": "https://my-app-deploy-abc123.lovable.app",
    "environment": "production",
    "commit_sha": "..."
  }
}
```

Lookup key: `project.id`. The deploy URL: `deployment.url`.

### v0

```json
{
  "type": "preview.deployed",
  "projectId": "my-project-slug",
  "previewUrl": "https://my-project-abc123.vercel.app",
  "environment": "preview",
  "sha": "..."
}
```

Lookup key: `projectId`. The deploy URL: `previewUrl` (falls back to `url`).

### Bolt

```json
{
  "type": "deployment.ready",
  "payload": {
    "projectId": "...",
    "url": "https://...",
    "target": "preview",
    "meta": { "githubCommitSha": "..." }
  }
}
```

Lookup key: `payload.projectId`. The deploy URL: `payload.url`.

### Replit Agent

```json
{
  "kind": "deploy.completed",
  "repl": { "id": "<repl-id>" },
  "url": "https://...",
  "branch": "main"
}
```

Lookup key: `repl.id`. The deploy URL: `url`.

### Generic

```json
{
  "externalProjectId": "anything-unique",
  "deployedUrl": "https://...",
  "environment": "production",
  "sha": "..."
}
```

Useful for self-hosted CI scripts or platforms not listed above.

## Subscription lifecycle

1. **Create**: user goes to Settings → Integrations → Add integration. Picks
   platform + label + external project id + probe packs. Server mints a
   webhook secret and shows it once.
2. **Configure**: user pastes the OracleBot webhook URL + secret into the
   platform's webhook settings.
3. **Trigger**: platform sends signed POSTs on every deploy. OracleBot
   validates the signature, dedupes by delivery id, creates a run, returns
   202.
4. **Pause / Delete**: user can pause without losing config, or delete to
   regenerate.

## Idempotency

Each delivery has a unique `<delivery-header>` value. We insert into
`webhook_events` keyed on `<platform>:<deliveryId>`. Conflicts return 200
with `{ ok: true, duplicate: true }` — no second run is created.

## Local testing

```sh
curl -X POST http://localhost:3100/api/integrations/generic/deploy \
  -H "x-oraclebot-delivery: test-$(date +%s)" \
  -H "x-oraclebot-signature: $(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')" \
  -H "content-type: application/json" \
  -d "$BODY"
```

Where `$BODY` is `{"externalProjectId":"<id>","deployedUrl":"https://staging.you.com"}` and `$SECRET` is the secret from the create response.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| 200 + `ignored: true` | No subscription matches `(platform, externalProjectId)` | Check the project id matches what your platform sends |
| 401 `bad_signature` | Secret mismatch / wrong signing algorithm | Re-copy the secret from Settings → Integrations |
| 400 `missing <header>` header | Platform isn't sending the delivery id | Check the platform's webhook config |
| 200 + `duplicate: true` | Webhook retry of an event already processed | Working as intended — no action needed |
| 500 + `run_create_failed` | Domain not verified, entitlements blocked, etc. | Check the logs for the specific error, fix the underlying issue, then re-trigger from the platform |
