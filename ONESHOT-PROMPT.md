# ONE-SHOT DEPLOYMENT PROMPT

**Use this prompt with Claude Code to deploy the complete SimpleSwap exchange pool system in one go.**

---

## PROMPT START

```
Deploy a SimpleSwap exchange pool system with the following specifications:

## CREDENTIALS (Replace with your own)

### BrightData Scraping Browser
- Customer ID: YOUR_BRIGHTDATA_CUSTOMER_ID (e.g., hl_9d12e57c)
- Zone: YOUR_ZONE_NAME (e.g., scraping_browser1)
- Password: YOUR_BRIGHTDATA_PASSWORD

### Render.com
- API Key: YOUR_RENDER_API_KEY (get from Render Dashboard → Account Settings → API Keys)

### Merchant
- Polygon Wallet: YOUR_POLYGON_WALLET_ADDRESS (e.g., 0xE5173e7c3089bD89cd1341b637b8e1951745ED5C)

### Price Points
- PRICE_POINTS: "19,29,59" (or your custom prices, comma-separated)

## DEPLOYMENT STEPS

1. Clone the pool server repository:
   git clone https://github.com/blinds123/simpleswap-exchange-pool.git

2. Deploy to Render using render.yaml or manual setup

3. Configure all environment variables via Render API:
   - BRIGHTDATA_CUSTOMER_ID
   - BRIGHTDATA_ZONE
   - BRIGHTDATA_PASSWORD
   - MERCHANT_WALLET
   - PRICE_POINTS
   - POOL_SIZE=5
   - MIN_POOL_SIZE=3

4. Wait for deploy to complete

5. Initialize pools by calling /admin/init-pool multiple times until all pools are at 5/5

6. Verify with /health/pools endpoint

7. Test end-to-end with Playwright:
   - Test /buy-now endpoint for each price point
   - Verify exchange URLs are valid SimpleSwap links
   - Verify auto-replenishment triggers immediately after use

## EXPECTED FINAL STATE

- All pools healthy (5/5 exchanges each)
- Auto-replenishment working (triggers immediately when pool < target)
- Exchange URLs successfully redirect to SimpleSwap
- API responds within 200ms

## VERIFICATION COMMANDS

# Check pool health
curl https://YOUR-RENDER-URL.onrender.com/health/pools

# Test buy-now endpoint
curl -X POST https://YOUR-RENDER-URL.onrender.com/buy-now \
  -H "Content-Type: application/json" \
  -d '{"amountUSD": 59}'

# Initialize one exchange per pool
curl -X POST https://YOUR-RENDER-URL.onrender.com/admin/init-pool
```

---

## AUTOMATED RENDER ENV SETUP

Use this curl command pattern to set environment variables via Render API:

```bash
# Set environment variable on Render
curl -X PUT "https://api.render.com/v1/services/YOUR_SERVICE_ID/env-vars/VARIABLE_NAME" \
  -H "Authorization: Bearer YOUR_RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"value": "YOUR_VALUE"}'

# Get service ID from:
curl "https://api.render.com/v1/services?limit=100" \
  -H "Authorization: Bearer YOUR_RENDER_API_KEY"
```

---

## PLAYWRIGHT E2E TEST TEMPLATE

```javascript
const { chromium } = require('playwright');

async function fullE2ETest(renderUrl) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

    console.log('=== SIMPLESWAP POOL E2E TEST ===\n');

    // 1. Test pool health
    console.log('1. Testing pool health...');
    const healthRes = await fetch(`${renderUrl}/health/pools`);
    const health = await healthRes.json();
    console.log(`   Status: ${health.status}`);
    for (const [price, pool] of Object.entries(health.pools)) {
        console.log(`   $${price}: ${pool.size}/${pool.target} - ${pool.status}`);
    }

    // 2. Test each price point
    for (const price of [19, 29, 59]) {
        console.log(`\n2. Testing $${price} buy-now...`);
        const buyRes = await fetch(`${renderUrl}/buy-now`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amountUSD: price })
        });
        const buyData = await buyRes.json();

        if (buyData.success) {
            console.log(`   ✓ Success: ${buyData.exchangeUrl.split('id=')[1]}`);

            // Verify exchange URL loads
            await page.goto(buyData.exchangeUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            const isSimpleSwap = page.url().includes('simpleswap.io');
            console.log(`   ✓ Valid SimpleSwap page: ${isSimpleSwap}`);
        } else {
            console.log(`   ✗ Failed: ${buyData.error}`);
        }
    }

    // 3. Test immediate replenishment
    console.log('\n3. Verifying auto-replenishment...');
    await new Promise(r => setTimeout(r, 2000));
    const health2 = await (await fetch(`${renderUrl}/health/pools`)).json();
    const isReplenishing = Object.values(health2.isReplenishing).some(v => v);
    console.log(`   Auto-replenishment triggered: ${isReplenishing}`);

    await browser.close();
    console.log('\n=== TEST COMPLETE ===');
}

// Run test
fullE2ETest('https://YOUR-RENDER-URL.onrender.com');
```

---

## COMMON ISSUES AND FIXES

### Issue: "Pool empty" error
**Fix**: Call `/admin/init-pool` multiple times to fill pools

### Issue: Exchange creation timeout
**Fix**: BrightData needs ~15-30s per exchange on free Render tier. Be patient.

### Issue: Wrong wallet address
**Fix**: Update MERCHANT_WALLET env var and trigger new deploy

### Issue: Hardcoded price points
**Fix**: Ensure pool-server.js uses dynamic POOL_CONFIG from PRICE_POINTS env var

### Issue: Replenishment not triggering
**Fix**: Verify trigger condition is `< size` not `< minSize` for immediate replenishment

---

## ARCHITECTURE DIAGRAM

```
User clicks "Buy Now" on Landing Page (Netlify)
              │
              ▼
      POST /buy-now to Pool Server (Render)
              │
              ▼
    ┌─────────────────────────────────┐
    │     Pool Server                 │
    │  ┌─────────────────────────┐    │
    │  │ Exchange Pools          │    │
    │  │  $19: [ex1, ex2, ex3...│    │
    │  │  $29: [ex1, ex2, ex3...│    │
    │  │  $59: [ex1, ex2, ex3...│    │
    │  └─────────────────────────┘    │
    │              │                   │
    │              ▼                   │
    │     Return exchange URL         │
    │              │                   │
    │              ▼                   │
    │   Auto-replenish (background)   │
    │              │                   │
    │              ▼                   │
    │    BrightData CDP → SimpleSwap  │
    │    Create new exchange          │
    │    Add to pool                  │
    └─────────────────────────────────┘
              │
              ▼
     User redirected to SimpleSwap
     Exchange page (pre-filled wallet)
              │
              ▼
     User pays with card via Mercuryo
              │
              ▼
     Crypto sent to merchant wallet
```

---

## CHECKLIST FOR SUCCESSFUL DEPLOYMENT

- [ ] BrightData account created and Scraping Browser zone configured
- [ ] Render account created
- [ ] Repository forked/cloned
- [ ] Render Web Service created and connected to GitHub
- [ ] All 7 environment variables set (BRIGHTDATA_CUSTOMER_ID, BRIGHTDATA_ZONE, BRIGHTDATA_PASSWORD, MERCHANT_WALLET, PRICE_POINTS, POOL_SIZE, MIN_POOL_SIZE)
- [ ] Deploy successful (check Render logs)
- [ ] Pools initialized (call /admin/init-pool 10+ times)
- [ ] Health check shows healthy status
- [ ] E2E test passing with Playwright
- [ ] Auto-replenishment verified (use exchange, check isReplenishing becomes true)
- [ ] Landing page integrated with /buy-now endpoint
