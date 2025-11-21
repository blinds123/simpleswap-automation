import { chromium } from 'playwright';

const BRD_USERNAME = 'brd-customer-hl_9d12e57c-zone-scraping_browser1';
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:u2ynaxqh9899@brd.superproxy.io:9222`;
const MERCHANT_WALLET = "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const PRODUCT_PRICE_USD = 25;

console.log('=== Manually Enable Button Approach ===\n');

async function createExchange() {
    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${PRODUCT_PRICE_USD}`;

    let browser;
    try {
        browser = await chromium.connectOverCDP(CDP_ENDPOINT);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
        console.log('✓ Page loaded');

        // Dismiss alert
        try {
            const alert = page.locator('[data-testid="info-message"]').first();
            if (await alert.count() > 0) {
                const closeBtn = alert.locator('button').first();
                if (await closeBtn.count() > 0) await closeBtn.click();
                await page.waitForTimeout(1000);
            }
        } catch (e) {}

        // Fill address
        const addressInput = page.locator('input[placeholder*="address" i]').first();
        await addressInput.click({ force: true });
        await addressInput.pressSequentially(MERCHANT_WALLET, { delay: 80 });
        await page.keyboard.press('Tab');
        await page.waitForTimeout(3000);
        console.log('✓ Address entered');

        // Manually enable button via JavaScript
        console.log('Manually enabling button...');
        await page.evaluate(() => {
            const button = document.querySelector('button[data-testid="create-exchange-button"]');
            if (button) {
                button.disabled = false;
                button.setAttribute('data-disabled', 'false');
                button.removeAttribute('disabled');
            }
        });

        const createButton = page.locator('button[data-testid="create-exchange-button"]').first();
        const isDisabled = await createButton.getAttribute('data-disabled');
        console.log(`Button disabled after JS: ${isDisabled}`);

        await createButton.click({ timeout: 10000 });
        console.log('✓ Button clicked');

        await page.waitForURL(/\/exchange\?id=/, { timeout: 45000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) throw new Error('No exchange ID');

        console.log(`\n✅ SUCCESS! Exchange: ${exchangeId}`);
        return { exchangeId, exchangeUrl, amountUSD: PRODUCT_PRICE_USD, createdAt: new Date().toISOString() };

    } catch (error) {
        console.error(`\n❌ FAILED: ${error.message}`);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

createExchange()
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(() => process.exit(1));
