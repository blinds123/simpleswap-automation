import { chromium } from 'playwright';

// BrightData credentials
const BRIGHTDATA_CUSTOMER_ID = 'hl_9d12e57c';
const BRIGHTDATA_ZONE = 'scraping_browser1';
const BRIGHTDATA_PASSWORD = 'u2ynaxqh9899';

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

const MERCHANT_WALLET = "0x1372Ad41B513b9d6eC008086C03d69C635bAE578";
const PRODUCT_PRICE_USD = 25;

console.log('=== Debugging SimpleSwap Validation ===\n');

async function debugValidation() {
    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${PRODUCT_PRICE_USD}`;

    let browser;
    try {
        browser = await chromium.connectOverCDP(CDP_ENDPOINT);
        const context = browser.contexts()[0];
        const page = context.pages()[0] || await context.newPage();

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
        console.log('✓ Page loaded');

        // Dismiss alert if exists
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

        // Get initial button state
        const createButton = page.locator('button[data-testid="create-exchange-button"]').first();
        let isDisabled = await createButton.getAttribute('data-disabled');
        console.log(`\nInitial button state: disabled=${isDisabled}`);

        // Fill address using .fill()
        console.log('\nUsing .fill() method...');
        const addressInput = page.locator('input[placeholder*="address" i]').first();
        await addressInput.fill(MERCHANT_WALLET);

        // Check input value
        const inputValue = await addressInput.inputValue();
        console.log(`Input value after .fill(): ${inputValue}`);

        // Wait and check button state at intervals
        const intervals = [500, 1000, 2000, 3000, 5000, 10000];
        for (const ms of intervals) {
            await page.waitForTimeout(ms);
            isDisabled = await createButton.getAttribute('data-disabled');
            console.log(`After ${ms}ms: disabled=${isDisabled}`);

            if (isDisabled === 'false' || isDisabled === null) {
                console.log(`\n✓ Button enabled after ${ms}ms!`);
                break;
            }
        }

        // Check if there are any error messages
        const errors = await page.$$eval('[role="alert"], [class*="error"]', elements =>
            elements.map(el => el.textContent)
        );
        if (errors.length > 0) {
            console.log('\nError messages found:', errors);
        }

        // Get all form state
        console.log('\nDebugging form state...');
        const formState = await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="address" i]');
            const button = document.querySelector('button[data-testid="create-exchange-button"]');
            return {
                inputValue: input?.value,
                inputValid: input?.validity?.valid,
                buttonDisabled: button?.disabled,
                buttonDataDisabled: button?.getAttribute('data-disabled')
            };
        });
        console.log('Form state:', formState);

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

debugValidation();
