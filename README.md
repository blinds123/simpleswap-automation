# SimpleSwap Exchange Automation

Automated SimpleSwap exchange creation using Apify and Playwright with advanced anti-detection.

## Features

- 🤖 Fully automated exchange creation
- 🎭 Maximum stealth and human-like behavior
- 🌐 Residential proxy support through Apify
- 📊 Detailed logging and error handling
- 💾 Results stored in Apify dataset

## Input Parameters

- `wallet_address` (required): Polygon (MATIC) wallet address
- `amount` (optional): Amount in USD (default: 25, min: 25, max: 10000)
- `from_currency` (optional): Currency to send (default: "usd-usd")
- `to_currency` (optional): Currency to receive (default: "pol-matic")
- `headless` (optional): Run browser in headless mode (default: true)

## Output

Returns JSON object with:
- `status`: "success", "failed", or "error"
- `exchange_id`: SimpleSwap exchange ID (if successful)
- `exchange_url`: Full URL to the exchange page
- `wallet_address`: Input wallet address
- `amount`: Input amount
- `created_at`: Timestamp

## Usage

### Via Apify Console

1. Go to https://console.apify.com/actors/YOUR_ACTOR_ID
2. Click "Try it"
3. Enter wallet address and parameters
4. Click "Start"

### Via API

```bash
curl -X POST https://api.apify.com/v2/acts/YOUR_ACTOR_ID/runs \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wallet_address": "0x1372Ad41B513b9d6eC008086C03d69C635bAE578",
    "amount": 50
  }'
```

### Via Python

```python
from apify_client import ApifyClient

client = ApifyClient('YOUR_API_TOKEN')

run = client.actor('YOUR_ACTOR_ID').call(
    run_input={
        'wallet_address': '0x1372Ad41B513b9d6eC008086C03d69C635bAE578',
        'amount': 50
    }
)

print(run['output'])
```

## Local Development

```bash
# Install dependencies
pip install -r requirements.txt
playwright install chromium

# Run locally (requires setting APIFY_INPUT_KEY_VALUE_STORE_DIR)
python main.py
```

## Deployment

Automatically deploys via GitHub Actions when pushed to `main` branch.

## Success Rate

This automation uses maximum stealth techniques, but SimpleSwap has bot detection. Success rate is estimated at 40-60% depending on SimpleSwap's current detection systems.

## License

Apache-2.0
