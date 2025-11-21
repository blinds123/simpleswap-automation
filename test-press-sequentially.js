import { chromium } from 'playwright';

// BrightData credentials
const BRIGHTDATA_CUSTOMER_ID = 'hl_9d12e57c';
const BRIGHTDATA_ZONE = 'scraping_browser1';
const BRIGHTDATA_PASSWORD = 'u2ynaxqh9899';

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

const MERCHANT_WALLET = "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const PRODUCT_PRICE_USD = 25;

console.log('=== Testing pressSequentially() Method ===\n');

async function createExchange() {
    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${PRODUCT_PRICE_USD}`;

    let browser;
    try {
        console.log('[1/8] Connecting to BrightData...');
        browser = await chromium.connectOverCDP(CDP_ENDPOINT);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        console.log('✓ Connected');

        console.log('[2/8] Loading SimpleSwap...');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        console.log('✓ Page loaded');

        // Dismiss alert
        try {
            const alertSelector = '[data-testid="info-message"]';
            const alertExists = await page.$(alertSelector);
            if (alertExists) {
                const closeButton = await page.$(`${alertSelector} button`);
                if (closeButton) {
                    await closeButton.click();
                    await page.waitForTimeout(500);
                }
            }
        } catch (e) {
            // Ignore
        }

        console.log('[3/8] Finding address input...');
        const addressInput = page.locator('input[placeholder*="address" i]').first();
        await addressInput.click(); // Focus the input
        console.log('✓ Input focused');

        console.log('[4/8] Typing wallet address character-by-character...');
        await addressInput.pressSequentially(MERCHANT_WALLET, { delay: 100 }); // Type like a human
        console.log('✓ Address typed');

        console.log('[5/8] Waiting for React validation...');
        await page.waitForTimeout(2000);

        // Check input value
        const inputValue = await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="address" i]');
            return input?.value;
        });
        console.log(`Input value in DOM: ${inputValue}`);

        console.log('[6/8] Checking button state...');
        const createButton = page.locator('button[data-testid="create-exchange-button"]').first();
        const isDisabled = await createButton.getAttribute('data-disabled');
        console.log(`Button disabled: ${isDisabled}`);

        if (isDisabled === 'true') {
            throw new Error('Button still disabled after pressSequentially');
        }

        console.log('[7/8] Clicking create button...');
        await createButton.click({ timeout: 10000 });
        console.log('✓ Clicked');

        console.log('[8/8] Waiting for redirect...');
        await page.waitForURL(/\/exchange\?id=/, { timeout: 45000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) {
            throw new Error('No exchange ID in URL');
        }

        console.log(`\n✅ SUCCESS! Exchange created: ${exchangeId}`);
        console.log(`URL: ${exchangeUrl}`);

        return {
            exchangeId,
            exchangeUrl,
            amountUSD: PRODUCT_PRICE_USD,
            createdAt: new Date().toISOString()
        };

    } catch (error) {
        console.error(`\n❌ FAILED:`, error.message);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

createExchange()
    .then(result => {
        console.log('\n✅ TEST PASSED - pressSequentially() works!');
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ TEST FAILED');
        console.error(error.message);
        process.exit(1);
    });
