# Deployment Guide - SimpleSwap Pool System

## Complete Architecture

```
CUSTOMER JOURNEY:
1. Visits yoursite.netlify.app
2. Clicks "Buy Now"
3. ⚡ INSTANTLY redirected to SimpleSwap
4. Completes payment
5. You receive MATIC

TECHNICAL FLOW:
┌─────────────┐      ┌──────────────┐      ┌────────────┐
│   Netlify   │──────│   Railway    │──────│ BrightData │
│  (Frontend) │ GET  │  (Backend)   │      │  (Browser) │
│             │<─────│              │      │            │
└─────────────┘      └──────────────┘      └────────────┘
    Your Site         Pool Manager          Exchange Creator
```

---

## Part 1: Deploy Backend (Railway)

### Why Railway?
- ✅ Free tier: 500 hours/month ($5 credit)
- ✅ Auto-deploys from GitHub
- ✅ Persistent processes (keeps pool alive)
- ✅ Environment variables built-in
- ✅ Zero config needed

### Step-by-Step:

#### 1. Sign Up for Railway
- Go to [railway.app](https://railway.app)
- Sign up with GitHub

#### 2. Get BrightData Credentials
- Go to [brightdata.com/cp/zones](https://brightdata.com/cp/zones)
- Create "Scraping Browser" zone (Pro Mode required)
- Go to "Access parameters" tab
- Copy:
  - Customer ID
  - Zone name
  - Password

#### 3. Deploy to Railway

**Option A: Deploy from GitHub (Recommended)**

```bash
# Push your code to GitHub
cd /Users/nelsonchan/Downloads/simpleswap-automation
git init
git add .
git commit -m "Initial commit - SimpleSwap pool system"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Then in Railway:
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your repository
4. Railway auto-detects Node.js

**Option B: Deploy with Railway CLI**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up
```

#### 4. Configure Environment Variables

In Railway dashboard → Variables tab:

```env
BRIGHTDATA_CUSTOMER_ID=your_customer_id
BRIGHTDATA_ZONE=your_zone_name
BRIGHTDATA_PASSWORD=your_password
MERCHANT_WALLET=0x1372Ad41B513b9d6eC008086C03d69C635bAE578
EXCHANGE_AMOUNT=25
POOL_SIZE=10
MIN_POOL_SIZE=5
PORT=3000
```

#### 5. Update Start Command

Railway Settings → Deploy → Start Command:
```bash
node pool-server.js
```

#### 6. Deploy!

- Click "Deploy"
- Wait 2-3 minutes for pool initialization
- Copy your public URL: `https://yourapp.railway.app`

#### 7. Test Backend

```bash
# Check health
curl https://yourapp.railway.app/health

# Check stats
curl https://yourapp.railway.app/stats

# Get an exchange
curl https://yourapp.railway.app/get-exchange
```

---

## Part 2: Update Netlify Frontend

### Update Your Existing Netlify Site

#### Option 1: Add to Existing Page

Add this button to your product page:

```html
<button id="buyButton" onclick="handlePurchase()">
    Buy Now - $25
</button>

<script>
    const BACKEND_URL = 'https://yourapp.railway.app';

    async function handlePurchase() {
        const button = document.getElementById('buyButton');
        button.disabled = true;
        button.textContent = 'Processing...';

        try {
            const response = await fetch(`${BACKEND_URL}/get-exchange`);
            const data = await response.json();

            if (data.success) {
                // Redirect to SimpleSwap instantly
                window.location.href = data.exchangeUrl;
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            alert('Error creating exchange. Please try again.');
        } finally {
            button.disabled = false;
            button.textContent = 'Buy Now - $25';
        }
    }
</script>
```

#### Option 2: Use Example Template

1. Upload `netlify-example.html` to your Netlify site
2. Update `BACKEND_URL` in the JavaScript:
   ```javascript
   const BACKEND_URL = 'https://yourapp.railway.app';
   ```
3. Deploy to Netlify

---

## Part 3: Testing the Complete Flow

### 1. Test Backend Pool

```bash
# Check if pool is ready
curl https://yourapp.railway.app/health

# Expected response:
{
  "status": "ok",
  "pool": {
    "available": 10,
    "status": "ready"
  }
}
```

### 2. Test Exchange Delivery

```bash
# Get an exchange
curl https://yourapp.railway.app/get-exchange

# Expected response:
{
  "success": true,
  "exchangeId": "abc123def456",
  "exchangeUrl": "https://simpleswap.io/exchange?id=abc123def456",
  "poolStatus": "instant"
}
```

### 3. Test Netlify Integration

1. Visit your Netlify site
2. Click "Buy Now"
3. Should redirect instantly to SimpleSwap
4. Check Railway logs to see pool replenishment

---

## Part 4: Monitoring

### Railway Dashboard

Monitor your backend in Railway dashboard:
- **Metrics**: CPU, Memory, Network usage
- **Logs**: Real-time server logs
- **Deployments**: Version history

### Check Pool Status

```bash
# Get detailed stats
curl https://yourapp.railway.app/stats

# Response:
{
  "totalCreated": 15,
  "totalDelivered": 5,
  "currentPoolSize": 10,
  "poolStatus": "ready",
  "availableExchanges": 10
}
```

### Watch Logs

```bash
# Using Railway CLI
railway logs

# You'll see:
# ✓ Exchange abc123 added to pool
# 📤 Delivered exchange abc123 (9 remaining)
# 🔄 Replenishing pool...
```

---

## Alternative Hosting Options

### Option 1: Render (Free Tier)

1. Go to [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub repo
4. Set environment variables
5. Deploy

**Pros:**
- Free tier available
- Auto-deploy from GitHub
- Similar to Railway

**Cons:**
- Free tier sleeps after 15 min inactivity
- Pool lost when sleeping (must rebuild)

### Option 2: Heroku (No Free Tier)

```bash
# Install Heroku CLI
brew install heroku/brew/heroku

# Login
heroku login

# Create app
heroku create your-app-name

# Set environment variables
heroku config:set BRIGHTDATA_CUSTOMER_ID=your_id
heroku config:set BRIGHTDATA_ZONE=your_zone
heroku config:set BRIGHTDATA_PASSWORD=your_password
heroku config:set MERCHANT_WALLET=0x1372...

# Deploy
git push heroku main
```

### Option 3: DigitalOcean App Platform

1. Go to [digitalocean.com](https://www.digitalocean.com/products/app-platform)
2. Create → App
3. Connect GitHub
4. Configure environment variables
5. Deploy

**Pros:**
- $5/month basic tier
- Predictable pricing
- Good performance

**Cons:**
- Not free
- Requires payment method

---

## Cost Analysis

### BrightData Costs

**Scraping Browser Pro Mode:**
- Pay-per-use pricing
- ~$0.001 - $0.005 per page load
- Creating 1 exchange ≈ $0.005 (rough estimate)

**Example Calculations:**
- 100 customers/day = 100 exchanges/day = ~$0.50/day
- 1000 customers/day = ~$5/day
- Pool initialization (10 exchanges) = ~$0.05 once

**Get exact pricing:**
- Contact BrightData sales
- Check your dashboard after first few exchanges

### Hosting Costs

| Platform | Cost | Notes |
|----------|------|-------|
| Railway | Free tier (500 hrs) | ~$5/mo after |
| Render | Free | Sleeps when inactive |
| Heroku | $7/mo | No free tier |
| DigitalOcean | $5/mo | Predictable |

### Total Estimated Costs

**Low Volume (100 customers/month):**
- Hosting: $0 (Railway free tier)
- BrightData: ~$15/month
- **Total: ~$15/month**

**Medium Volume (1000 customers/month):**
- Hosting: $5 (Railway)
- BrightData: ~$150/month
- **Total: ~$155/month**

---

## Troubleshooting

### Pool Not Initializing

**Check Railway logs:**
```bash
railway logs
```

**Common issues:**
- Missing BrightData credentials
- Invalid credentials
- BrightData account not on Pro Mode

**Fix:**
1. Verify credentials in Railway dashboard
2. Test BrightData connection manually
3. Check BrightData account status

### Pool Running Out

**Symptoms:**
- Customer gets "Pool is empty" error
- Logs show pool at 0

**Causes:**
- High traffic (pool depleting faster than replenishing)
- BrightData errors preventing creation

**Fix:**
1. Increase `POOL_SIZE` to 20 or 30
2. Increase `MIN_POOL_SIZE` to 10
3. Check BrightData quota/limits

### CORS Errors on Netlify

**Error:**
```
Access to fetch at 'https://yourapp.railway.app' from origin 'https://yoursite.netlify.app' has been blocked by CORS
```

**Fix:**

Backend already has `cors()` enabled, but if needed, update `pool-server.js`:

```javascript
app.use(cors({
    origin: 'https://yoursite.netlify.app',
    credentials: true
}));
```

---

## Production Checklist

Before going live:

- [ ] BrightData Pro Mode account active
- [ ] Backend deployed to Railway/Render
- [ ] Environment variables configured
- [ ] Pool initialized successfully (check `/health`)
- [ ] Tested exchange delivery (`/get-exchange`)
- [ ] Netlify frontend updated with backend URL
- [ ] Tested complete customer flow
- [ ] Monitoring/logging set up
- [ ] Error handling tested
- [ ] CORS configured for Netlify domain
- [ ] Merchant wallet verified

---

## Support

**If you need help:**

1. Check Railway logs: `railway logs`
2. Test endpoints with curl
3. Verify BrightData credentials
4. Check BrightData dashboard for errors
5. Monitor pool stats: `/stats` endpoint

**Common Questions:**

**Q: Can I run this on Netlify Functions?**
A: No - Netlify Functions have 10-26 second timeout, pool needs persistent process.

**Q: How do I increase pool size?**
A: Update `POOL_SIZE` environment variable in Railway dashboard, redeploy.

**Q: What happens if pool runs empty?**
A: System creates exchange on-demand (60 sec wait), then replenishes pool.

**Q: Can I use my own wallet?**
A: Yes - update `MERCHANT_WALLET` environment variable.

**Q: Is WordPress better than Netlify?**
A: No - both call the same backend API. Netlify is simpler for static sites.
