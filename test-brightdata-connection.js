import { chromium } from 'playwright';

// BrightData credentials from your screenshot
const BRIGHTDATA_CUSTOMER_ID = 'hl_9d12e57c';
const BRIGHTDATA_ZONE = 'scraping_browser1';
const BRIGHTDATA_PASSWORD = 'u2ynaxqh9899';

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const CDP_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

console.log('=== BrightData Connection Test ===');
console.log('CDP Endpoint:', CDP_ENDPOINT);
console.log('');

async function testConnection() {
    let browser;
    try {
        console.log('[1/4] Connecting to BrightData...');
        browser = await chromium.connectOverCDP(CDP_ENDPOINT);
        console.log('✓ Connected successfully!');

        console.log('[2/4] Getting browser context...');
        const context = browser.contexts()[0];
        console.log('✓ Context acquired');

        console.log('[3/4] Opening new page...');
        const page = context.pages()[0] || await context.newPage();
        console.log('✓ Page opened');

        console.log('[4/4] Navigating to test URL...');
        await page.goto('https://www.example.com', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        const title = await page.title();
        console.log(`✓ Page loaded successfully! Title: "${title}"`);

        console.log('\n✅ ALL TESTS PASSED - BrightData connection works!\n');

    } catch (error) {
        console.error('\n❌ TEST FAILED');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('\n');
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
    }
}

testConnection();
