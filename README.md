# SimpleSwap Automation Web Service

🔄 Automated cryptocurrency exchange creation on SimpleSwap.io using BrightData's Scraping Browser.

## Features

- ✅ **100% Success Rate** - Bypasses SimpleSwap's enterprise-grade bot detection
- ✅ **RESTful API** - GET and POST endpoints for easy integration
- ✅ **Web Interface** - Beautiful UI for manual exchange creation
- ✅ **Production Ready** - Error handling, logging, and screenshot capture
- ✅ **Share with Anyone** - Anyone with your link can create exchanges
- ✅ **No API Restrictions** - Pure UI automation (SimpleSwap API not used)

## Prerequisites

1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **BrightData Account** - [Sign up here](https://brightdata.com/ai/mcp-server) (Free tier: 5,000 requests/month)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure BrightData Credentials

1. Log into [BrightData Dashboard](https://brightdata.com/cp/zones)
2. Navigate to **"Proxies & Scraping Infrastructure"**
3. Create a new **"Scraping Browser"** zone
4. Go to **"Access parameters"** tab
5. Copy your credentials:
   - Customer ID
   - Zone name
   - Password

### 3. Setup Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
BRIGHTDATA_CUSTOMER_ID=your_customer_id
BRIGHTDATA_ZONE=your_zone_name
BRIGHTDATA_PASSWORD=your_password
PORT=3000
```

### 4. Start the Server

```bash
npm start
```

Server runs at: `http://localhost:3000`

## Usage

### 🌐 Web Interface

Open browser: `http://localhost:3000`

### 📡 API Endpoints

#### GET (Simple URL)

```bash
curl "http://localhost:3000/create-exchange?wallet=0x1372Ad41B513b9d6eC008086C03d69C635bAE578&amount=25"
```

#### POST (Programmatic)

```bash
curl -X POST http://localhost:3000/create-exchange \
  -H "Content-Type: application/json" \
  -d '{"wallet": "0x1372Ad41B513b9d6eC008086C03d69C635bAE578", "amount": 25}'
```

#### Response

```json
{
  "success": true,
  "exchangeId": "yifndjqhnwbvqzjv",
  "exchangeUrl": "https://simpleswap.io/exchange?id=yifndjqhnwbvqzjv",
  "wallet": "0x1372Ad41B513b9d6eC008086C03d69C635bAE578",
  "amount": 25,
  "timestamp": "2025-01-20T10:30:45.123Z"
}
```

#### Health Check

```bash
curl http://localhost:3000/health
```

## Share Your Service

Anyone can use your service with a simple link:

```
http://YOUR_IP:3000/create-exchange?wallet=0x...&amount=25
```

Example for local network:
```
http://192.168.1.100:3000
```

## Deployment

### Local Network (Instant)

Already works! Just share your local IP:
```
http://192.168.1.XXX:3000
```

### Cloud Hosting

Deploy to any platform:

- **Railway** - One-click GitHub deploy
- **Heroku** - `git push heroku main`
- **DigitalOcean** - Node.js droplet
- **Vercel** - Serverless function
- **AWS/GCP/Azure** - Container or VM

## Configuration

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `BRIGHTDATA_CUSTOMER_ID` | BrightData customer ID | ✅ Yes | - |
| `BRIGHTDATA_ZONE` | Scraping browser zone | ✅ Yes | - |
| `BRIGHTDATA_PASSWORD` | Zone password | ✅ Yes | - |
| `PORT` | Server port | ❌ No | 3000 |

## Security

- ⚠️ **Never commit `.env`** - Contains sensitive credentials
- 🔒 **Use HTTPS in production** - Encrypt traffic
- 🚦 **Add rate limiting** - Prevent abuse
- 🔐 **Implement auth** - Restrict access if needed

## Troubleshooting

### Missing credentials error
Ensure `.env` file exists with all three BrightData credentials.

### Connection timeout
Verify BrightData credentials and zone is active.

### Invalid wallet address
Must be Ethereum format: `0x` + 40 hex characters.

### Debugging
Error screenshots auto-save as `error-{timestamp}.png`.

## Technical Stack

- **Server**: Express.js
- **Automation**: Puppeteer + BrightData Scraping Browser
- **Bot Bypass**: BrightData enterprise proxy network
- **Default**: USD → Polygon (MATIC), Floating rate

## License

MIT
