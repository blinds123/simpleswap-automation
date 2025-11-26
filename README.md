# SimpleSwap Exchange Pool System

**Production-ready cryptocurrency exchange pool for instant TikTok cold traffic checkout.**

## Overview

This system pre-creates SimpleSwap exchanges so customers clicking "Buy Now" get instant checkout without waiting. Features:
- **Pre-warmed exchange pools** ($19, $29, $59 price points)
- **Auto-replenishment** - triggers immediately after any exchange is used
- **BrightData integration** - bypasses Cloudflare protection
- **File-based locking** - prevents race conditions

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Netlify Site   │────▶│   Render Server  │────▶│   SimpleSwap    │
│ (Landing Page)  │     │  (Pool Server)   │     │   (Exchanges)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │                ┌──────────────────┐
        │                │    BrightData    │
        │                │ Scraping Browser │
        │                └──────────────────┘
        │
        ▼
   Customer redirected to SimpleSwap
   exchange URL with pre-filled wallet
```

## Quick Start (One-Shot Deployment)

### Prerequisites
- GitHub account
- Render.com account (free tier works)
- BrightData Scraping Browser account
- Polygon wallet address for receiving payments

### Step 1: Fork Repository
```bash
git clone https://github.com/blinds123/simpleswap-exchange-pool.git my-pool
cd my-pool
```

### Step 2: Deploy to Render

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo
3. Use these settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (or Starter for production)

### Step 3: Configure Environment Variables

Set these in Render Dashboard → Environment:

| Variable | Description | Example |
|----------|-------------|---------|
| `BRIGHTDATA_CUSTOMER_ID` | BrightData account | `hl_9d12e57c` |
| `BRIGHTDATA_ZONE` | Zone name | `scraping_browser1` |
| `BRIGHTDATA_PASSWORD` | Zone password | `your_password` |
| `MERCHANT_WALLET` | Your Polygon address | `0xE5173e7c3089bD89cd1341b637b8e1951745ED5C` |
| `PRICE_POINTS` | Comma-separated prices | `19,29,59` |
| `POOL_SIZE` | Target pool size | `5` |
| `MIN_POOL_SIZE` | Minimum before refill | `3` |

### Step 4: Initialize Pools
```bash
# After deploy is live, initialize pools:
curl -X POST https://YOUR-APP.onrender.com/admin/init-pool
```

### Step 5: Integrate with Landing Page
```javascript
// In your product page checkout button:
async function handleCheckout(priceUSD) {
    const response = await fetch('https://YOUR-APP.onrender.com/buy-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUSD: priceUSD })
    });

    const data = await response.json();

    if (data.success && data.exchangeUrl) {
        window.location.href = data.exchangeUrl;
    } else {
        console.error('Checkout failed:', data.error);
    }
}
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Server status |
| `GET` | `/health/pools` | Pool health with sizes and status |
| `POST` | `/buy-now` | Get exchange URL (removes from pool) |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/init-pool` | Create one exchange per pool |
| `GET` | `/stats` | Detailed pool statistics |

### Example Requests

```bash
# Check pool health
curl https://YOUR-APP.onrender.com/health/pools

# Response:
{
  "status": "healthy",
  "pools": {
    "19": { "status": "healthy", "size": 5, "target": 5 },
    "29": { "status": "healthy", "size": 5, "target": 5 },
    "59": { "status": "healthy", "size": 5, "target": 5 }
  },
  "isReplenishing": { "19": false, "29": false, "59": false }
}

# Get exchange for customer
curl -X POST https://YOUR-APP.onrender.com/buy-now \
  -H "Content-Type: application/json" \
  -d '{"amountUSD": 59}'

# Response:
{
  "success": true,
  "exchangeUrl": "https://simpleswap.io/exchange?id=abc123xyz",
  "poolStatus": "healthy"
}
```

## Auto-Replenishment System

The pool automatically replenishes **immediately after any exchange is used**:

1. Customer clicks "Buy Now" → `/buy-now` endpoint called
2. Exchange URL returned from pool
3. Pool size drops below target
4. Auto-replenishment triggers **immediately** (not just at minSize)
5. New exchange created in background
6. Pool restored to full capacity

```javascript
// Replenishment trigger logic (pool-server.js):
if (targetPool.length < POOL_CONFIG[poolKey].size) {
    // Triggers IMMEDIATELY when pool not at full capacity
    replenishPool(poolKey);
}
```

## BrightData Configuration

### Getting Credentials

1. Sign up at [brightdata.com](https://brightdata.com)
2. Create a **Scraping Browser** zone
3. Copy credentials from zone settings:
   - Customer ID (starts with `hl_`)
   - Zone name
   - Password

### CDP Connection String
```
wss://brd-customer-{CUSTOMER_ID}-zone-{ZONE}:{PASSWORD}@brd.superproxy.io:9222
```

## File Structure

```
├── pool-server.js        # Main server with all endpoints
├── render.yaml           # Render deployment config
├── package.json          # Dependencies
└── README.md             # This file
```

## Troubleshooting

### Pools not filling
- Check BrightData credentials are correct
- Verify PRICE_POINTS environment variable format: `"19,29,59"`
- Check Render logs for errors

### Exchange creation slow
- Normal: 15-30 seconds per exchange on free tier
- BrightData needs time to bypass Cloudflare

### `isReplenishing` stuck at true
- Check for browser automation errors in logs
- SimpleSwap may be rate-limiting
- Try manual `/admin/init-pool` call

### Wallet address wrong
- Update `MERCHANT_WALLET` in Render environment
- Trigger new deploy

## Testing with Playwright

```javascript
const { chromium } = require('playwright');

async function testPool() {
    // Test API endpoint
    const response = await fetch('https://YOUR-APP.onrender.com/buy-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUSD: 59 })
    });

    const data = await response.json();
    console.log('Success:', data.success);
    console.log('URL:', data.exchangeUrl);

    // Verify URL works
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(data.exchangeUrl);

    const isSimpleSwap = page.url().includes('simpleswap.io');
    console.log('Valid SimpleSwap page:', isSimpleSwap);

    await browser.close();
}
```

## Production Checklist

- [ ] BrightData credentials set in Render
- [ ] Correct wallet address configured
- [ ] PRICE_POINTS matches landing page buttons
- [ ] Pools initialized (5+ exchanges each)
- [ ] Landing page checkout integrated
- [ ] E2E test passing

## License

MIT
