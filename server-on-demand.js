import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const MERCHANT_WALLET = process.env.MERCHANT_WALLET || "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const POOL_SIZE = parseInt(process.env.POOL_SIZE) || 10;
const MIN_POOL_SIZE = parseInt(process.env.MIN_POOL_SIZE) || 5;
const PRODUCT_PRICE_USD = parseInt(process.env.PRODUCT_PRICE_USD) || 25;

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
async function createExchange(walletAddress, amountUSD = PRODUCT_PRICE_USD) {
    console.log(`[${new Date().toISOString()}] Creating on-demand exchange for $${amountUSD}...`);

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

        // Fill wallet address
        const addressInputSelector = 'input[placeholder*="address" i]';
        await page.waitForSelector(addressInputSelector, { timeout: 20000 });
        // Use force: true to bypass intercepting elements
        await page.click(addressInputSelector, { clickCount: 3, force: true });
        await page.type(addressInputSelector, walletAddress, { delay: 50 });

        // Trigger blur for React validation
        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="address" i]');
            if (input) {
                input.blur();
                input.dispatchEvent(new Event('blur', { bubbles: true }));
            }
        });

        await page.waitForTimeout(2000);

        // Click create button
        const createButtonSelector = 'button[data-testid="create-exchange-button"]';
        await page.waitForFunction(
            (selector) => {
                const btn = document.querySelector(selector);
                return btn && !btn.disabled;
            },
            { timeout: 10000 },
            createButtonSelector
        );

        await page.click(createButtonSelector);
        await page.waitForURL(/\/exchange\?id=/, { timeout: 45000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) {
            throw new Error('No exchange ID in URL');
        }

        console.log(`[${new Date().toISOString()}] ✓ Created: ${exchangeId}`);

        return {
            exchangeId,
            exchangeUrl,
            amountUSD,
            createdAt: new Date().toISOString()
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

// Exchange pool
let exchangePool = [];
let isReplenishing = false;

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'SimpleSwap Pool Server (Hybrid)',
        status: 'running',
        version: '5.0.0',
        mode: exchangePool.length > 0 ? 'pool' : 'on-demand',
        poolSize: exchangePool.length,
        note: exchangePool.length > 0
            ? 'Instant delivery from pool'
            : 'Exchanges created on demand - use /admin/init-pool to fill pool'
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        mode: exchangePool.length > 0 ? 'pool' : 'on-demand',
        poolSize: exchangePool.length,
        maxPool: POOL_SIZE,
        isReplenishing,
        productPrice: PRODUCT_PRICE_USD,
        timestamp: new Date().toISOString()
    });
});

// Replenishment function
async function replenishPool() {
    if (isReplenishing) return;

    const needed = POOL_SIZE - exchangePool.length;
    if (needed <= 0) return;

    isReplenishing = true;
    console.log(`\n🔄 Replenishing ${needed} exchanges...`);

    const promises = [];
    for (let i = 0; i < needed; i++) {
        promises.push(
            createExchange(MERCHANT_WALLET, PRODUCT_PRICE_USD)
                .then(exchange => {
                    exchangePool.push(exchange);
                    console.log(`   [${i + 1}/${needed}] ✓`);
                })
                .catch(err => console.error(`   [${i + 1}/${needed}] ✗`, err.message))
        );
    }

    await Promise.all(promises);
    isReplenishing = false;
    console.log(`✓ Pool: ${exchangePool.length}/${POOL_SIZE}\n`);
}

// Buy now endpoint - uses pool if available, otherwise on-demand
app.post('/buy-now', async (req, res) => {
    try {
        console.log(`\n🛒 Buy Now request received`);

        // If pool has exchanges, deliver instantly
        if (exchangePool.length > 0) {
            const exchange = exchangePool.shift();
            console.log(`✓ Delivered from pool: ${exchange.exchangeId} (pool: ${exchangePool.length}/${POOL_SIZE})`);

            // Trigger replenishment if low
            if (exchangePool.length < MIN_POOL_SIZE) {
                console.log(`🔔 Pool low (${exchangePool.length}/${MIN_POOL_SIZE}) - replenishing`);
                replenishPool().catch(console.error);
            }

            return res.json({
                success: true,
                ...exchange,
                poolStatus: 'instant'
            });
        }

        // If pool empty, create on-demand
        console.log('⚠ Pool empty - creating on-demand');
        const exchange = await createExchange(MERCHANT_WALLET, PRODUCT_PRICE_USD);

        // Start background replenishment
        replenishPool().catch(console.error);

        res.json({
            success: true,
            ...exchange,
            poolStatus: 'on-demand'
        });

    } catch (error) {
        console.error('✗ Buy Now error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Stats endpoint
app.get('/stats', (req, res) => {
    res.json({
        mode: exchangePool.length > 0 ? 'pool' : 'on-demand',
        poolSize: exchangePool.length,
        maxSize: POOL_SIZE,
        minSize: MIN_POOL_SIZE,
        isReplenishing,
        productPrice: PRODUCT_PRICE_USD,
        merchantWallet: MERCHANT_WALLET,
        exchanges: exchangePool.map(e => ({
            id: e.exchangeId,
            created: e.createdAt
        }))
    });
});

// Admin endpoint - manual pool initialization
app.post('/admin/init-pool', async (req, res) => {
    try {
        if (isReplenishing) {
            return res.json({ success: false, error: 'Pool is already initializing' });
        }

        if (exchangePool.length >= POOL_SIZE) {
            return res.json({
                success: false,
                error: 'Pool is already full',
                poolSize: exchangePool.length
            });
        }

        console.log('\n🔧 Manual pool initialization triggered...\n');

        // Clear existing pool and reinitialize
        exchangePool.length = 0;

        isReplenishing = true;
        const needed = POOL_SIZE;
        console.log(`🏊 Initializing pool with ${needed} exchanges...\n`);

        const promises = [];
        for (let i = 0; i < needed; i++) {
            promises.push(
                createExchange(MERCHANT_WALLET, PRODUCT_PRICE_USD)
                    .then(exchange => {
                        exchangePool.push(exchange);
                        console.log(`   [${i + 1}/${needed}] ✓`);
                    })
                    .catch(err => console.error(`   [${i + 1}/${needed}] ✗`, err.message))
            );
        }

        await Promise.all(promises);
        isReplenishing = false;
        console.log(`\n✓ Pool ready with ${exchangePool.length} exchanges\n`);

        res.json({
            success: true,
            poolSize: exchangePool.length,
            message: `Pool initialized with ${exchangePool.length} exchanges`
        });
    } catch (error) {
        isReplenishing = false;
        console.error('❌ Manual init failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 SimpleSwap Pool Server v5.0.0 (Hybrid)`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Mode: HYBRID (pool + on-demand fallback)`);
    console.log(`   Pool: ${exchangePool.length}/${POOL_SIZE} (empty at startup)`);
    console.log(`   Frontend: ${process.env.FRONTEND_URL || 'https://beigesneaker.netlify.app'}`);
    console.log(`   Product: Beige Sneakers ($${PRODUCT_PRICE_USD})`);
    console.log(`\n✅ Server started! Use POST /admin/init-pool to fill exchange pool`);
    console.log(`   Pool delivers instantly | Falls back to on-demand if empty\n`);
});

process.on('SIGTERM', () => {
    console.log('\n⏹ Shutting down...');
    process.exit(0);
});
