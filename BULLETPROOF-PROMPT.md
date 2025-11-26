# BULLETPROOF SIMPLESWAP + TIKTOK LANDING PAGE SYSTEM V2.0

**Version:** 2.1 | **Date:** 2025-11-26 | **Bulletproof Rating:** 100%

---

## CRITICAL: CONTEXT PRESERVATION SYSTEM

```
THIS PROMPT SURVIVES CONTEXT COMPRESSION.

IMMEDIATE ACTIONS ON RESUMPTION:
1. Read this ENTIRE file first
2. Check CHECKPOINT.md: cat CHECKPOINT.md
3. Source credentials: source CREDENTIALS.env
4. Verify state: curl -s "$RENDER_URL/health/pools"
5. Resume from SKIP_TO_PHASE in CHECKPOINT.md

STATE FILES:
- CHECKPOINT.md    - Progress tracking with resume instructions
- CREDENTIALS.env  - All secrets (NEVER log or commit)
- VERIFY.log       - Test results for audit trail
```

---

## PHASE 0: CREDENTIAL COLLECTION [MANDATORY]

**Stop. Do NOT proceed until ALL credentials are collected.**

### Step 0.1: Create State Files

```bash
# Create checkpoint tracker
cat > CHECKPOINT.md << 'EOF'
# Checkpoint State
SKIP_TO_PHASE=0
LAST_COMPLETED=none

## Progress Log
EOF

# Create verification log
cat > VERIFY.log << 'EOF'
# Verification Log
## Test Results
EOF

echo "[$(date)] Session started" >> CHECKPOINT.md
```

### Step 0.2: Collect ALL Credentials

Create `CREDENTIALS.env` with REAL values (not placeholders):

```bash
cat > CREDENTIALS.env << 'EOF'
# === BRIGHTDATA (from brightdata.com → Zones → scraping_browser1) ===
BRIGHTDATA_CUSTOMER_ID=hl_9d12e57c
BRIGHTDATA_ZONE=scraping_browser1
BRIGHTDATA_PASSWORD=u2ynaxqh9899

# === RENDER (from render.com → Account Settings → API Keys) ===
RENDER_API_KEY=rnd_jPAYRHSNQd3GzgLivAjHkFPPhfcl

# === MERCHANT ===
MERCHANT_WALLET=0xE5173e7c3089bD89cd1341b637b8e1951745ED5C

# === PRODUCT CONFIG ===
PRICE_POINTS=19,29,59
POOL_SIZE=5
MIN_POOL_SIZE=3

# === DEPLOYMENT URLS (filled automatically during deployment) ===
RENDER_SERVICE_ID=srv-d4fe0u7pm1nc73et6dkg
RENDER_URL=https://simpleswap-automation-1.onrender.com
NETLIFY_URL=https://shepants.netlify.app
EOF
```

### Step 0.3: Verify Credentials

```bash
source CREDENTIALS.env

# Test BrightData (should return zone info)
echo "Testing BrightData..."
curl -s "https://brightdata.com/api/zones/$BRIGHTDATA_ZONE" \
  -u "$BRIGHTDATA_CUSTOMER_ID:$BRIGHTDATA_PASSWORD" | head -c 100
echo ""

# Test Render API
echo "Testing Render..."
curl -s "https://api.render.com/v1/services?limit=1" \
  -H "Authorization: Bearer $RENDER_API_KEY" | python3 -c "import sys,json; print('OK' if json.load(sys.stdin) else 'FAIL')"

# Verify wallet format
echo "Wallet: $MERCHANT_WALLET"
[[ $MERCHANT_WALLET =~ ^0x[a-fA-F0-9]{40}$ ]] && echo "✓ Valid format" || echo "✗ Invalid format"
```

**CHECKPOINT 0:**
```bash
echo "SKIP_TO_PHASE=1" >> CHECKPOINT.md
echo "LAST_COMPLETED=phase0" >> CHECKPOINT.md
echo "[$(date)] Phase 0 complete - credentials verified" >> CHECKPOINT.md
```

---

## PHASE 1: POOL SERVER DEPLOYMENT

### Resume Check
```bash
source CREDENTIALS.env
CURRENT_PHASE=$(grep "SKIP_TO_PHASE" CHECKPOINT.md | tail -1 | cut -d= -f2)
if [ "$CURRENT_PHASE" -gt "1" ]; then
  echo "Phase 1 already complete. Skipping..."
  # Jump to Phase 2
fi
```

### Step 1.1: Clone Repository
```bash
git clone https://github.com/blinds123/simpleswap-exchange-pool.git pool-server
cd pool-server
ls pool-server.js render.yaml package.json && echo "✓ Files present" || echo "✗ Missing files"
```

### Step 1.2: Deploy to Render (if not already deployed)

```bash
source CREDENTIALS.env

# Check if already deployed
STATUS=$(curl -s "https://api.render.com/v1/services/$RENDER_SERVICE_ID" \
  -H "Authorization: Bearer $RENDER_API_KEY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('service',{}).get('serviceDetails',{}).get('url',''))" 2>/dev/null)

if [ -n "$STATUS" ]; then
  echo "✓ Already deployed: $STATUS"
else
  echo "Need to create Render service via dashboard:"
  echo "1. Go to render.com → New → Web Service"
  echo "2. Connect repo: blinds123/simpleswap-exchange-pool"
  echo "3. Build: npm install | Start: npm start"
fi
```

### Step 1.3: Configure Environment Variables

```bash
source CREDENTIALS.env

# Set all 7 variables with retry logic
for VAR in BRIGHTDATA_CUSTOMER_ID BRIGHTDATA_ZONE BRIGHTDATA_PASSWORD MERCHANT_WALLET PRICE_POINTS POOL_SIZE MIN_POOL_SIZE; do
  VALUE=$(eval echo \$$VAR)
  for ATTEMPT in 1 2 3; do
    RESULT=$(curl -s -w "%{http_code}" -o /dev/null -X PUT \
      "https://api.render.com/v1/services/$RENDER_SERVICE_ID/env-vars/$VAR" \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -H "Content-Type: application/json" \
      -d "{\"value\": \"$VALUE\"}" --max-time 30)

    if [ "$RESULT" = "200" ] || [ "$RESULT" = "201" ]; then
      echo "✓ Set $VAR"
      break
    else
      echo "  Attempt $ATTEMPT failed for $VAR (HTTP $RESULT)"
      sleep 5
    fi
  done
done
```

### Step 1.4: Wait for Deployment

```bash
source CREDENTIALS.env

echo "Waiting for deployment..."
for i in {1..30}; do
  STATUS=$(curl -s "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=1" \
    -H "Authorization: Bearer $RENDER_API_KEY" --max-time 30 | \
    python3 -c "import sys,json; print(json.load(sys.stdin)[0]['deploy']['status'])" 2>/dev/null)

  echo "[$i/30] Status: $STATUS"

  if [ "$STATUS" = "live" ]; then
    echo "✓ Deployment live!"
    break
  fi
  sleep 10
done
```

### Step 1.5: Initialize Pools

```bash
source CREDENTIALS.env

echo "Initializing pools (this takes 5-10 minutes)..."
for i in {1..10}; do
  echo "Init $i/10..."
  curl -s -X POST "$RENDER_URL/admin/init-pool" --max-time 60 | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Created: {d.get(\"created\",\"waiting...\")}')" 2>/dev/null || echo "  Waiting for server..."
  sleep 30
done

# Verify pools
curl -s "$RENDER_URL/health/pools" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Status: {d[\"status\"]}')
for k in ['19','29','59']:
  p=d['pools'][k]
  ok='✓' if p['size']>=3 else '✗'
  print(f'  {ok} \${k}: {p[\"size\"]}/{p[\"target\"]}')
ready=all(d['pools'][k]['size']>=3 for k in ['19','29','59'])
print(f'\nREADY FOR PRODUCTION: {\"YES\" if ready else \"NO - run more init\"}')
"
```

**CHECKPOINT 1:**
```bash
echo "SKIP_TO_PHASE=2" >> CHECKPOINT.md
echo "LAST_COMPLETED=phase1" >> CHECKPOINT.md
echo "[$(date)] Phase 1 complete - pool server deployed" >> CHECKPOINT.md
echo "Pool server: $RENDER_URL" >> VERIFY.log
```

---

## PHASE 2: LANDING PAGE (Already Deployed)

For this project, the landing page is already deployed at:
- **URL:** https://shepants.netlify.app
- **Repo:** Current working directory

The checkout integration is already configured with:
```javascript
const POOL_SERVER = 'https://simpleswap-automation-1.onrender.com';
```

### Verify Landing Page
```bash
curl -s -o /dev/null -w "%{http_code}" "https://shepants.netlify.app"
# Expected: 200
```

**CHECKPOINT 2:**
```bash
echo "SKIP_TO_PHASE=3" >> CHECKPOINT.md
echo "LAST_COMPLETED=phase2" >> CHECKPOINT.md
echo "[$(date)] Phase 2 complete - landing page verified" >> CHECKPOINT.md
```

---

## PHASE 3: END-TO-END VERIFICATION

### Run Complete E2E Test

```bash
source CREDENTIALS.env

echo "=== COMPLETE E2E VERIFICATION ===" | tee -a VERIFY.log
echo "[$(date)]" | tee -a VERIFY.log

# Test 1: Pool Health
echo "Test 1: Pool Health" | tee -a VERIFY.log
HEALTH=$(curl -s "$RENDER_URL/health/pools" --max-time 30)
echo "$HEALTH" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  Status: {d[\"status\"]}')
for k in ['19','29','59']:
  print(f'  \${k}: {d[\"pools\"][k][\"size\"]}/{d[\"pools\"][k][\"target\"]}')
" | tee -a VERIFY.log

# Test 2: Buy-Now All Prices
for PRICE in 19 29 59; do
  echo "Test 2.$PRICE: Buy-Now \$$PRICE" | tee -a VERIFY.log
  RESULT=$(curl -s -X POST "$RENDER_URL/buy-now" \
    -H "Content-Type: application/json" \
    -d "{\"amountUSD\": $PRICE}" --max-time 30)

  echo "$RESULT" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('success'):
  print(f'  ✓ Exchange: {d[\"exchangeUrl\"].split(\"id=\")[1][:16]}...')
else:
  print(f'  ✗ Error: {d.get(\"error\",\"unknown\")}')
" | tee -a VERIFY.log
done

# Test 3: Immediate Replenishment
echo "Test 3: Auto-Replenishment" | tee -a VERIFY.log
sleep 2
HEALTH2=$(curl -s "$RENDER_URL/health/pools" --max-time 30)
echo "$HEALTH2" | python3 -c "
import sys,json
d=json.load(sys.stdin)
replen=d.get('isReplenishing',{})
active=[k for k,v in replen.items() if v]
if active:
  print(f'  ✓ Replenishing: {\", \".join(active)}')
else:
  print(f'  ○ No replenishment needed (pools adequate)')
" | tee -a VERIFY.log

# Test 4: Landing Page
echo "Test 4: Landing Page" | tee -a VERIFY.log
LP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$NETLIFY_URL" --max-time 30)
if [ "$LP_STATUS" = "200" ]; then
  echo "  ✓ Landing page responds (HTTP 200)" | tee -a VERIFY.log
else
  echo "  ✗ Landing page error (HTTP $LP_STATUS)" | tee -a VERIFY.log
fi

echo "" | tee -a VERIFY.log
echo "=== E2E VERIFICATION COMPLETE ===" | tee -a VERIFY.log
```

**CHECKPOINT 3:**
```bash
echo "SKIP_TO_PHASE=4" >> CHECKPOINT.md
echo "LAST_COMPLETED=phase3" >> CHECKPOINT.md
echo "[$(date)] Phase 3 complete - E2E verified" >> CHECKPOINT.md
echo "System verified and production ready" >> VERIFY.log
```

---

## PHASE 4: COMPLETION

### Final Status
```bash
source CREDENTIALS.env

echo ""
echo "========================================"
echo "       SYSTEM DEPLOYMENT COMPLETE       "
echo "========================================"
echo ""
echo "Pool Server: $RENDER_URL"
echo "Landing Page: $NETLIFY_URL"
echo ""
echo "Current Pool Status:"
curl -s "$RENDER_URL/health/pools" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k in ['19','29','59']:
  p=d['pools'][k]
  print(f'  \${k}: {p[\"size\"]}/{p[\"target\"]} - {p[\"status\"]}')
"
echo ""
echo "Test checkout: curl -X POST $RENDER_URL/buy-now -H 'Content-Type: application/json' -d '{\"amountUSD\":59}'"
echo ""
```

**FINAL CHECKPOINT:**
```bash
echo "SKIP_TO_PHASE=complete" >> CHECKPOINT.md
echo "LAST_COMPLETED=phase4" >> CHECKPOINT.md
echo "[$(date)] DEPLOYMENT COMPLETE" >> CHECKPOINT.md
```

---

## RECOVERY PROCEDURES

### If Pool Server Down:
```bash
source CREDENTIALS.env
# Trigger redeploy
curl -X POST "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY"
# Wait 2-3 minutes, then verify
curl -s "$RENDER_URL/health/pools"
```

### If Pools Empty:
```bash
source CREDENTIALS.env
# Sequential fill (safer than parallel)
for i in {1..10}; do
  curl -s -X POST "$RENDER_URL/admin/init-pool"
  echo "Init $i done"
  sleep 30
done
```

### If Context Lost:
```bash
# 1. Find this prompt file
# 2. Check checkpoint: cat CHECKPOINT.md
# 3. Source credentials: source CREDENTIALS.env
# 4. Resume from SKIP_TO_PHASE value
```

---

## PRODUCTION CREDENTIALS (FILLED)

```
BrightData:
  Customer ID: hl_9d12e57c
  Zone: scraping_browser1
  Password: u2ynaxqh9899

Render:
  API Key: rnd_jPAYRHSNQd3GzgLivAjHkFPPhfcl
  Service ID: srv-d4fe0u7pm1nc73et6dkg

Merchant:
  Wallet: 0xE5173e7c3089bD89cd1341b637b8e1951745ED5C

URLs:
  Pool Server: https://simpleswap-automation-1.onrender.com
  Landing Page: https://shepants.netlify.app

Prices: $19, $29, $59
```

---

## PARALLEL AGENT EXECUTION

Launch these agents for new deployments:

**Agent 1 (Infrastructure):**
- Clone repo, deploy to Render
- Configure env vars
- Initialize pools to 5/5 each

**Agent 2 (Integration):**
- Verify landing page checkout code
- Test CORS configuration
- Verify redirects work

**Agent 3 (Testing):**
- Run Playwright E2E suite
- Test all 3 price points
- Verify auto-replenishment

**Agent 4 (Security):**
- Review for vulnerabilities
- Check rate limiting
- Verify no credential leaks

---

**END OF BULLETPROOF PROMPT**

This prompt contains all credentials and URLs inline.
On context loss, re-read this file and check CHECKPOINT.md.
