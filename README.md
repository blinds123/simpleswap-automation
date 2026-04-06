# SimpleSwap Exchange Pool Server

Pre-creates SimpleSwap exchange URLs and serves them from a small price-point pool so checkout requests can return immediately.

## Current production shape

- Browser automation uses **Steel.dev** via CDP.
- Pool price points default to **$19, $29, $59**.
- Root status lives at `GET /` and includes pool sizes plus replenishment stats.
- Health status lives at `GET /health`.
- `POST /admin/add-one` is intentionally **non-blocking**:
  - returns `202 {"status":"queued","price":"<key>"}` when the pool is empty
  - returns `200 {"status":"ok","pool":<count>}` when the pool already has exchanges

## Endpoints

### Public

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Service status, pool sizes, and stats |
| `GET` | `/health` | Lightweight health summary |
| `POST` | `/buy-now` | Pops an exchange from the requested pool or creates one on demand |

### Admin

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/admin/init-pool` | Trigger replenishment for one or all pools |
| `POST` | `/admin/add-one` | Non-blocking replenish nudge / queue-empty helper |
| `POST` | `/admin/fill-all` | Trigger replenishment for all pools |
| `POST` | `/admin/fill-sequential` | Synchronously fill one pool |
| `GET` | `/admin/pool` | Raw in-memory pool contents and config |

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `STEEL_API_KEY` | Yes | Steel.dev API key used to create CDP sessions |
| `MERCHANT_WALLET` | Yes | Polygon wallet that receives funds |
| `PRICE_POINTS` | No | Comma-separated USD price points, default `19,29,39` in code |
| `POOL_SIZE_PER_PRICE` | No | Target exchanges per pool |
| `MIN_POOL_SIZE` | No | Minimum threshold for degraded health |
| `POOL_FILE_PATH` | No | Persistent pool file path, defaults to `/data/exchange-pool.json` |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS allowlist |
| `PORT` | No | HTTP port, default `3000` |

## Local development

```bash
npm install
cp .env.example .env
npm start
```

Smoke checks:

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
curl -X POST http://localhost:3000/admin/init-pool
curl -X POST http://localhost:3000/admin/add-one \
  -H 'Content-Type: application/json' \
  -d '{"pricePoint":19}'
```

## Deploy / verify checklist

1. Push `main` to GitHub.
2. Trigger or wait for the Render deploy for `simpleswap-automation-1`.
3. Verify root stats:
   ```bash
   curl https://simpleswap-automation-1.onrender.com/
   ```
4. Verify the admin add-one behavior:
   ```bash
   curl -X POST https://simpleswap-automation-1.onrender.com/admin/add-one \
     -H 'Content-Type: application/json' \
     -d '{"pricePoint":19}'
   ```
5. If the pool was empty, re-check `/` after a few minutes and watch `stats.totalReplenished` / `stats.failedReplenishments`.

## Troubleshooting

- **`/admin/add-one` returns `queued`**: expected when that price pool is empty; the replenish job runs in the background.
- **Root stats never improve**: inspect Render logs for Steel session failures, selector drift, or rate-input timeout screenshots under `/tmp`.
- **Exchange creation hangs**: the server already avoids `networkidle`; confirm the target DOM still uses `[data-testid="wallet-address-input-field"]`.
- **Unexpected empty `/admin/pool` data**: confirm `POOL_FILE_PATH` points at the mounted Render disk.
