import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const MERCHANT_WALLET = process.env.MERCHANT_WALLET || "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const POOL_SIZE = parseInt(process.env.POOL_SIZE) || 10;
const MIN_POOL_SIZE = parseInt(process.env.MIN_POOL_SIZE) || 5;
const PRODUCT_PRICE_USD = parseInt(process.env.PRODUCT_PRICE_USD) || 25; // Product price

// BrightData credentials
const BRIGHTDATA_CUSTOMER_ID = process.env.BRIGHTDATA_CUSTOMER_ID;
const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE;
const BRIGHTDATA_PASSWORD = process.env.BRIGHTDATA_PASSWORD;

if (!BRIGHTDATA_CUSTOMER_ID || !BRIGHTDATA_ZONE || !BRIGHTDATA_PASSWORD) {
    throw new Error('Missing BrightData credentials in environment variables');
}

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const BROWSER_WSE_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'https://beigesneaker.netlify.app',
    credentials: true
}));
app.use(express.json());

// Exchange pool
let exchangePool = [];
let isReplenishing = false;

/**
 * Creates a SimpleSwap exchange using Playwright + BrightData
 */
async function createExchange(walletAddress, amountUSD = PRODUCT_PRICE_USD) {
    console.log(`[${new Date().toISOString()}] Creating exchange for $${amountUSD}...`);

    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${amountUSD}`;

    let browser;
    try {
        browser = await puppeteer.connect({
            browserWSEndpoint: BROWSER_WSE_ENDPOINT,
        });
        const page = await browser.newPage();
        console.log(`[${new Date().toISOString()}] Connected to BrightData Scraping Browser`);

        await page.goto(url, { timeout: 120000, waitUntil: "networkidle2" });
        console.log(`[${new Date().toISOString()}] Page loaded`);

        // Wait for address input field and type with delay
        const addressInputSelector = 'input[placeholder*="address" i]';
        await page.waitForSelector(addressInputSelector, { timeout: 20000 });

        // Type address character by character with delay
        await page.type(addressInputSelector, walletAddress, { delay: 110 });
        console.log(`[${new Date().toISOString()}] Typed wallet address`);

        // Wait for "Create an exchange" button to be enabled
        const createButtonSelector = 'button[data-testid="create-exchange-button"]';
        await page.waitForFunction(
            (selector) => {
                const btn = document.querySelector(selector);
                return btn && !btn.disabled;
            },
            { timeout: 20000 }
        );
        console.log(`[${new Date().toISOString()}] Create button is enabled`);

        await page.click(createButtonSelector);
        await page.waitForNavigation({ timeout: 45000, waitUntil: 'networkidle2' });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) {
            throw new Error('No exchange ID in URL');
        }

        console.log(`[${new Date().toISOString()}] ✓ Exchange created: ${exchangeId}`);

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

/**
 * Initializes pool on startup
 */
async function initializePool() {
    console.log(`\n🏊 Initializing pool with ${POOL_SIZE} exchanges...`);
    console.log(`   Merchant wallet: ${MERCHANT_WALLET}`);
    console.log(`   Product price: $${PRODUCT_PRICE_USD}\n`);

    const promises = [];
    for (let i = 0; i < POOL_SIZE; i++) {
        promises.push(
            createExchange(MERCHANT_WALLET, PRODUCT_PRICE_USD)
                .then(exchange => {
                    exchangePool.push(exchange);
                    console.log(`   [${i + 1}/${POOL_SIZE}] ✓`);
                })
                .catch(err => {
                    console.error(`   [${i + 1}/${POOL_SIZE}] ✗`, err.message);
                })
        );
    }

    await Promise.all(promises);
    console.log(`\n✓ Pool ready with ${exchangePool.length} exchanges\n`);
}

/**
 * Replenishes pool in background
 */
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

// ============================================
// API ROUTES
// ============================================

/**
 * GET /health - Health check
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        poolSize: exchangePool.length,
        maxPool: POOL_SIZE,
        isReplenishing,
        productPrice: PRODUCT_PRICE_USD,
        timestamp: new Date().toISOString()
    });
});

/**
 * POST /buy-now - Get exchange for "Buy Now" button
 * Returns instant exchange URL from pool
 */
app.post('/buy-now', async (req, res) => {
    try {
        console.log(`\n🛒 Buy Now request received`);

        // If pool empty, create on-demand
        if (exchangePool.length === 0) {
            console.log('⚠ Pool empty - creating on-demand');
            const exchange = await createExchange(MERCHANT_WALLET, PRODUCT_PRICE_USD);

            // Start background replenishment
            replenishPool().catch(console.error);

            return res.json({
                success: true,
                ...exchange,
                poolStatus: 'on-demand'
            });
        }

        // Get from pool (instant!)
        const exchange = exchangePool.shift();
        console.log(`✓ Delivered ${exchange.exchangeId} (pool: ${exchangePool.length})`);

        // Trigger replenishment if low
        if (exchangePool.length < MIN_POOL_SIZE) {
            console.log(`🔔 Pool low (${exchangePool.length}/${MIN_POOL_SIZE}) - replenishing`);
            replenishPool().catch(console.error);
        }

        res.json({
            success: true,
            ...exchange,
            poolStatus: 'instant'
        });

    } catch (error) {
        console.error('✗ Buy Now error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /stats - Pool statistics
 */
app.get('/stats', (req, res) => {
    res.json({
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

// ============================================
// SERVER STARTUP
// ============================================

app.listen(PORT, async () => {
    console.log(`\n🚀 SimpleSwap Pool Server`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Frontend: ${process.env.FRONTEND_URL || 'https://beigesneaker.netlify.app'}`);
    console.log(`   Product: Beige Sneakers ($${PRODUCT_PRICE_USD})\n`);

    try {
        await initializePool();
        console.log(`✅ Server ready!\n`);
    } catch (error) {
        console.error('❌ Pool init failed:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', () => {
    console.log('\n⏹ Shutting down...');
    process.exit(0);
});
