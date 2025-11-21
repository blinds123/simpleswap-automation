import { chromium } from 'playwright';

// BrightData credentials
const BRIGHTDATA_CUSTOMER_ID = 'hl_9d12e57c';
const BRIGHTDATA_ZONE = 'scraping_browser1';
const BRIGHTDATA_PASSWORD = 'u2ynaxqh9899';

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

const MERCHANT_WALLET = "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const PRODUCT_PRICE_USD = 25;

console.log('=== SimpleSwap Exchange Creation Test ===\n');

async function createExchange(walletAddress, amountUSD = PRODUCT_PRICE_USD) {
    console.log(`[${new Date().toISOString()}] Creating exchange for $${amountUSD}...`);

    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${amountUSD}`;

    let browser;
    try {
        console.log(`[${new Date().toISOString()}] Connecting to BrightData...`);
        browser = await chromium.connectOverCDP(CDP_ENDPOINT);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        console.log(`[${new Date().toISOString()}] Connected to BrightData`);

        console.log(`[${new Date().toISOString()}] Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        console.log(`[${new Date().toISOString()}] Page loaded`);

        // Dismiss any alert/warning messages that might block interaction
        try {
            console.log(`[${new Date().toISOString()}] Checking for alert overlays...`);
            const alertSelector = '[data-testid="info-message"]';
            const alertExists = await page.$(alertSelector);
            if (alertExists) {
                console.log(`[${new Date().toISOString()}] Alert found, attempting to dismiss...`);
                const closeButton = await page.$(`${alertSelector} button`);
                if (closeButton) {
                    await closeButton.click();
                    await page.waitForTimeout(500);
                    console.log(`[${new Date().toISOString()}] Alert dismissed`);
                }
            } else {
                console.log(`[${new Date().toISOString()}] No alert overlay found`);
            }
        } catch (e) {
            console.log(`[${new Date().toISOString()}] Note: Could not dismiss alert (${e.message})`);
        }

        // Fill wallet address
        const addressInputSelector = 'input[placeholder*="address" i]';
        console.log(`[${new Date().toISOString()}] Waiting for address input...`);
        await page.waitForSelector(addressInputSelector, { timeout: 20000 });
        console.log(`[${new Date().toISOString()}] Address input found`);

        console.log(`[${new Date().toISOString()}] Clicking and typing wallet address...`);
        await page.click(addressInputSelector, { clickCount: 3, force: true });
        await page.type(addressInputSelector, walletAddress, { delay: 50 });
        console.log(`[${new Date().toISOString()}] Wallet address entered`);

        // Trigger blur for React validation
        console.log(`[${new Date().toISOString()}] Triggering blur event for React validation...`);
        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="address" i]');
            if (input) {
                input.blur();
                input.dispatchEvent(new Event('blur', { bubbles: true }));
            }
        });

        await page.waitForTimeout(2000);
        console.log(`[${new Date().toISOString()}] Validation complete`);

        // Click create button - .first() handles responsive design (2 buttons, only 1 visible)
        console.log(`[${new Date().toISOString()}] Looking for create button...`);
        const createButton = page.locator('button[data-testid="create-exchange-button"]').first();
        console.log(`[${new Date().toISOString()}] Clicking create button...`);
        await createButton.click({ timeout: 10000 });
        console.log(`[${new Date().toISOString()}] Button clicked, waiting for redirect...`);

        await page.waitForURL(/\/exchange\?id=/, { timeout: 45000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) {
            throw new Error('No exchange ID in URL');
        }

        console.log(`[${new Date().toISOString()}] ✓ Exchange created: ${exchangeId}`);
        console.log(`[${new Date().toISOString()}] URL: ${exchangeUrl}`);

        return {
            exchangeId,
            exchangeUrl,
            amountUSD,
            createdAt: new Date().toISOString()
        };

    } catch (error) {
        console.error(`[${new Date().toISOString()}] ✗ Failed:`, error.message);
        console.error('Stack:', error.stack);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            console.log(`[${new Date().toISOString()}] Browser closed`);
        }
    }
}

// Run the test
createExchange(MERCHANT_WALLET, PRODUCT_PRICE_USD)
    .then(result => {
        console.log('\n✅ TEST PASSED!');
        console.log('Exchange Details:', JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ TEST FAILED!');
        console.error('Error:', error.message);
        process.exit(1);
    });
