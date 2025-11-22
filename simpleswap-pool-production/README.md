# SimpleSwap Pool System - Production Ready

**Instant crypto checkout for any product landing page using SimpleSwap exchange pool.**

## What This Does

This system provides **instant crypto payment** for your products using pre-created SimpleSwap exchanges:

1. Customer clicks "Buy Now" on your product landing page
2. System delivers pre-created SimpleSwap exchange from pool
3. Customer is redirected to SimpleSwap to complete payment (USD → POL MATIC)
4. System automatically creates new exchange to refill pool
5. Pool stays full and ready for next customer

**No waiting, no delays - instant redirect to payment.**

---

## System Flow

```
Customer on Your Landing Page
         ↓
  Clicks "Buy Now"
         ↓
Backend delivers exchange from pool
         ↓
Redirect to SimpleSwap exchange page
         ↓
Customer completes crypto payment
         ↓
Funds → Your merchant wallet
         ↓
[Background] Pool creates replacement exchange
         ↓
Pool ready for next customer
```

---

## Files Included

```
simpleswap-pool-production/
├── server-on-demand.js       # Main backend server
├── package.json                # Dependencies
├── .env.example                # Environment variables template
├── exchange-pool.json          # Pool storage (will be created)
├── frontend-example.html       # Integration example
└── README.md                   # This file
```

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update:

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
MERCHANT_WALLET=0xYourWalletAddress
POOL_SIZE=10
MIN_POOL_SIZE=5
PRODUCT_PRICE_USD=25
FRONTEND_URL=https://your-landing-page.com

BRIGHTDATA_CUSTOMER_ID=your_customer_id
BRIGHTDATA_ZONE=your_zone
BRIGHTDATA_PASSWORD=your_password
```

### 3. Start Server

```bash
npm start
```

Server runs at `http://localhost:3000`

### 4. Initialize Pool

```bash
curl -X POST http://localhost:3000/admin/init-pool
```

This creates 10 SimpleSwap exchanges ready for delivery.

### 5. Add to Your Landing Page

See `frontend-example.html` for integration code. Basic example:

```html
<button onclick="buyNow()">Buy Now - $25</button>

<script>
async function buyNow() {
    const res = await fetch('http://localhost:3000/buy-now', {
        method: 'POST'
    });
    const data = await res.json();

    if (data.success) {
        window.location.href = data.exchangeUrl; // → SimpleSwap
    }
}
</script>
```

---

## Deployment to Render.com

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "SimpleSwap pool system"
git push origin main
```

### 2. Create Render Service

1. Go to [Render.com](https://render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `simpleswap-pool`
   - **Build Command**: `npm install`
   - **Start Command**: `node server-on-demand.js`

### 3. Add Environment Variables

In Render dashboard, add all variables from `.env`:
- `MERCHANT_WALLET`
- `POOL_SIZE`
- `MIN_POOL_SIZE`
- `PRODUCT_PRICE_USD`
- `FRONTEND_URL`
- `BRIGHTDATA_CUSTOMER_ID`
- `BRIGHTDATA_ZONE`
- `BRIGHTDATA_PASSWORD`

### 4. Deploy

Render will automatically build and deploy. Your backend will be live at:
```
https://your-service-name.onrender.com
```

### 5. Initialize Production Pool

```bash
curl -X POST https://your-service-name.onrender.com/admin/init-pool
```

### 6. Update Frontend

Change `API_URL` in your landing page to your Render URL:
```javascript
const API_URL = 'https://your-service-name.onrender.com';
```

---

## API Endpoints

### POST `/buy-now`
Get exchange instantly from pool

**Response:**
```json
{
  "success": true,
  "exchangeId": "abc123xyz",
  "exchangeUrl": "https://simpleswap.io/exchange?id=abc123xyz",
  "amountUSD": 25,
  "poolStatus": "instant",
  "createdAt": "2025-11-22T00:00:00.000Z"
}
```

### GET `/stats`
Check pool status

**Response:**
```json
{
  "mode": "pool",
  "poolSize": 8,
  "maxSize": 10,
  "minSize": 5,
  "isReplenishing": false,
  "productPrice": 25,
  "merchantWallet": "0x...",
  "exchanges": [...]
}
```

### GET `/health`
System health check

**Response:**
```json
{
  "status": "healthy",
  "mode": "pool",
  "poolSize": 8,
  "timestamp": "2025-11-22T00:00:00.000Z"
}
```

### POST `/admin/init-pool`
Initialize/refill pool with 10 exchanges

**Response:**
```json
{
  "success": true,
  "poolSize": 10,
  "message": "Pool initialized with 10 exchanges"
}
```

---

## How Pool Management Works

- **Pool Size**: 10 exchanges (configurable)
- **Min Threshold**: 5 exchanges (triggers auto-refill)
- **Delivery**: `pool.shift()` - instant
- **Replenishment**: Automatic when pool drops below minimum
- **Persistence**: Exchanges stored in `exchange-pool.json`
- **Fallback**: On-demand creation if pool empty

---

## Configuration Options

### Change Product Price

Update `.env`:
```env
PRODUCT_PRICE_USD=50
```

Then reinitialize pool:
```bash
curl -X POST https://your-backend.onrender.com/admin/init-pool
```

### Change Pool Size

Update `.env`:
```env
POOL_SIZE=20
MIN_POOL_SIZE=10
```

### Change Merchant Wallet

Update `.env`:
```env
MERCHANT_WALLET=0xYourNewWalletAddress
```

Then reinitialize pool.

---

## Monitoring

### Check Pool Status
```bash
curl https://your-backend.onrender.com/stats
```

### Check System Health
```bash
curl https://your-backend.onrender.com/health
```

### View Logs
In Render dashboard: **Logs** tab

---

## Troubleshooting

### Pool Empty

```bash
curl -X POST https://your-backend.onrender.com/admin/init-pool
```

### CORS Errors

Update `FRONTEND_URL` in Render environment variables to match your landing page domain.

### Exchange Shows Wrong Amount

Update `PRODUCT_PRICE_USD` and reinitialize pool.

---

## Production Checklist

Before going live:

- [ ] Update `MERCHANT_WALLET` to your actual wallet
- [ ] Set `FRONTEND_URL` to your production domain
- [ ] Verify `PRODUCT_PRICE_USD` matches your product price
- [ ] Test `/buy-now` endpoint
- [ ] Initialize pool with `/admin/init-pool`
- [ ] Test end-to-end purchase flow
- [ ] Monitor pool status with `/stats`

---

## What's SimpleSwap?

SimpleSwap is a cryptocurrency exchange that allows users to swap between different cryptocurrencies. This system automates the creation of exchange transactions where customers send USD (USDT) and receive POL (Polygon MATIC) sent to your merchant wallet.

---

## Support

- **Backend Status**: `https://your-backend.onrender.com/health`
- **Pool Stats**: `https://your-backend.onrender.com/stats`
- **SimpleSwap**: https://simpleswap.io

---

## License

This system is SimpleSwap-specific and designed for instant crypto checkout on product landing pages.

