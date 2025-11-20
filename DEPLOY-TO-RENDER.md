# Deploy SimpleSwap Pool Server to Render

## Quick Deploy (5 minutes)

### Step 1: Push to GitHub

```bash
# In your project directory
git add .
git commit -m "Add production pool server with Render config"
git push origin main
```

### Step 2: Deploy to Render

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Render will auto-detect `render.yaml` ✅

### Step 3: Add Environment Variables

In Render dashboard, add these secret environment variables:

```
BRIGHTDATA_CUSTOMER_ID = hl_9d12e57c
BRIGHTDATA_ZONE = scraping_browser1
BRIGHTDATA_PASSWORD = u2ynaxqh9899
```

> ⚠️ **IMPORTANT:** These are already in `render.yaml` but marked as `sync: false` for security. You MUST add them manually in Render dashboard.

### Step 4: Deploy!

Click **"Create Web Service"** → Render will:
- Install dependencies
- Start the server
- Initialize pool with 10 exchanges
- Give you a URL: `https://YOUR-APP-NAME.onrender.com`

---

## Step 5: Update Frontend

1. Go to your Netlify site repository
2. Open `script.js`
3. Add this code:

```javascript
// At the top of script.js
const BACKEND_URL = 'https://YOUR-APP-NAME.onrender.com'; // ← Update this!

async function handleBuyNow() {
    const buyButton = document.getElementById('addToCartBtn');
    const originalText = buyButton.innerHTML;

    try {
        buyButton.disabled = true;
        buyButton.innerHTML = '<div class="spinner"></div> PROCESSING...';

        const response = await fetch(`${BACKEND_URL}/buy-now`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            buyButton.innerHTML = '✓ REDIRECTING TO PAYMENT...';
            setTimeout(() => {
                window.location.href = data.exchangeUrl;
            }, 500);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error(error);
        buyButton.innerHTML = '✗ ERROR - TRY AGAIN';
        setTimeout(() => {
            buyButton.disabled = false;
            buyButton.innerHTML = originalText;
        }, 3000);
    }
}

// Replace existing button handler
document.addEventListener('DOMContentLoaded', () => {
    const buyButton = document.getElementById('addToCartBtn');
    if (buyButton) {
        buyButton.onclick = null; // Remove old handler
        buyButton.addEventListener('click', handleBuyNow);
    }
});
```

4. Push to GitHub → Netlify auto-deploys ✅

---

## Testing

### Test Backend Health

```bash
curl https://YOUR-APP-NAME.onrender.com/health
```

Should return:
```json
{
  "status": "healthy",
  "poolSize": 10,
  "productPrice": 69,
  ...
}
```

### Test Exchange Creation

```bash
curl -X POST https://YOUR-APP-NAME.onrender.com/buy-now
```

Should return instant exchange URL!

### Test Frontend

1. Go to https://beigesneaker.netlify.app
2. Click **"ADD TO CART - $69"**
3. Should redirect to SimpleSwap payment page

---

## How It Works

```
Customer clicks "Buy Now"
    ↓
Frontend calls: /buy-now
    ↓
Backend returns pre-made exchange (0.5s) ⚡
    ↓
Customer redirected to SimpleSwap
    ↓
Customer pays crypto → funds go to your wallet
    ↓
Pool auto-replenishes in background
```

---

## Monitoring

### Check Pool Status

```bash
curl https://YOUR-APP-NAME.onrender.com/stats
```

### View Logs

Go to Render dashboard → Your service → **Logs** tab

---

## Costs

| Service | Plan | Cost/Month |
|---------|------|------------|
| Render | Starter | $9 |
| BrightData | Pay-as-go | ~$2-24 (based on volume) |
| **Total** | | **$11-33/month** |

---

## Troubleshooting

### Pool not initializing?

Check Render logs for BrightData connection errors. Verify credentials are correct.

### Frontend can't connect?

1. Check CORS is enabled (already configured in `pool-server-production.js`)
2. Verify `FRONTEND_URL` in Render matches your Netlify URL
3. Check browser console for errors

### Slow response times?

- First request after inactivity takes ~15s (pool initialization)
- Subsequent requests: instant (0.5s from pool)
- Pool auto-replenishes in background

---

## Need Help?

Check Render logs:
```
https://dashboard.render.com → Your Service → Logs
```

Test endpoints:
- `/health` - Server status
- `/stats` - Pool statistics
- `/buy-now` - Get exchange

---

**You're all set!** 🚀

Customers can now buy your sneakers with crypto!
