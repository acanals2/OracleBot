# Guardrails test scenarios (V0)

Use this checklist to evidence **verification** and **production refusal** before customer runs. Log results alongside `services/verification` audit files (`data/audit.jsonl`).

## Preconditions

- Verification API running: `uvicorn main:app --port 8000` from `services/verification/`.
- `ORACLEBOT_AUDIT_LOG` points at a writable JSONL path.

## Cases

| ID | Case | Steps | Expected |
|----|------|-------|----------|
| G1 | Staging hostname, TXT missing | `POST /verify/dns` with `domain: staging.example.test`, valid-looking `expected_txt`, no DNS setup | `verified: false`, `txt_status` ∈ {`txt_nxdomain`, `txt_no_answer`, `txt_no_match`}, audit event `refused_txt_mismatch` or similar |
| G2 | Production-suspected host, no override | `domain: google.com` (no staging marker), `manual_staging_ack: false` | `verified: false`, `production_allowed: false`, audit `refused_production_suspected` |
| G3 | Production-suspected host, invalid manual ack | `manual_staging_ack: true` without `operator_id` + `manual_staging_reason` | `verified: false`, audit `refused_manual_ack_invalid` |
| G4 | Production-suspected host, valid operator ack | `domain: internal.customer.com`, `manual_staging_ack: true`, `operator_id`, `manual_staging_reason`, matching TXT | `production_allowed: true` with override reasons in body; audit contains `used_operator_override` / event `verified_dns` if TXT matches |
| G5 | OAuth stub | `POST /verify/oauth` | HTTP **501**, audit `oauth_not_implemented` |
| R1 | CLI refuses run without verify | `oraclebot run --target https://staging.x.dev` (no verify flags, no skip) | Exit code **3**, stderr mentions verification |
| R2 | CLI allows with `--skip-verify` | `oraclebot run --skip-verify --dry-run ...` | Run directory created |

## Notes

- TXT checks use `_oraclebot.<domain>` per product spec.
- Tighten heuristics after real engagements; document false positives in this file.
