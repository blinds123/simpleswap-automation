import express from 'express';
import cors from 'cors';
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
const MIN_POOL_SIZE = parseInt(process.env.MIN_POOL_SIZE) || 5;
const PRODUCT_PRICE_USD = parseInt(process.env.PRODUCT_PRICE_USD) || 25;

// Persistent storage file
const POOL_FILE = path.join(process.cwd(), 'exchange-pool.json');

// Triple-pool configuration
const POOL_CONFIG = {
  '29': {
    size: 5,
    minSize: 3,
    amount: 29,
    description: 'Preorder (no order bump)'
  },
  '39': {
    size: 5,
    minSize: 3,
    amount: 39,
    description: 'Preorder + Order Bump ($29 + $10)'
  },
  '69': {
    size: 5,
    minSize: 3,
    amount: 69,
    description: 'Regular (covers $69 and $79)'
  }
};

// BrightData credentials
const BRIGHTDATA_CUSTOMER_ID = process.env.BRIGHTDATA_CUSTOMER_ID;
const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE;
const BRIGHTDATA_PASSWORD = process.env.BRIGHTDATA_PASSWORD;

if (!BRIGHTDATA_CUSTOMER_ID || !BRIGHTDATA_ZONE || !BRIGHTDATA_PASSWORD) {
    console.warn('⚠️  Missing BrightData credentials - on-demand creation will not work');
}

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'https://beigesneaker.netlify.app',
    credentials: true
}));
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
 */
async function createExchange(amountUSD = PRODUCT_PRICE_USD, walletAddress = MERCHANT_WALLET) {
    console.log(`[CREATE-EXCHANGE] Creating exchange for $${amountUSD}...`);

    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${amountUSD}`;

    let browser;
    try {
        // Lazy-load Playwright
        const chromiumInstance = await getChromium();
        browser = await chromiumInstance.connectOverCDP(CDP_ENDPOINT);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        console.log(`[${new Date().toISOString()}] Connected to BrightData`);

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);

        // Dismiss any alert/warning messages that might block interaction
        try {
            const alertSelector = '[data-testid="info-message"]';
            const alertExists = await page.$(alertSelector);
            if (alertExists) {
                // Try to find and click close button
                const closeButton = await page.$(`${alertSelector} button`);
                if (closeButton) {
                    await closeButton.click();
                    await page.waitForTimeout(500);
                }
            }
        } catch (e) {
            // Alert dismiss failed, continue anyway
            console.log(`[${new Date().toISOString()}] Note: Could not dismiss alert (${e.message})`);
        }

        // Wait for page to load and hide blocking overlays
        await page.waitForTimeout(3000);
        await page.evaluate(() => {
            document.querySelectorAll('[data-testid="info-message"], [role="alert"]')
                .forEach(el => el.style.display = 'none');
        });

        // Use type() with delay to simulate human typing for React validation
        const addressInput = page.locator('input[placeholder*="address" i]').first();
        await addressInput.click({ force: true }); // Focus with force
        await addressInput.type(walletAddress, { delay: 50 }); // Type char-by-char
        console.log(`[${new Date().toISOString()}] Wallet typed`);

        await page.waitForTimeout(3000); // React validation

        // Click create button
        const createButton = page.locator('button[data-testid="create-exchange-button"]').first();
        await createButton.click({ force: true, timeout: 10000 });
        await page.waitForURL(/\/exchange\?id=/, { timeout: 45000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) {
            throw new Error('No exchange ID in URL');
        }

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
        if (browser) {
            await browser.close();
        }
    }
}

// Exchange pool with persistence
let exchangePool = [];
let isReplenishing = false;

// Replenishment locks - prevents concurrent replenishment of same pool
const replenishmentLocks = {
  '29': false,
  '39': false,
  '69': false
};

// Load pool from file on startup
async function loadPool() {
    try {
        if (fs.existsSync(POOL_FILE)) {
            const data = fs.readFileSync(POOL_FILE, 'utf8');
            const pools = JSON.parse(data);

            // Validate structure - ensure all three pools exist
            if (!pools['29']) pools['29'] = [];
            if (!pools['39']) pools['39'] = [];
            if (!pools['69']) pools['69'] = [];

            return pools;
        } else {
            console.log('[LOAD-POOL] No existing pool file, returning empty structure');
            return { '29': [], '39': [], '69': [] };
        }
    } catch (error) {
        console.error('[LOAD-POOL] Failed to load pool:', error.message);
        return { '29': [], '39': [], '69': [] };
    }
}

// Save pool to file with atomic writes
async function savePool(pools) {
    // Validate structure before saving
    if (!pools['29']) pools['29'] = [];
    if (!pools['39']) pools['39'] = [];
    if (!pools['69']) pools['69'] = [];

    // Write to temporary file first
    const tempFile = `${POOL_FILE}.${randomBytes(8).toString('hex')}.tmp`;

    try {
        await writeFile(tempFile, JSON.stringify(pools, null, 2), 'utf8');

        // Atomic rename (if process crashes after this, file is safe)
        await rename(tempFile, POOL_FILE);

        console.log('[SAVE-POOL] Pool saved:', {
            '29': pools['29'].length,
            '39': pools['39'].length,
            '69': pools['69'].length
        });
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

// Normalize amount to pool key
function normalizeAmount(amountUSD) {
    const amount = parseInt(amountUSD);

    // Exact matching for known amounts
    if (amount === 29) return '29';
    if (amount === 39) return '39';
    if (amount === 69 || amount === 79) return '69';

    // Reject invalid amounts
    throw new Error(`Invalid amount: $${amount}. Expected: 29, 39, 69, or 79`);
}

// Root endpoint
app.get('/', async (req, res) => {
    const pools = await loadPool();
    const totalSize = (pools['29']?.length || 0) + (pools['39']?.length || 0) + (pools['69']?.length || 0);

    res.json({
        service: 'SimpleSwap Triple-Pool Server',
        status: 'running',
        version: '6.0.0',
        mode: 'triple-pool',
        pools: {
            '29': pools['29']?.length || 0,
            '39': pools['39']?.length || 0,
            '69': pools['69']?.length || 0
        },
        totalSize,
        totalMaxSize: 15,
        note: totalSize > 0
            ? 'Triple-pool system ready - instant delivery for $29, $39, and $69'
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
            isReplenishing: {
                '29': replenishmentLocks['29'],
                '39': replenishmentLocks['39'],
                '69': replenishmentLocks['69']
            },
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

        console.log(`[REPLENISH] Creating ${needed} exchanges for pool ${poolKey} in parallel`);

        // Create all needed exchanges in parallel for speed
        const promises = [];
        for (let i = 0; i < needed; i++) {
            promises.push(
                createExchange(config.amount)
                    .then(exchange => {
                        exchange.amount = config.amount;
                        return exchange;
                    })
                    .catch(error => {
                        console.error(`[REPLENISH] Failed exchange ${i+1}/${needed} for pool ${poolKey}:`, error);
                        return null; // Return null for failed exchanges
                    })
            );
        }

        // Wait for all exchanges to be created
        const results = await Promise.all(promises);
        const validExchanges = results.filter(e => e !== null);

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
        if (isNaN(amount) || ![29, 39, 69, 79].includes(amount)) {
            return res.status(400).json({
                success: false,
                error: `Invalid amount: $${amountUSD}. Expected: 29, 39, 69, or 79`
            });
        }

        console.log(`[BUY-NOW] Request received for amount: $${amountUSD}`);

        // Normalize amount to pool key
        const poolKey = normalizeAmount(amountUSD);
        console.log(`[BUY-NOW] Normalized to pool key: ${poolKey}`);

        // CRITICAL: Acquire file lock for atomic read-modify-write
        let release;
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
                const exchange = await createExchange(parseInt(poolKey));

                // Trigger replenishment in background
                replenishPool(poolKey).catch(err =>
                    console.error(`[BUY-NOW] Background replenishment failed:`, err)
                );

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

            // Trigger replenishment for specific pool (outside lock)
            if (targetPool.length < POOL_CONFIG[poolKey].minSize) {
                console.log(`[BUY-NOW] Pool ${poolKey} below minimum (${POOL_CONFIG[poolKey].minSize}), triggering replenishment`);
                replenishPool(poolKey).catch(err =>
                    console.error(`[BUY-NOW] Replenishment failed:`, err)
                );
            }

            res.json({
                success: true,
                exchangeUrl: exchange.exchangeUrl,
                poolStatus: 'instant'
            });

        } catch (error) {
            await release(); // Ensure lock is released on error
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

    res.json({
        pools: {
            '29': {
                description: POOL_CONFIG['29'].description,
                size: pools['29'] ? pools['29'].length : 0,
                maxSize: POOL_CONFIG['29'].size,
                minSize: POOL_CONFIG['29'].minSize,
                exchanges: pools['29'] || []
            },
            '39': {
                description: POOL_CONFIG['39'].description,
                size: pools['39'] ? pools['39'].length : 0,
                maxSize: POOL_CONFIG['39'].size,
                minSize: POOL_CONFIG['39'].minSize,
                exchanges: pools['39'] || []
            },
            '69': {
                description: POOL_CONFIG['69'].description,
                size: pools['69'] ? pools['69'].length : 0,
                maxSize: POOL_CONFIG['69'].size,
                minSize: POOL_CONFIG['69'].minSize,
                exchanges: pools['69'] || []
            }
        },
        totalSize: (pools['29']?.length || 0) + (pools['39']?.length || 0) + (pools['69']?.length || 0),
        totalMaxSize: POOL_CONFIG['29'].size + POOL_CONFIG['39'].size + POOL_CONFIG['69'].size
    });
});

// Admin endpoint - directly seed pool with pre-created exchanges
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

// Admin endpoint - manual pool initialization
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

        console.log('[INIT-POOL] Starting triple-pool initialization...');
        console.log('[INIT-POOL] Creating 15 exchanges in parallel (5 per pool)...');

        const pools = { '29': [], '39': [], '69': [] };
        const allPromises = [];

        // Create all 15 exchanges in parallel for speed
        for (const [poolKey, config] of Object.entries(POOL_CONFIG)) {
            for (let i = 0; i < config.size; i++) {
                allPromises.push(
                    createExchange(config.amount)
                        .then(exchange => {
                            exchange.amount = config.amount;
                            pools[poolKey].push(exchange);
                            console.log(`[INIT-POOL] Pool ${poolKey}: exchange ${pools[poolKey].length}/${config.size} created`);
                            return { poolKey, success: true };
                        })
                        .catch(error => {
                            console.error(`[INIT-POOL] Pool ${poolKey}: failed to create exchange:`, error);
                            return { poolKey, success: false, error };
                        })
                );
            }
        }

        // Wait for all exchanges to be created
        const results = await Promise.all(allPromises);

        // Count successes and failures
        const successes = results.filter(r => r.success).length;
        const failures = results.filter(r => !r.success).length;

        console.log(`[INIT-POOL] Creation complete: ${successes} succeeded, ${failures} failed`);

        if (successes === 0) {
            return res.status(500).json({
                success: false,
                error: 'Pool initialization failed - no exchanges were created'
            });
        }

        await savePool(pools);

        console.log('[INIT-POOL] Triple-pool initialization complete!');
        console.log('[INIT-POOL] Final pool sizes:', {
            '29': pools['29'].length,
            '39': pools['39'].length,
            '69': pools['69'].length,
            total: pools['29'].length + pools['39'].length + pools['69'].length
        });

        res.json({
            success: true,
            pools: {
                '29': pools['29'].length,
                '39': pools['39'].length,
                '69': pools['69'].length
            },
            totalCreated: successes,
            totalFailed: failures,
            message: `Triple-pool initialized with ${successes} exchanges (${failures} failed)`
        });
    } catch (error) {
        console.error('[INIT-POOL] Manual init failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, async () => {
    console.log(`\n🚀 SimpleSwap Triple-Pool Server v6.0.0`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Mode: TRIPLE-POOL SYSTEM`);
    console.log(`   Storage: ${POOL_FILE}`);
    console.log(`   Frontend: ${process.env.FRONTEND_URL || 'https://beigesneaker.netlify.app'}`);

    try {
        const pools = await loadPool();
        console.log(`\n📊 Pool Status:`);
        console.log(`   $29 Pool: ${pools['29']?.length || 0}/5 (Preorder, no bump)`);
        console.log(`   $39 Pool: ${pools['39']?.length || 0}/5 (Preorder + Order Bump)`);
        console.log(`   $69 Pool: ${pools['69']?.length || 0}/5 (Regular, covers $69 and $79)`);
        const totalSize = (pools['29']?.length || 0) + (pools['39']?.length || 0) + (pools['69']?.length || 0);
        console.log(`   Total: ${totalSize}/15 exchanges`);

        console.log(`\n✅ Server ready!`);
        if (totalSize > 0) {
            console.log(`   Triple-pool system active - instant delivery enabled`);
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
