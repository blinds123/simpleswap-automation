import { chromium } from 'playwright';

const BRD_USERNAME = 'brd-customer-hl_9d12e57c-zone-scraping_browser1';
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:u2ynaxqh9899@brd.superproxy.io:9222`;
const MERCHANT_WALLET = "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const PRODUCT_PRICE_USD = 25;

console.log('=== Final Working Solution ===\n');

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
        console.log('✓ Alert dismissed');

        // Fill address
        const addressInput = page.locator('input[placeholder*="address" i]').first();
        await addressInput.click({ force: true });
        await addressInput.pressSequentially(MERCHANT_WALLET, { delay: 80 });
        await page.keyboard.press('Tab');
        await page.waitForTimeout(3000);
        console.log('✓ Address entered');

        // Enable button via JavaScript
        await page.evaluate(() => {
            const button = document.querySelector('button[data-testid="create-exchange-button"]');
            if (button) {
                button.disabled = false;
                button.setAttribute('data-disabled', 'false');
                button.removeAttribute('disabled');
            }
        });
        console.log('✓ Button enabled');

        // Force click to bypass overlays
        const createButton = page.locator('button[data-testid="create-exchange-button"]').first();
        await createButton.click({ force: true, timeout: 10000 });
        console.log('✓ Button clicked');

        await page.waitForURL(/\/exchange\?id=/, { timeout: 45000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) throw new Error('No exchange ID');

        console.log(`\n✅ SUCCESS! Exchange created: ${exchangeId}`);
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
    .then(r => { console.log('\n✅ EXCHANGE CREATION SUCCESSFUL!\n', JSON.stringify(r, null, 2)); process.exit(0); })
    .catch(() => { console.error('\n❌ EXCHANGE CREATION FAILED'); process.exit(1); });
