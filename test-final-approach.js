import { chromium } from 'playwright';

const BRD_USERNAME = 'brd-customer-hl_9d12e57c-zone-scraping_browser1';
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:u2ynaxqh9899@brd.superproxy.io:9222`;
const MERCHANT_WALLET = "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const PRODUCT_PRICE_USD = 25;

console.log('=== Final Approach: Blur + Extended Wait ===\n');

async function createExchange() {
    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${PRODUCT_PRICE_USD}`;

    let browser;
    try {
        console.log('[1/10] Connecting...');
        browser = await chromium.connectOverCDP(CDP_ENDPOINT);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        console.log('✓ Connected');

        console.log('[2/10] Loading page...');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
        console.log('✓ Loaded');

        console.log('[3/10] Dismissing alert...');
        try {
            const alert = page.locator('[data-testid="info-message"]').first();
            if (await alert.count() > 0) {
                const closeBtn = alert.locator('button').first();
                if (await closeBtn.count() > 0) {
                    await closeBtn.click();
                    await page.waitForTimeout(1000);
                }
            }
        } catch (e) {
            console.log(`Alert error (continuing): ${e.message}`);
        }
        console.log('✓ Alert handled');

        console.log('[4/10] Finding input...');
        const addressInput = page.locator('input[placeholder*="address" i]').first();
        await addressInput.waitFor({ state: 'visible' });
        console.log('✓ Input found');

        console.log('[5/10] Focusing input...');
        await addressInput.click({ force: true });
        await page.waitForTimeout(500);
        console.log('✓ Focused');

        console.log('[6/10] Typing address...');
        await addressInput.pressSequentially(MERCHANT_WALLET, { delay: 80 });
        console.log('✓ Typed');

        console.log('[7/10] Triggering blur...');
        await page.keyboard.press('Tab'); // Tab out to trigger blur
        await page.waitForTimeout(500);
        console.log('✓ Blurred');

        console.log('[8/10] Waiting for async validation (5s)...');
        await page.waitForTimeout(5000); // Longer wait for async validation

        const createButton = page.locator('button[data-testid="create-exchange-button"]').first();
        const isDisabled = await createButton.getAttribute('data-disabled');
        console.log(`Button state: disabled=${isDisabled}`);

        if (isDisabled === 'true') {
            console.log('Button still disabled, trying to force...');
            // Last resort: force click even if disabled
            await createButton.click({ force: true, timeout: 10000 });
        } else {
            console.log('[9/10] Clicking button...');
            await createButton.click({ timeout: 10000 });
        }

        console.log('[10/10] Waiting for redirect...');
        await page.waitForURL(/\/exchange\?id=/, { timeout: 45000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) {
            throw new Error('No exchange ID');
        }

        console.log(`\n✅ SUCCESS! Exchange ID: ${exchangeId}`);
        console.log(`URL: ${exchangeUrl}`);

        return { exchangeId, exchangeUrl, amountUSD: PRODUCT_PRICE_USD, createdAt: new Date().toISOString() };

    } catch (error) {
        console.error(`\n❌ FAILED: ${error.message}`);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

createExchange()
    .then(r => { console.log('\n✅ TEST PASSED!\n', JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(() => { console.error('\n❌ TEST FAILED'); process.exit(1); });
