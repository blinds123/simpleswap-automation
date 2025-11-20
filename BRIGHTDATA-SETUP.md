# BrightData Account Setup Guide

## Complete Setup (5 Minutes)

### Step 1: Create BrightData Account

1. **Sign Up:**
   - Go to: https://brightdata.com
   - Click "Start free trial" or "Sign up"
   - Use your email and create password
   - Verify your email

2. **Free Trial Info:**
   - 7-day free trial available
   - No credit card required for signup
   - After trial: pay-as-you-go pricing

---

### Step 2: Create Scraping Browser Zone

1. **Access Dashboard:**
   - Log into: https://brightdata.com/cp/zones
   - You'll see "Zones" dashboard

2. **Create New Zone:**
   - Click **"Add Zone"** button
   - Or click **"Create"** → **"Scraping Browser"**

3. **Configure Zone:**
   ```
   Zone Type: Scraping Browser ⚠️ IMPORTANT
   Zone Name: simpleswap_automation (or any name you want)
   ```

4. **Pricing Plan:**
   - **Pro Mode** required (browser automation tools)
   - **Pay-as-you-go** pricing
   - Estimated cost: ~$0.005 per exchange creation
   - 100 exchanges ≈ $0.50

5. **Click "Create Zone"**

---

### Step 3: Get Your Credentials

After creating the zone, you'll see these tabs:
- Overview
- **Access parameters** ← Click this!
- Usage
- Settings

In the **Access parameters** tab, you'll see:

```
┌─────────────────────────────────────────┐
│   Access Parameters                     │
├─────────────────────────────────────────┤
│                                         │
│  Customer ID:  hl_abc123def             │  ← COPY THIS
│                                         │
│  Zone:         simpleswap_automation    │  ← COPY THIS
│                                         │
│  Password:     xyz789randomstring       │  ← COPY THIS
│                                         │
└─────────────────────────────────────────┘
```

**Copy all three values** - you'll need them in the next step!

---

### Step 4: Configure Your Backend

#### Option A: Local Testing (Test First)

Create a `.env` file in your project:

```bash
cd /Users/nelsonchan/Downloads/simpleswap-automation
cp .env.example .env
nano .env
```

Paste your credentials:

```env
# BrightData Credentials (from Step 3)
BRIGHTDATA_CUSTOMER_ID=hl_abc123def
BRIGHTDATA_ZONE=simpleswap_automation
BRIGHTDATA_PASSWORD=xyz789randomstring

# Your Merchant Wallet
MERCHANT_WALLET=0x1372Ad41B513b9d6eC008086C03d69C635bAE578

# Pool Configuration
EXCHANGE_AMOUNT=25
POOL_SIZE=10
MIN_POOL_SIZE=5
PORT=3000
```

Save and exit (Ctrl+X, Y, Enter)

#### Option B: Railway Deployment (Production)

In Railway dashboard → Variables tab, add:

| Variable | Value |
|----------|-------|
| `BRIGHTDATA_CUSTOMER_ID` | `hl_abc123def` |
| `BRIGHTDATA_ZONE` | `simpleswap_automation` |
| `BRIGHTDATA_PASSWORD` | `xyz789randomstring` |
| `MERCHANT_WALLET` | `0x1372Ad41B513b9d6eC008086C03d69C635bAE578` |
| `EXCHANGE_AMOUNT` | `25` |
| `POOL_SIZE` | `10` |
| `MIN_POOL_SIZE` | `5` |
| `PORT` | `3000` |

---

### Step 5: Test Your Setup

**Local Test (Recommended First):**

```bash
# Install dependencies
npm install

# Start the pool server
node pool-server.js
```

You should see:
```
🚀 SimpleSwap Pool Manager starting...
   Server: http://localhost:3000

🏊 Initializing exchange pool with 10 exchanges...
   Merchant Wallet: 0x1372Ad41B513b9d6eC008086C03d69C635bAE578
   Amount per exchange: 25 USD

[1/10] Creating exchange...
   ✓ Exchange abc123 added to pool
[2/10] Creating exchange...
   ✓ Exchange def456 added to pool
...
✅ Pool initialized with 10 exchanges in 620.3s
   Ready to serve customers!
```

**Test the API:**

```bash
# In a new terminal, test getting an exchange
curl http://localhost:3000/get-exchange
```

Expected response:
```json
{
  "success": true,
  "exchangeId": "yifndjqhnwbvqzjv",
  "exchangeUrl": "https://simpleswap.io/exchange?id=yifndjqhnwbvqzjv",
  "amount": 25,
  "wallet": "0x1372Ad41B513b9d6eC008086C03d69C635bAE578",
  "poolStatus": "instant",
  "timestamp": "2025-11-20T..."
}
```

**Test the exchange URL:**
- Copy the `exchangeUrl` from the response
- Open it in your browser
- Should see SimpleSwap exchange page with your wallet pre-filled

---

### Step 6: Monitor Usage & Costs

**Check Your BrightData Usage:**
1. Go to: https://brightdata.com/cp/zones
2. Click your zone: `simpleswap_automation`
3. Click "Usage" tab
4. See costs in real-time

**Example Costs:**
- 10 exchanges (pool initialization): ~$0.05
- 100 customer exchanges: ~$0.50
- 1000 customer exchanges: ~$5.00

**Check Pool Status:**
```bash
curl http://localhost:3000/stats
```

Response:
```json
{
  "totalCreated": 12,
  "totalDelivered": 2,
  "currentPoolSize": 10,
  "poolStatus": "ready",
  "availableExchanges": 10
}
```

---

## Troubleshooting

### Error: "Missing BrightData credentials"

**Cause:** Environment variables not set

**Fix:**
```bash
# Check if .env file exists
cat .env

# If empty, copy example and fill in
cp .env.example .env
nano .env
```

---

### Error: "Connection timeout"

**Cause:** Invalid credentials or zone not active

**Fix:**
1. Double-check credentials in BrightData dashboard
2. Ensure zone is "Active" (not paused)
3. Verify Pro Mode is enabled for the zone

---

### Error: "Browser automation not available"

**Cause:** Zone is not "Scraping Browser" type

**Fix:**
1. Go to: https://brightdata.com/cp/zones
2. Delete current zone (if wrong type)
3. Create new zone with type: **Scraping Browser**

---

### Pool Initializing Too Slowly

**Normal:** 10 exchanges takes ~10 minutes (60 sec each)

**Speed it up:**
- Reduce `POOL_SIZE` to 5 during testing
- Once working, increase to 10 or 20 for production

---

### Free Trial Expired

**Options:**
1. **Add payment method** (pay-as-you-go)
   - No monthly fees
   - Only pay for what you use
   - ~$0.005 per exchange

2. **Contact BrightData sales**
   - Negotiate volume pricing
   - Get bulk discount for high volume

---

## Cost Calculator

**Estimate your monthly costs:**

| Monthly Customers | Exchanges Created | Estimated Cost |
|------------------|------------------|---------------|
| 100 | 110 (10 pool + 100 customers) | ~$0.55 |
| 500 | 510 | ~$2.55 |
| 1,000 | 1,010 | ~$5.05 |
| 5,000 | 5,010 | ~$25.05 |
| 10,000 | 10,010 | ~$50.05 |

**Notes:**
- Pool initialization is one-time per server restart
- Replenishments happen automatically as pool depletes
- Actual costs may vary based on BrightData pricing

---

## Security Best Practices

### ✅ DO:
- Keep credentials in `.env` file (not committed to git)
- Use Railway environment variables for production
- Rotate passwords periodically
- Monitor usage in BrightData dashboard

### ❌ DON'T:
- Commit `.env` file to GitHub
- Share credentials publicly
- Hardcode credentials in code
- Leave unused zones active (delete to avoid charges)

---

## Next Steps

Once your credentials are working:

1. ✅ **Test Locally:** Verify pool creation works
2. ✅ **Deploy to Railway:** Follow `DEPLOYMENT.md`
3. ✅ **Update Netlify Frontend:** Add backend URL
4. ✅ **Test Customer Flow:** Complete end-to-end test
5. ✅ **Monitor Costs:** Track first 100 exchanges
6. ✅ **Go Live:** Share with real customers!

---

## Support

**BrightData Support:**
- Email: support@brightdata.com
- Live chat: https://brightdata.com
- Documentation: https://docs.brightdata.com

**Common Questions:**

**Q: Can I use free tier?**
A: No - Scraping Browser requires Pro Mode (paid).

**Q: What's the minimum cost?**
A: Pay-as-you-go, no minimums. Only pay for exchanges created.

**Q: Can I pause my account?**
A: Yes - delete/pause zones when not in use to avoid charges.

**Q: How do I cancel?**
A: Delete all zones, remove payment method. No cancellation fees.

---

## Ready to Test?

Once you have your credentials, run:

```bash
# Local test
cd /Users/nelsonchan/Downloads/simpleswap-automation
node pool-server.js

# Then in another terminal
curl http://localhost:3000/get-exchange
```

If that works, you're ready to deploy to Railway! 🚀
