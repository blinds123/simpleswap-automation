import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import { writeFile, rename, unlink } from 'fs/promises';
import path from 'path';
import lockfile from 'proper-lockfile';
import { randomBytes } from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const MERCHANT_WALLET = process.env.MERCHANT_WALLET || "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const POOL_SIZE = parseInt(process.env.POOL_SIZE) || 10;
const MIN_POOL_SIZE_DEFAULT = parseInt(process.env.MIN_POOL_SIZE) || 3;
const PRODUCT_PRICE_USD = parseInt(process.env.PRODUCT_PRICE_USD) || 25;

// Parse price points from environment variable (default: 19,29,59)
const PRICE_POINTS = (process.env.PRICE_POINTS || '19,29,59')
    .split(',')
    .map(p => parseInt(p.trim()))
    .filter(p => !isNaN(p) && p > 0);

console.log(`[CONFIG] Price points configured: ${PRICE_POINTS.join(', ')}`);

// Persistent storage file
const POOL_FILE = path.join(process.cwd(), 'exchange-pool.json');

// Dynamic pool configuration based on PRICE_POINTS
const POOL_CONFIG = {};
PRICE_POINTS.forEach((price, index) => {
  const descriptions = ['Pre-order only', 'Pre-order + Order Bump', 'Ship Today'];
  POOL_CONFIG[String(price)] = {
    size: POOL_SIZE, // Use configured POOL_SIZE (default: 10)
    minSize: MIN_POOL_SIZE_DEFAULT,
    amount: price,
    description: descriptions[index] || `$${price} pool`
  };
});

// BrightData credentials
const BRIGHTDATA_CUSTOMER_ID = process.env.BRIGHTDATA_CUSTOMER_ID;
const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE;
const BRIGHTDATA_PASSWORD = process.env.BRIGHTDATA_PASSWORD;

if (!BRIGHTDATA_CUSTOMER_ID || !BRIGHTDATA_ZONE || !BRIGHTDATA_PASSWORD) {
    console.warn('⚠️  Missing BrightData credentials - on-demand creation will not work');
}

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

// CORS - allow configured origins with explicit preflight handling
// Default includes common Netlify production sites + localhost for development
const DEFAULT_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5500',
    'https://reilly-dress.netlify.app',
    'https://beigesneaker.netlify.app',
    'https://auralo-sneakers.netlify.app'
].join(',');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS)
    .split(',')
    .map(o => o.trim());

console.log(`[CONFIG] Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);

// Explicit CORS middleware that handles preflight properly
app.use((req, res, next) => {
    const origin = req.headers.origin;

    // Check if origin is allowed (or allow all if wildcard)
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
    }

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    next();
});

app.use(express.json());

// Lazy-load Playwright only when needed
let chromium = null;
async function getChromium() {
    if (!chromium) {
        const playwright = await import('playwright');
        chromium = playwright.chromium;
    }
    return chromium;
}

/**
 * Creates a SimpleSwap exchange on-demand (no pool)
 * Uses BrightData Scraping Browser with quote verification
 */
async function createExchange(amountUSD = PRODUCT_PRICE_USD, walletAddress = MERCHANT_WALLET) {
    console.log(`[CREATE-EXCHANGE] Creating exchange for $${amountUSD}...`);

    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${amountUSD}`;

    let browser;
    try {
        const chromiumInstance = await getChromium();

        console.log(`[${new Date().toISOString()}] Connecting to BrightData CDP...`);
        browser = await chromiumInstance.connectOverCDP(CDP_ENDPOINT);
        
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();

        // OPTIMIZATION: Block heavy resources for Render 0.5 CPU
        await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,css,woff,woff2}', route => route.abort());
        
        // Set a robust timeout for navigation (120s for Render Starter CPU)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
        console.log(`[${new Date().toISOString()}] Page loaded`);

        // 1. Hydration & Nuke
        // Removed fixed wait - rely on selector timeout
        await page.evaluate(() => {
            document.querySelectorAll('[data-testid="info-message"], [role="alert"], .cookies-banner').forEach(el => el.remove());
        });

        // 2. Fill Wallet using accessibility locator
        console.log(`[${new Date().toISOString()}] Filling wallet using getByRole...`);
        const addressInput = page.getByRole('textbox', { name: /address/i });
        // Increase timeout for first selector (cold start protection)
        await addressInput.first().fill(walletAddress, { timeout: 30000 });
        console.log(`[${new Date().toISOString()}] ✓ Address filled using accessibility locator`);
        
        await page.waitForTimeout(2000); // Small delay for React state update
        await addressInput.first().press('Enter');

        // 3. CRITICAL: Wait for Quote (The "You get" amount)
        // This ensures the backend has validated the pair and calculated the rate
        console.log(`[${new Date().toISOString()}] Waiting for quote calculation...`);
        try {
            // Look for the second input (You Get) and wait for it to have a value
            await page.waitForFunction(() => {
                const inputs = document.querySelectorAll('input[type="text"]');
                if (inputs.length < 2) return false;
                const val = inputs[1].value; // The "You Get" input
                return val && val.length > 0 && val !== '0' && !val.includes('...');
            }, { timeout: 30000 }); // Increased from 15s
            console.log(`[${new Date().toISOString()}] Quote received!`);
        } catch (e) {
            console.log(`[${new Date().toISOString()}] ⚠️ Warning: Quote timeout (might still work)`);
        }

        // 4. Wait for button to be enabled, then click
        console.log(`[${new Date().toISOString()}] Waiting for button to be enabled...`);
        const createButton = page.getByRole('button', { name: /^create.*exchange$/i });

        // CRITICAL: Wait for React validation to enable the button
        await page.waitForFunction(
            () => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const createBtn = buttons.find(b => /^create.*exchange$/i.test(b.textContent?.trim() || ''));
                return createBtn && !createBtn.disabled;
            },
            { timeout: 40000 } // Increased timeout for Render CPU
        );

        const isDisabled = await createButton.first().isDisabled();
        console.log(`[${new Date().toISOString()}] Button disabled: ${isDisabled}`);

        if (!isDisabled) {
            await createButton.first().click({ timeout: 10000 });
            console.log(`[${new Date().toISOString()}] ✓ Button clicked using accessibility locator`);
            
            // DOUBLE CLICK STRATEGY: Wait and click again if not redirected
            // This handles cases where the first click just focuses or clears an overlay
            await page.waitForTimeout(2000);
            if (page.url().includes('/exchange?')) {
                 console.log(`[${new Date().toISOString()}] Still on page, clicking create again...`);
                 await createButton.first().click({ force: true });
            }

        } else {
            throw new Error('Button still disabled after waiting for enablement');
        }
        
        console.log(`[${new Date().toISOString()}] Clicked create, waiting for redirect...`);
        await page.waitForURL(/\/exchange\?id=/, { timeout: 120000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) throw new Error('No exchange ID in URL');

        console.log(`[CREATE-EXCHANGE] ✓ Created: ${exchangeId} for $${amountUSD}`);

        return {
            id: exchangeId,
            exchangeId,
            exchangeUrl,
            amount: amountUSD,
            created: new Date().toISOString()
        };

    } catch (error) {
        console.error(`[${new Date().toISOString()}] ✗ Failed:`, error.message);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

// Exchange pool with persistence
let exchangePool = [];
let isReplenishing = false;

// Replenishment locks - prevents concurrent replenishment of same pool (dynamic)
const replenishmentLocks = {};
PRICE_POINTS.forEach(price => {
  replenishmentLocks[String(price)] = false;
});

// Create empty pool structure based on PRICE_POINTS
function createEmptyPools() {
    const pools = {};
    PRICE_POINTS.forEach(price => {
        pools[String(price)] = [];
    });
    return pools;
}

// Load pool from file on startup
async function loadPool() {
    try {
        if (fs.existsSync(POOL_FILE)) {
            const data = fs.readFileSync(POOL_FILE, 'utf8');
            const pools = JSON.parse(data);

            // Validate structure - ensure all configured pools exist
            PRICE_POINTS.forEach(price => {
                if (!pools[String(price)]) pools[String(price)] = [];
            });

            return pools;
        } else {
            console.log('[LOAD-POOL] No existing pool file, returning empty structure');
            return createEmptyPools();
        }
    } catch (error) {
        console.error('[LOAD-POOL] Failed to load pool:', error.message);
        return createEmptyPools();
    }
}

// Save pool to file with atomic writes
async function savePool(pools) {
    // Validate structure before saving - ensure all configured pools exist
    PRICE_POINTS.forEach(price => {
        if (!pools[String(price)]) pools[String(price)] = [];
    });

    // Write to temporary file first
    const tempFile = `${POOL_FILE}.${randomBytes(8).toString('hex')}.tmp`;

    try {
        await writeFile(tempFile, JSON.stringify(pools, null, 2), 'utf8');

        // Atomic rename (if process crashes after this, file is safe)
        await rename(tempFile, POOL_FILE);

        const poolSizes = {};
        PRICE_POINTS.forEach(price => {
            poolSizes[String(price)] = pools[String(price)].length;
        });
        console.log('[SAVE-POOL] Pool saved:', poolSizes);
    } catch (error) {
        // Clean up temp file if it exists
        try {
            await unlink(tempFile);
        } catch (unlinkError) {
            // Ignore unlink errors
        }
        throw error;
    }
}

// Normalize amount to pool key (dynamic based on PRICE_POINTS)
function normalizeAmount(amountUSD) {
    const amount = parseInt(amountUSD);

    // Check if amount matches any configured price point
    if (PRICE_POINTS.includes(amount)) {
        return String(amount);
    }

    // Reject invalid amounts
    throw new Error(`Invalid amount: $${amount}. Expected: ${PRICE_POINTS.join(', ')}`);
}

// Circuit breaker to prevent cost drain
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;

function resetCircuitBreaker() {
    consecutiveFailures = 0;
}

function checkCircuitBreaker() {
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new Error(`Circuit breaker triggered: ${consecutiveFailures} consecutive failures. Stopping to prevent BrightData cost drain.`);
    }
}

// Retry helper with exponential backoff - REDUCED to 1 retry to save costs
async function retryWithBackoff(fn, maxRetries = 1, delayMs = 5000, context = '') {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            checkCircuitBreaker();
            const result = await fn();
            resetCircuitBreaker(); // Success resets the breaker
            return result;
        } catch (error) {
            consecutiveFailures++;
            console.error(`[RETRY] ${context} - Attempt ${attempt}/${maxRetries} failed:`, error.message);
            console.error(`[RETRY] Consecutive failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}`);

            if (attempt === maxRetries) {
                console.error(`[RETRY] ${context} - All ${maxRetries} attempts exhausted`);
                throw error;
            }

            console.log(`[RETRY] ${context} - Waiting ${delayMs}ms before retry ${attempt + 1}...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

// Sequential execution helper - max 2 concurrent to save BrightData costs
async function executeWithConcurrencyLimit(tasks, limit = 2) {
    const results = [];
    const executing = [];

    for (const task of tasks) {
        const p = Promise.resolve().then(() => task()).then(
            result => ({ status: 'fulfilled', value: result }),
            error => ({ status: 'rejected', reason: error })
        );
        results.push(p);
        executing.push(p);

        if (executing.length >= limit) {
            await Promise.race(executing);
            // Remove completed promises
            for (let i = executing.length - 1; i >= 0; i--) {
                const status = await Promise.race([executing[i], Promise.resolve('pending')]);
                if (status !== 'pending') {
                    executing.splice(i, 1);
                }
            }
        }
    }

    return Promise.all(results);
}

// Helper to get pool sizes dynamically
function getPoolSizes(pools) {
    const sizes = {};
    let total = 0;
    PRICE_POINTS.forEach(price => {
        const key = String(price);
        const size = pools[key]?.length || 0;
        sizes[key] = size;
        total += size;
    });
    return { sizes, total };
}

// Root endpoint
app.get('/', async (req, res) => {
    const pools = await loadPool();
    const { sizes, total } = getPoolSizes(pools);

    res.json({
        service: 'SimpleSwap Dynamic Pool Server [PRODUCTION]',
        status: 'running',
        version: '14.0.0', // COST-SAVING: Max 2 concurrent, 1 retry, circuit breaker
        mode: 'dynamic-pool',
        configuredPrices: PRICE_POINTS,
        pools: sizes,
        totalSize: total,
        totalMaxSize: PRICE_POINTS.length * POOL_SIZE,
        note: total > 0
            ? `Pool system ready - instant delivery for $${PRICE_POINTS.join(', $')}`
            : 'Use POST /admin/init-pool to initialize pools'
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        mode: 'triple-pool',
        timestamp: new Date().toISOString()
    });
});

// Pool health check endpoint
app.get('/health/pools', async (req, res) => {
    try {
        const pools = await loadPool();
        const health = {};
        let overallStatus = 'healthy';

        for (const [key, config] of Object.entries(POOL_CONFIG)) {
            const poolSize = pools[key]?.length || 0;
            const status = poolSize >= config.minSize ? 'healthy' : poolSize > 0 ? 'low' : 'empty';

            if (status !== 'healthy') {
                overallStatus = 'degraded';
            }

            health[key] = {
                status,
                size: poolSize,
                target: config.size,
                minSize: config.minSize,
                description: config.description
            };
        }

        res.json({
            status: overallStatus,
            pools: health,
            isReplenishing: Object.fromEntries(
                Object.keys(POOL_CONFIG).map(key => [key, replenishmentLocks[key] || false])
            ),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Replenishment function with concurrency control
async function replenishPool(poolKey) {
    // Check if already replenishing this pool
    if (replenishmentLocks[poolKey]) {
        console.log(`[REPLENISH] Pool ${poolKey} already replenishing, skipping`);
        return;
    }

    // Acquire replenishment lock
    replenishmentLocks[poolKey] = true;
    console.log(`[REPLENISH] Starting replenishment for pool ${poolKey}`);

    try {
        const pools = await loadPool();
        const targetPool = pools[poolKey];
        const config = POOL_CONFIG[poolKey];

        if (!targetPool) {
            console.error(`[REPLENISH] Pool ${poolKey} does not exist!`);
            return;
        }

        // Re-check pool size (might have been replenished by another process)
        const needed = config.size - targetPool.length;
        if (needed <= 0) {
            console.log(`[REPLENISH] Pool ${poolKey} already full (${targetPool.length}/${config.size}), aborting`);
            return;
        }

        console.log(`[REPLENISH] Creating ${needed} exchanges for pool ${poolKey} SEQUENTIALLY (max 2 concurrent, 1 retry) to save BrightData costs`);

        // Create exchanges with LIMITED CONCURRENCY (max 2 at a time) to save costs
        const tasks = [];
        for (let i = 0; i < needed; i++) {
            tasks.push(async () => {
                try {
                    const exchange = await retryWithBackoff(
                        () => createExchange(config.amount),
                        1, // maxRetries - REDUCED from 3 to save costs
                        5000, // 5 second delay
                        `Pool ${poolKey} exchange ${i+1}/${needed}`
                    );
                    exchange.amount = config.amount;
                    console.log(`[REPLENISH] Pool ${poolKey}: Successfully created exchange ${i+1}/${needed}`);
                    return exchange;
                } catch (error) {
                    console.error(`[REPLENISH] Failed exchange ${i+1}/${needed} for pool ${poolKey}:`, error.message);
                    return null; // Return null for failed exchanges
                }
            });
        }

        // Execute with max 2 concurrent - prevents cost drain
        const results = await executeWithConcurrencyLimit(tasks, 2);
        const validExchanges = results
            .filter(r => r.status === 'fulfilled' && r.value !== null)
            .map(r => r.value);

        console.log(`[REPLENISH] Created ${validExchanges.length}/${needed} exchanges successfully`);

        // Acquire file lock for atomic save
        let release;
        try {
            release = await lockfile.lock(POOL_FILE, {
                retries: { retries: 5, minTimeout: 200, maxTimeout: 1000 }
            });

            // Re-load pool to get latest state
            const freshPools = await loadPool();
            freshPools[poolKey].push(...validExchanges);

            await savePool(freshPools);
            await release();

            console.log(`[REPLENISH] Pool ${poolKey} now has ${freshPools[poolKey].length}/${config.size} exchanges`);

        } catch (lockError) {
            if (release) await release();
            console.error(`[REPLENISH] Failed to acquire lock for saving:`, lockError);
            // Exchanges are lost, but pool will replenish on next request
        }

    } catch (error) {
        console.error(`[REPLENISH] Replenishment failed for pool ${poolKey}:`, error);
    } finally {
        // Always release replenishment lock
        replenishmentLocks[poolKey] = false;
        console.log(`[REPLENISH] Replenishment lock released for pool ${poolKey}`);
    }
}

// Buy now endpoint - uses pool if available, otherwise on-demand
app.post('/buy-now', async (req, res) => {
    try {
        const { amountUSD } = req.body;

        // Validate input
        if (!amountUSD) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: amountUSD'
            });
        }

        const amount = parseInt(amountUSD);
        if (isNaN(amount) || !PRICE_POINTS.includes(amount)) {
            return res.status(400).json({
                success: false,
                error: `Invalid amount: $${amountUSD}. Expected: ${PRICE_POINTS.join(', ')}`
            });
        }

        console.log(`[BUY-NOW] Request received for amount: $${amountUSD}`);

        // Normalize amount to pool key
        const poolKey = normalizeAmount(amountUSD);
        console.log(`[BUY-NOW] Normalized to pool key: ${poolKey}`);

        // CRITICAL: Acquire file lock for atomic read-modify-write
        let release;
        let lockReleased = false; // Track if lock has been released
        try {
            release = await lockfile.lock(POOL_FILE, {
                retries: { retries: 10, minTimeout: 100, maxTimeout: 1000 }
            });
        } catch (lockError) {
            console.error(`[BUY-NOW] Failed to acquire lock:`, lockError);
            // Fallback to on-demand if lock fails
            const exchange = await createExchange(parseInt(poolKey));
            return res.json({
                success: true,
                exchangeUrl: exchange.exchangeUrl,
                poolStatus: 'on-demand-lock-failed'
            });
        }

        try {
            const pools = await loadPool();
            const targetPool = pools[poolKey];

            if (!targetPool || targetPool.length === 0) {
                console.log(`[BUY-NOW] Pool ${poolKey} empty, creating on-demand`);
                await release(); // Release lock before slow operation
                lockReleased = true;
                const exchange = await createExchange(parseInt(poolKey));

                // Trigger replenishment in background with enhanced retry
                setImmediate(async () => {
                    try {
                        await replenishPool(poolKey);
                        console.log(`[BUY-NOW] ✓ Background replenishment completed successfully for pool ${poolKey}`);
                    } catch (err) {
                        console.error(`[BUY-NOW] ✗ Background replenishment FAILED for pool ${poolKey}:`, err.message);

                        // CRITICAL: Schedule a retry after 30 seconds if replenishment fails
                        console.log(`[BUY-NOW] Scheduling retry replenishment in 30 seconds for pool ${poolKey}...`);
                        setTimeout(async () => {
                            try {
                                console.log(`[BUY-NOW] Retrying replenishment for pool ${poolKey}...`);
                                await replenishPool(poolKey);
                                console.log(`[BUY-NOW] ✓ Retry replenishment succeeded for pool ${poolKey}`);
                            } catch (retryErr) {
                                console.error(`[BUY-NOW] ✗ Retry replenishment also failed for pool ${poolKey}:`, retryErr.message);
                            }
                        }, 30000);
                    }
                });

                return res.json({
                    success: true,
                    exchangeUrl: exchange.exchangeUrl,
                    poolStatus: 'on-demand'
                });
            }

            // Get exchange from specific pool
            const exchange = targetPool.shift();
            console.log(`[BUY-NOW] Delivered exchange from pool ${poolKey}: ${exchange.exchangeId || exchange.id}`);
            console.log(`[BUY-NOW] Remaining in pool ${poolKey}: ${targetPool.length}`);

            await savePool(pools);
            await release(); // Release lock ASAP
            lockReleased = true;

            // Trigger replenishment IMMEDIATELY after any exchange is used
            if (targetPool.length < POOL_CONFIG[poolKey].size) {
                console.log(`[BUY-NOW] Pool ${poolKey} not full (${targetPool.length}/${POOL_CONFIG[poolKey].size}), triggering immediate replenishment`);

                // Fire and forget, but with enhanced retry and logging
                setImmediate(async () => {
                    try {
                        await replenishPool(poolKey);
                        console.log(`[BUY-NOW] ✓ Background replenishment completed successfully for pool ${poolKey}`);
                    } catch (err) {
                        console.error(`[BUY-NOW] ✗ Background replenishment FAILED for pool ${poolKey}:`, err.message);

                        // CRITICAL: Schedule a retry after 30 seconds if replenishment fails
                        console.log(`[BUY-NOW] Scheduling retry replenishment in 30 seconds for pool ${poolKey}...`);
                        setTimeout(async () => {
                            try {
                                console.log(`[BUY-NOW] Retrying replenishment for pool ${poolKey}...`);
                                await replenishPool(poolKey);
                                console.log(`[BUY-NOW] ✓ Retry replenishment succeeded for pool ${poolKey}`);
                            } catch (retryErr) {
                                console.error(`[BUY-NOW] ✗ Retry replenishment also failed for pool ${poolKey}:`, retryErr.message);
                            }
                        }, 30000);
                    }
                });
            }

            res.json({
                success: true,
                exchangeUrl: exchange.exchangeUrl,
                poolStatus: 'instant'
            });

        } catch (error) {
            // Only release if not already released
            if (!lockReleased && release) {
                try {
                    await release();
                } catch (releaseError) {
                    console.error(`[BUY-NOW] Error releasing lock:`, releaseError.message);
                }
            }
            throw error;
        }

    } catch (error) {
        console.error('[BUY-NOW] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Stats endpoint
app.get('/stats', async (req, res) => {
    const pools = await loadPool();

    const poolsData = {};
    let totalSize = 0;
    let totalMaxSize = 0;
    Object.entries(POOL_CONFIG).forEach(([key, config]) => {
        poolsData[key] = {
            description: config.description,
            size: pools[key] ? pools[key].length : 0,
            maxSize: config.size,
            minSize: config.minSize,
            exchanges: pools[key] || []
        };
        totalSize += pools[key]?.length || 0;
        totalMaxSize += config.size;
    });
    res.json({
        pools: poolsData,
        totalSize,
        totalMaxSize
    });
});

// Admin endpoint - directly seed pool with pre-created exchanges (legacy)
app.post('/admin/seed-pool', (req, res) => {
    try {
        const { exchanges } = req.body;
        if (!exchanges || !Array.isArray(exchanges)) {
            return res.status(400).json({ success: false, error: 'exchanges array required' });
        }
        exchangePool.push(...exchanges);
        savePool();
        console.log(`✓ Seeded ${exchanges.length} exchanges (total: ${exchangePool.length})`);
        res.json({ success: true, poolSize: exchangePool.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin endpoint - add existing exchanges back to pools
// Accepts: { exchanges: [{ url: "https://simpleswap.io/exchange?id=xxx", amount: 19 }, ...] }
app.post('/admin/add-exchanges', async (req, res) => {
    try {
        const { exchanges } = req.body;
        if (!exchanges || !Array.isArray(exchanges)) {
            return res.status(400).json({
                success: false,
                error: 'exchanges array required. Format: [{ url: "https://...", amount: 19 }, ...]'
            });
        }

        console.log(`[ADD-EXCHANGES] Adding ${exchanges.length} existing exchanges to pools...`);

        const pools = await loadPool();
        const added = { '19': 0, '29': 0, '59': 0 };
        const errors = [];

        for (const ex of exchanges) {
            const { url, amount } = ex;

            // Validate
            if (!url || !amount) {
                errors.push(`Missing url or amount: ${JSON.stringify(ex)}`);
                continue;
            }

            const poolKey = String(amount);
            if (!POOL_CONFIG[poolKey]) {
                errors.push(`Invalid amount ${amount}. Expected: ${PRICE_POINTS.join(', ')}`);
                continue;
            }

            // Extract exchange ID from URL
            const match = url.match(/[?&]id=([a-zA-Z0-9]+)/);
            const exchangeId = match ? match[1] : null;

            if (!exchangeId) {
                errors.push(`Could not extract exchange ID from URL: ${url}`);
                continue;
            }

            // Check if already in pool (avoid duplicates)
            const existsInPool = pools[poolKey].some(e =>
                e.exchangeId === exchangeId || e.id === exchangeId || e.exchangeUrl === url
            );

            if (existsInPool) {
                errors.push(`Exchange ${exchangeId} already exists in pool ${poolKey}`);
                continue;
            }

            // Add to pool
            pools[poolKey].push({
                id: exchangeId,
                exchangeId: exchangeId,
                exchangeUrl: url,
                amount: parseInt(amount),
                created: new Date().toISOString(),
                addedManually: true
            });
            added[poolKey]++;
            console.log(`[ADD-EXCHANGES] Added ${exchangeId} to pool ${poolKey}`);
        }

        await savePool(pools);

        const totalAdded = Object.values(added).reduce((a, b) => a + b, 0);
        console.log(`[ADD-EXCHANGES] Complete: added ${totalAdded}, errors: ${errors.length}`);

        const poolSizes = {};
        PRICE_POINTS.forEach(p => {
            poolSizes[String(p)] = pools[String(p)].length;
        });

        res.json({
            success: true,
            added,
            totalAdded,
            errors: errors.length > 0 ? errors : undefined,
            pools: poolSizes
        });

    } catch (error) {
        console.error('[ADD-EXCHANGES] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin endpoint - manual pool initialization (ADDITIVE - preserves existing exchanges)
app.post('/admin/init-pool', async (req, res) => {
    try {
        // Check if any pool is already replenishing
        const alreadyReplenishing = Object.values(replenishmentLocks).some(lock => lock);
        if (alreadyReplenishing) {
            return res.json({
                success: false,
                error: 'One or more pools are already initializing'
            });
        }

        console.log('[INIT-POOL] Starting ADDITIVE pool initialization...');

        // CRITICAL: Load existing pools first (don't wipe them!)
        const pools = await loadPool();

        // Calculate how many exchanges each pool needs
        const needed = {};
        let totalNeeded = 0;
        for (const [poolKey, config] of Object.entries(POOL_CONFIG)) {
            const currentSize = pools[poolKey]?.length || 0;
            const gap = config.size - currentSize;
            needed[poolKey] = Math.max(0, gap);
            totalNeeded += needed[poolKey];
            console.log(`[INIT-POOL] Pool ${poolKey}: ${currentSize}/${config.size} (need ${needed[poolKey]} more)`);
        }

        if (totalNeeded === 0) {
            console.log('[INIT-POOL] All pools are already full!');
            const poolSizes = {};
            Object.keys(POOL_CONFIG).forEach(key => {
                poolSizes[key] = pools[key]?.length || 0;
            });
            return res.json({
                success: true,
                pools: poolSizes,
                totalCreated: 0,
                totalFailed: 0,
                message: 'All pools are already at target size'
            });
        }

        console.log(`[INIT-POOL] Creating ${totalNeeded} exchanges with LIMITED CONCURRENCY (max 2) to save BrightData costs...`);

        // Reset circuit breaker at start of manual init
        resetCircuitBreaker();

        // Build task list for concurrency-limited execution
        const allTasks = [];
        for (const [poolKey, config] of Object.entries(POOL_CONFIG)) {
            const needCount = needed[poolKey];
            for (let i = 0; i < needCount; i++) {
                allTasks.push(async () => {
                    try {
                        checkCircuitBreaker(); // Stop if too many failures
                        const exchange = await createExchange(config.amount);
                        exchange.amount = config.amount;
                        pools[poolKey].push(exchange);
                        console.log(`[INIT-POOL] Pool ${poolKey}: exchange ${i+1}/${needCount} created`);
                        resetCircuitBreaker(); // Success resets breaker
                        return { poolKey, success: true };
                    } catch (error) {
                        consecutiveFailures++;
                        console.error(`[INIT-POOL] Pool ${poolKey}: failed to create exchange (failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error.message);
                        return { poolKey, success: false, error: error.message };
                    }
                });
            }
        }

        // Execute with max 2 concurrent - PREVENTS COST DRAIN
        const rawResults = await executeWithConcurrencyLimit(allTasks, 2);
        const results = rawResults.map(r => r.status === 'fulfilled' ? r.value : { success: false });

        // Count successes and failures
        const successes = results.filter(r => r && r.success).length;
        const failures = results.filter(r => !r || !r.success).length;

        console.log(`[INIT-POOL] Creation complete: ${successes} succeeded, ${failures} failed`);

        if (successes === 0) {
            return res.status(500).json({
                success: false,
                error: 'Pool initialization failed - no exchanges were created'
            });
        }

        await savePool(pools);

        console.log('[INIT-POOL] ADDITIVE pool initialization complete!');
        const poolSizes = {};
        let totalSize = 0;
        Object.keys(POOL_CONFIG).forEach(key => {
            poolSizes[key] = pools[key].length;
            totalSize += pools[key].length;
        });
        console.log('[INIT-POOL] Final pool sizes:', { ...poolSizes, total: totalSize });

        res.json({
            success: true,
            pools: poolSizes,
            totalCreated: successes,
            totalFailed: failures,
            message: `Pools updated: added ${successes} exchanges (${failures} failed)`
        });
    } catch (error) {
        console.error('[INIT-POOL] Manual init failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, async () => {
    console.log(`\n🚀 SimpleSwap Triple-Pool Server v13.0.0 [ENHANCED AUTO-REPLENISHMENT]`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Mode: TRIPLE-POOL SYSTEM with 3-RETRY MECHANISM`);
    console.log(`   Storage: ${POOL_FILE}`);
    console.log(`   Frontend: ${process.env.FRONTEND_URL || 'https://beigesneaker.netlify.app'}`);
    console.log(`   Pool Target: ${POOL_SIZE} exchanges per pool`);

    try {
        const pools = await loadPool();
        console.log(`\n📊 Pool Status:`);

        // Dynamic pool status display
        PRICE_POINTS.forEach(price => {
            const key = String(price);
            const current = pools[key]?.length || 0;
            const target = POOL_CONFIG[key].size;
            const desc = POOL_CONFIG[key].description;
            console.log(`   $${price} Pool: ${current}/${target} (${desc})`);
        });

        const totalSize = Object.values(pools).reduce((sum, pool) => sum + pool.length, 0);
        const totalTarget = PRICE_POINTS.length * POOL_SIZE;
        console.log(`   Total: ${totalSize}/${totalTarget} exchanges`);

        console.log(`\n✅ Server ready!`);
        if (totalSize > 0) {
            console.log(`   Triple-pool system active - instant delivery enabled`);
            console.log(`   Auto-replenishment: ACTIVE (3 retries + 30s fallback)`);
        } else {
            console.log(`   Use POST /admin/init-pool to initialize pools`);
        }
    } catch (error) {
        console.log(`\n⚠️  Could not load pool status`);
    }
    console.log('');
});

process.on('SIGTERM', () => {
    console.log('\n⏹ Shutting down...');
    process.exit(0);
});
