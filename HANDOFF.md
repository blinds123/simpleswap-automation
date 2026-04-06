# SimpleSwap Pool Server — Handoff

**Last updated:** 2026-04-07  
**Active repo:** `blinds123/simpleswap-automation`  
**Active service:** `simpleswap-automation-1` on Render

## What is now true in code

The active `pool-server.js` matches the current deployment handoff for the critical pool fixes:

- exchange creation uses **Steel.dev** CDP sessions
- page navigation uses `waitUntil: "load"` with `domcontentloaded` fallback instead of hanging on `networkidle`
- wallet input uses `[data-testid="wallet-address-input-field"]`
- rate-input timeout failures log loudly, capture a screenshot when possible, and re-throw
- the 60s health check only auto-replenishes **completely empty** pools (`current === 0`)
- `POST /admin/add-one` returns immediately instead of waiting for a multi-minute exchange build
- `/admin/pool` now reports `stats.serverStartTime` without a runtime reference error

## Current `/admin/add-one` contract

| Condition | Response | Purpose |
| --- | --- | --- |
| Pool empty | `202 {"status":"queued","price":"<key>"}` | Queue background replenishment without hitting Render request timeouts |
| Pool already has items | `200 {"status":"ok","pool":<count>}` | Report current pool size immediately |

## Verification steps

```bash
# 1. Root status + stats
curl https://simpleswap-automation-1.onrender.com/

# 2. Immediate admin add-one check
curl -X POST https://simpleswap-automation-1.onrender.com/admin/add-one \
  -H 'Content-Type: application/json' \
  -d '{"pricePoint":19}'
```

If the pool is empty, wait 2-3 minutes and re-check `/` for updated `stats.totalReplenished` / `stats.failedReplenishments` values.

## Safe next steps for future sessions

1. Keep deploy verification focused on `GET /`, `GET /health`, and `POST /admin/add-one`.
2. If exchange creation regresses, inspect the live SimpleSwap DOM before changing selectors.
3. Do not reintroduce synchronous exchange creation into `/admin/add-one`; Render request limits make that path brittle.
