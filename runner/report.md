# OracleBot readiness report (V0, operator-generated)

## Run summary

- Total actions logged: **29**
- Error responses: **1**
- Latency p50 / p95 / p99 (ms): **97.0 / 201.0 / 248.0**

## Latency by action

| Action | Count | Mean ms |
|--------|-------|---------|
| cancel_order | 7 | 103.7 |
| deposit | 3 | 82.0 |
| kyc_submit | 3 | 107.7 |
| place_limit | 8 | 120.4 |
| place_market | 5 | 94.6 |
| send_message | 2 | 120.5 |
| subscribe_channel | 1 | 129.0 |

## Flagged flows

- `scalper_0002` · cancel_order · GET /health · **500** · 124ms
