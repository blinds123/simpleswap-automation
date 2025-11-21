import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const MERCHANT_WALLET = process.env.MERCHANT_WALLET || "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
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

        // Fill wallet address
        const addressInputSelector = 'input[placeholder*="address" i]';
        await page.waitForSelector(addressInputSelector, { timeout: 20000 });
        await page.click(addressInputSelector, { clickCount: 3 });
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

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'SimpleSwap On-Demand Server',
        status: 'running',
        version: '4.0.0',
        mode: 'on-demand (no pool)',
        note: 'Exchanges created in real-time when requested (30-60s)'
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        mode: 'on-demand',
        productPrice: PRODUCT_PRICE_USD,
        timestamp: new Date().toISOString()
    });
});

// Buy now endpoint - creates exchange on-demand
app.post('/buy-now', async (req, res) => {
    try {
        console.log(`\n🛒 Buy Now request - creating exchange on-demand...`);

        // Create exchange in real-time (will take 30-60 seconds)
        const exchange = await createExchange(MERCHANT_WALLET, PRODUCT_PRICE_USD);

        console.log(`✓ Delivered on-demand exchange: ${exchange.exchangeId}`);

        res.json({
            success: true,
            ...exchange,
            mode: 'on-demand',
            note: 'Exchange created in real-time'
        });

    } catch (error) {
        console.error('✗ On-demand creation failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            note: 'Failed to create exchange - try again'
        });
    }
});

// Stats endpoint
app.get('/stats', (req, res) => {
    res.json({
        mode: 'on-demand',
        poolSize: 0,
        note: 'No pool - exchanges created on demand',
        productPrice: PRODUCT_PRICE_USD,
        merchantWallet: MERCHANT_WALLET
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 SimpleSwap On-Demand Server v4.0.0`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Mode: ON-DEMAND (no pool)`);
    console.log(`   Frontend: ${process.env.FRONTEND_URL || 'https://beigesneaker.netlify.app'}`);
    console.log(`   Product: Beige Sneakers ($${PRODUCT_PRICE_USD})`);
    console.log(`\n✅ Server started! Exchanges created in real-time (30-60s per request)\n`);
});

process.on('SIGTERM', () => {
    console.log('\n⏹ Shutting down...');
    process.exit(0);
});
