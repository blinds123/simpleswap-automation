import { chromium } from 'playwright';

const BRD_USERNAME = 'brd-customer-hl_9d12e57c-zone-scraping_browser1';
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:u2ynaxqh9899@brd.superproxy.io:9222`;
const MERCHANT_WALLET = "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const PRODUCT_PRICE_USD = 25;

console.log('=== BrightData Anti-Detection Approach ===\n');

async function createExchange() {
    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${PRODUCT_PRICE_USD}`;

    let browser;
    try {
        console.log('Connecting to BrightData Scraping Browser...');
        browser = await chromium.connectOverCDP(CDP_ENDPOINT);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();
        console.log('✓ Connected');

        console.log('Loading SimpleSwap...');
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        console.log('✓ Page loaded (network idle)');

        // Give extra time for all JavaScript to execute and React to initialize
        console.log('Waiting 5 seconds for React initialization...');
        await page.waitForTimeout(5000);

        // Use JavaScript to directly manipulate the form
        console.log('Submitting form via JavaScript...');
        const result = await page.evaluate((wallet) => {
            // Find the form input
            const input = document.querySelector('input[placeholder*="address" i]');
            if (!input) return { error: 'Input not found' };

            // Set value using multiple methods to trigger React
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeInputValueSetter.call(input, wallet);

            // Trigger all possible events
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));

            // Wait a bit for React to process
            return new Promise(resolve => {
                setTimeout(() => {
                    // Find the form
                    const button = document.querySelector('button[data-testid="create-exchange-button"]');
                    if (!button) return resolve({ error: 'Button not found' });

                    // Find parent form and submit
                    const form = button.closest('form');
                    if (form) {
                        form.submit();
                        resolve({ success: 'Form submitted' });
                    } else {
                        // No form, click button directly
                        button.disabled = false;
                        button.click();
                        resolve({ success: 'Button clicked' });
                    }
                }, 2000);
            });
        }, MERCHANT_WALLET);

        console.log('JavaScript result:', result);

        if (result.error) {
            throw new Error(result.error);
        }

        console.log('Waiting for navigation...');
        await page.waitForURL(/\/exchange\?id=/, { timeout: 45000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) throw new Error('No exchange ID');

        console.log(`\n✅ SUCCESS! Exchange: ${exchangeId}`);
        console.log(`URL: ${exchangeUrl}`);

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
        if (browser) await browser.close();
    }
}

createExchange()
    .then(r => {
        console.log('\n✅ EXCHANGE CREATION SUCCESSFUL!');
        console.log(JSON.stringify(r, null, 2));
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ EXCHANGE CREATION FAILED');
        console.error(err.message);
        process.exit(1);
    });
