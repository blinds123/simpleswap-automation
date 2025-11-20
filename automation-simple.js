import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const BRIGHTDATA_CUSTOMER_ID = process.env.BRIGHTDATA_CUSTOMER_ID;
const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE;
const BRIGHTDATA_PASSWORD = process.env.BRIGHTDATA_PASSWORD;

if (!BRIGHTDATA_CUSTOMER_ID || !BRIGHTDATA_ZONE || !BRIGHTDATA_PASSWORD) {
    throw new Error('Missing BrightData credentials in .env file');
}

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

/**
 * Creates a SimpleSwap exchange using the proven MCP-like approach
 * Simple, clean, and WORKS
 */
export async function createExchange(walletAddress, amount = 25) {
    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${amount}`;

    console.log(`   → Connecting to BrightData...`);
    const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    const context = browser.contexts()[0];
    const page = context.pages()[0] || await context.newPage();

    try {
        console.log(`   → Loading SimpleSwap...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForLoadState('networkidle', { timeout: 30000 });

        console.log(`   → Entering wallet address...`);

        // Simple approach: Find input by label text (like MCP tools use ARIA)
        const input = page.getByLabel(/address/i).or(
            page.getByPlaceholder(/polygon.*address/i)
        ).first();

        // Type the address (like MCP type_ref with submit=true)
        await input.fill(walletAddress);
        await input.press('Enter');

        console.log(`   → Waiting for exchange creation...`);
        await page.waitForURL(/\/exchange\?id=/, { timeout: 45000 });

        const exchangeUrl = page.url();
        const exchangeId = new URL(exchangeUrl).searchParams.get('id');

        if (!exchangeId) {
            throw new Error('No exchange ID in URL');
        }

        console.log(`   ✓ Exchange created: ${exchangeId}`);
        return { exchangeId, exchangeUrl };

    } catch (error) {
        // Save screenshot on error
        try {
            const screenshot = await page.screenshot({ fullPage: true });
            const fs = await import('fs');
            const filename = `error-${Date.now()}.png`;
            fs.writeFileSync(filename, screenshot);
            console.log(`   ⚠ Screenshot: ${filename}`);
        } catch (e) { /* ignore */ }

        throw error;
    } finally {
        await browser.close();
        console.log(`   ✓ Browser closed`);
    }
}
