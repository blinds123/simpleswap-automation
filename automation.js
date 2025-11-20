import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

// BrightData credentials from environment variables
const BRIGHTDATA_CUSTOMER_ID = process.env.BRIGHTDATA_CUSTOMER_ID;
const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE;
const BRIGHTDATA_PASSWORD = process.env.BRIGHTDATA_PASSWORD;

if (!BRIGHTDATA_CUSTOMER_ID || !BRIGHTDATA_ZONE || !BRIGHTDATA_PASSWORD) {
    throw new Error('Missing BrightData credentials. Please set BRIGHTDATA_CUSTOMER_ID, BRIGHTDATA_ZONE, and BRIGHTDATA_PASSWORD in .env file');
}

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

/**
 * Creates a SimpleSwap exchange using BrightData's Scraping Browser via Playwright
 * @param {string} walletAddress - The recipient's Polygon wallet address
 * @param {number} amount - The amount to exchange (default: 25)
 * @returns {Promise<{exchangeId: string, exchangeUrl: string}>}
 */
export async function createExchange(walletAddress, amount = 25) {
    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${amount}`;

    console.log(`   → Connecting to BrightData Scraping Browser...`);

    let browser;
    let page;

    try {
        // Connect to BrightData Scraping Browser using CDP
        browser = await chromium.connectOverCDP(CDP_ENDPOINT);
        console.log(`   ✓ Connected to BrightData`);

        // Get or create page
        const context = browser.contexts()[0];
        page = context.pages()[0] || await context.newPage();

        // Navigate to SimpleSwap
        console.log(`   → Navigating to SimpleSwap...`);
        await page.goto(url, {
            timeout: 60000,
            waitUntil: "domcontentloaded"
        });
        console.log(`   ✓ Page loaded successfully`);

        // Give the page extra time to render JavaScript
        await page.waitForTimeout(3000);

        // Use MCP-like approach: Just navigate to the URL with wallet address pre-filled
        console.log(`   → Trying direct URL approach...`);

        // Try navigating to exchange creation URL directly (if supported)
        const directUrl = `https://simpleswap.io/create-exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${amount}&address=${walletAddress}`;

        try {
            await page.goto(directUrl, {
                timeout: 30000,
                waitUntil: "domcontentloaded"
            });

            // Check if we landed on the exchange page
            if (page.url().includes('?id=')) {
                console.log(`   ✓ Direct URL approach worked!`);
            } else {
                throw new Error('Direct URL did not create exchange');
            }
        } catch (err) {
            // If direct URL doesn't work, fall back to manual entry
            console.log(`   ⚠ Direct URL failed, using manual entry...`);

            await page.goto(url, {
                timeout: 60000,
                waitUntil: "domcontentloaded"
            });

            await page.waitForTimeout(3000);

            // Find visible input and type using keyboard
            const input = await page.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input'));
                const visible = inputs.find(i => {
                    const style = window.getComputedStyle(i);
                    return style.display !== 'none' &&
                           style.visibility !== 'hidden' &&
                           (i.placeholder || '').toLowerCase().includes('polygon');
                });
                return visible ? visible.id || visible.name || 'input' : null;
            });

            if (!input) throw new Error('Could not find wallet address input');

            await page.keyboard.type(walletAddress, { delay: 100 });
            await page.keyboard.press('Enter');
            console.log(`   ✓ Typed address and pressed Enter`);
        }

        // Wait for navigation to exchange page
        console.log(`   → Waiting for exchange page...`);
        await page.waitForURL(/\/exchange\?id=/, {
            timeout: 45000,
            waitUntil: 'domcontentloaded'
        });

        // Get the final URL
        const currentUrl = page.url();
        console.log(`   ✓ Redirected to: ${currentUrl}`);

        // Extract exchange ID from URL
        const urlObj = new URL(currentUrl);
        const exchangeId = urlObj.searchParams.get('id');

        if (!exchangeId) {
            // Take screenshot for debugging
            try {
                const screenshot = await page.screenshot({ fullPage: true });
                const fs = await import('fs');
                const filename = `error-${Date.now()}.png`;
                fs.writeFileSync(filename, screenshot);
                console.log(`   ⚠ Screenshot saved to ${filename}`);
            } catch (screenshotError) {
                console.error(`   ⚠ Could not save screenshot:`, screenshotError.message);
            }

            throw new Error(`Exchange ID not found in URL: ${currentUrl}`);
        }

        console.log(`   ✓ Exchange created: ${exchangeId}`);

        return {
            exchangeId,
            exchangeUrl: currentUrl
        };

    } catch (error) {
        console.error(`   ✗ Automation failed:`, error.message);

        // Try to capture screenshot on error
        if (page) {
            try {
                const screenshot = await page.screenshot({ fullPage: true });
                const fs = await import('fs');
                const filename = `error-${Date.now()}.png`;
                fs.writeFileSync(filename, screenshot);
                console.log(`   ⚠ Error screenshot saved to ${filename}`);
            } catch (screenshotError) {
                console.error(`   ⚠ Could not save error screenshot:`, screenshotError.message);
            }
        }

        throw error;
    } finally {
        if (browser) {
            await browser.close();
            console.log(`   ✓ Browser closed`);
        }
    }
}
