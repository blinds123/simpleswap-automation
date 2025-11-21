import { chromium } from 'playwright';

// BrightData credentials
const BRIGHTDATA_CUSTOMER_ID = 'hl_9d12e57c';
const BRIGHTDATA_ZONE = 'scraping_browser1';
const BRIGHTDATA_PASSWORD = 'u2ynaxqh9899';

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

const MERCHANT_WALLET = "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const PRODUCT_PRICE_USD = 25;

console.log('=== Testing Robust Alert Handling ===\n');

async function createExchange() {
    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${PRODUCT_PRICE_USD}`;

    let browser;
    try {
        console.log('[1/9] Connecting to BrightData...');
        browser = await chromium.connectOverCDP(CDP_ENDPOINT);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        console.log('✓ Connected');

        console.log('[2/9] Loading SimpleSwap...');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000); // Longer wait for page to settle
        console.log('✓ Page loaded');

        // Robust alert dismissal
        console.log('[3/9] Handling alert overlay...');
        try {
            const alertLocator = page.locator('[data-testid="info-message"]').first();
            const alertCount = await alertLocator.count();

            if (alertCount > 0) {
                console.log('Alert found, dismissing...');
                // Try to find close button within alert
                const closeButton = alertLocator.locator('button').first();
                const buttonCount = await closeButton.count();

                if (buttonCount > 0) {
                    await closeButton.click({ timeout: 5000 });
                    await page.waitForTimeout(1000);
                    console.log('✓ Alert dismissed');
                } else {
                    console.log('No close button, clicking alert itself...');
                    await alertLocator.click({ timeout: 5000 });
                    await page.waitForTimeout(1000);
                }
            } else {
                console.log('No alert found');
            }
        } catch (e) {
            console.log(`Alert dismissal failed (continuing): ${e.message}`);
        }

        console.log('[4/9] Waiting for address input...');
        const addressInput = page.locator('input[placeholder*="address" i]').first();
        await addressInput.waitFor({ state: 'visible', timeout: 10000 });
        console.log('✓ Input visible');

        console.log('[5/9] Clicking input with force...');
        await addressInput.click({ force: true, timeout: 10000 }); // Force past any overlays
        console.log('✓ Input focused');

        console.log('[6/9] Typing wallet address...');
        await addressInput.pressSequentially(MERCHANT_WALLET, { delay: 80 });
        console.log('✓ Address typed');

        // Verify input value
        const inputValue = await addressInput.inputValue();
        console.log(`Input value: ${inputValue.substring(0, 20)}...`);

        console.log('[7/9] Waiting for validation (3s)...');
        await page.waitForTimeout(3000);

        const createButton = page.locator('button[data-testid="create-exchange-button"]').first();
        const isDisabled = await createButton.getAttribute('data-disabled');
        console.log(`Button disabled: ${isDisabled}`);

        if (isDisabled === 'true') {
            throw new Error('Button still disabled');
        }

        console.log('[8/9] Clicking create button...');
        await createButton.click({ timeout: 10000 });

        console.log('[9/9] Waiting for redirect...');
        await page.waitForURL(/\/exchange\?id=/, { timeout: 45000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) {
            throw new Error('No exchange ID');
        }

        console.log(`\n✅ SUCCESS! Exchange: ${exchangeId}`);

        return {
            exchangeId,
            exchangeUrl,
            amountUSD: PRODUCT_PRICE_USD,
            createdAt: new Date().toISOString()
        };

    } catch (error) {
        console.error(`\n❌ FAILED: ${error.message}`);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

createExchange()
    .then(result => {
        console.log('\n✅ TEST PASSED!');
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ TEST FAILED');
        process.exit(1);
    });
