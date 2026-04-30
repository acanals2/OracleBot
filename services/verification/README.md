# OracleBot verification service (V0)

Hard gate for runs: **DNS TXT** at `_oraclebot.<domain>` plus **production-target heuristics**. OAuth verification returns **501** until implemented.

## Run locally

```bash
cd services/verification
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export ORACLEBOT_AUDIT_LOG="${PWD}/data/audit.jsonl"
uvicorn main:app --reload --port 8000
```

- `POST /verify/dns` — JSON body: `domain`, `expected_txt`, optional `operator_id`, optional `manual_staging_ack` + `manual_staging_reason` (requires operator id + reason when hostname lacks staging markers).
- `POST /verify/oauth` — **501** (stub; audit logged).
- `GET /health`

## Staging hostname heuristics

Hosts must match staging-like substrings (`staging`, `dev`, `uat`, `sandbox`, …) **or** pass a **logged operator manual ack** with reason. Otherwise the service refuses before TXT lookup and writes `refused_production_suspected` to the audit log.

## Audit log

Append-only JSONL at `ORACLEBOT_AUDIT_LOG` (default `./data/audit.jsonl`). Every verification attempt and refusal includes an `audit_id`.
