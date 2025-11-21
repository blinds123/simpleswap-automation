import { chromium } from 'playwright';

// BrightData credentials
const BRIGHTDATA_CUSTOMER_ID = 'hl_9d12e57c';
const BRIGHTDATA_ZONE = 'scraping_browser1';
const BRIGHTDATA_PASSWORD = 'u2ynaxqh9899';

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

const MERCHANT_WALLET = "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const PRODUCT_PRICE_USD = 25;

console.log('=== Testing .fill() Method for React Validation ===\n');

async function createExchange(walletAddress, amountUSD = PRODUCT_PRICE_USD) {
    console.log(`[${new Date().toISOString()}] Creating exchange for $${amountUSD}...`);

    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${amountUSD}`;

    let browser;
    try {
        console.log(`[${new Date().toISOString()}] Connecting to BrightData...`);
        browser = await chromium.connectOverCDP(CDP_ENDPOINT);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        console.log(`[${new Date().toISOString()}] Connected`);

        console.log(`[${new Date().toISOString()}] Navigating to SimpleSwap...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        console.log(`[${new Date().toISOString()}] Page loaded`);

        // Dismiss any alert/warning messages
        try {
            const alertSelector = '[data-testid="info-message"]';
            const alertExists = await page.$(alertSelector);
            if (alertExists) {
                const closeButton = await page.$(`${alertSelector} button`);
                if (closeButton) {
                    await closeButton.click();
                    await page.waitForTimeout(500);
                    console.log(`[${new Date().toISOString()}] Alert dismissed`);
                }
            }
        } catch (e) {
            console.log(`[${new Date().toISOString()}] No alert to dismiss`);
        }

        // Fill wallet address using .fill() which properly triggers React validation
        console.log(`[${new Date().toISOString()}] Using .fill() to enter wallet address...`);
        const addressInput = page.locator('input[placeholder*="address" i]').first();
        await addressInput.fill(walletAddress);
        await page.waitForTimeout(1000); // Wait for React validation
        console.log(`[${new Date().toISOString()}] Wallet address filled, waiting for validation...`);

        // Check button state
        const createButton = page.locator('button[data-testid="create-exchange-button"]').first();
        const isDisabled = await createButton.getAttribute('data-disabled');
        console.log(`[${new Date().toISOString()}] Button disabled status: ${isDisabled}`);

        if (isDisabled === 'true') {
            console.error(`[${new Date().toISOString()}] ❌ Button is still disabled - validation failed!`);
            throw new Error('Button remains disabled after validation');
        }

        console.log(`[${new Date().toISOString()}] ✓ Button is enabled! Clicking...`);
        await createButton.click({ timeout: 10000 });
        console.log(`[${new Date().toISOString()}] Waiting for redirect...`);

        await page.waitForURL(/\/exchange\?id=/, { timeout: 45000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) {
            throw new Error('No exchange ID in URL');
        }

        console.log(`[${new Date().toISOString()}] ✓ SUCCESS! Exchange created: ${exchangeId}`);
        console.log(`[${new Date().toISOString()}] URL: ${exchangeUrl}`);

        return {
            exchangeId,
            exchangeUrl,
            amountUSD,
            createdAt: new Date().toISOString()
        };

    } catch (error) {
        console.error(`[${new Date().toISOString()}] ✗ FAILED:`, error.message);
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
        console.log('\n✅ TEST PASSED - .fill() method works!');
        console.log('Exchange Details:', JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ TEST FAILED!');
        console.error('Error:', error.message);
        process.exit(1);
    });
