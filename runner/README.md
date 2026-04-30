# OracleBot runner (V0 operator CLI)

Install (editable):

```bash
cd runner
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
```

## Commands

**Verify (calls `services/verification`):**

```bash
export AUDIT_LOG=../services/verification/data/audit.jsonl
# start verification API first (see ../services/verification/README.md)

oraclebot verify \
  --base-url http://127.0.0.1:8000 \
  --domain staging.customer.dev \
  --expected-txt "oraclebot-verify=YOUR_TOKEN"
```

**Run (gated — verification flags required unless `--skip-verify`):**

```bash
oraclebot run \
  --target https://staging.customer.dev \
  --personas 200 \
  --duration-sec 60 \
  --rate-rpm 400 \
  --dry-run \
  --verify-base-url http://127.0.0.1:8000 \
  --verify-domain staging.customer.dev \
  --verify-txt "oraclebot-verify=YOUR_TOKEN"
```

**Report:**

```bash
oraclebot report --events runs/<run-id>/events.jsonl --out report.md
```

## Browser personas

`--browser` prints a stub message. Real browser execution is concierge / Playwright (see [docs/04-runner-architecture.md](../docs/04-runner-architecture.md)).

## Persona mix

The CLI defaults to **eight** trader archetypes (`DEFAULT_MIX_EIGHT` in `oraclebot/personas/trader.py`), aligned with the trading vertical copy.
