/**
 * End-to-End Test: Netlify → Server → SimpleSwap Exchange
 *
 * Tests the complete user flow:
 * 1. Navigate to Netlify landing page
 * 2. Select an available size
 * 3. Click "ADD TO CART" button
 * 4. Verify redirect to SimpleSwap exchange URL from pool
 */

import { chromium } from 'playwright';

const NETLIFY_URL = 'https://beigesneaker.netlify.app';
const SERVER_URL = 'https://simpleswap-automation-1.onrender.com';

console.log('\n🧪 Starting End-to-End Test\n');
console.log(`Netlify: ${NETLIFY_URL}`);
console.log(`Server: ${SERVER_URL}\n`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
    // Step 1: Navigate to Netlify landing page
    console.log('Step 1: Loading Netlify landing page...');
    await page.goto(NETLIFY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('✓ Page loaded\n');

    // Take screenshot of landing page
    await page.screenshot({ path: '/Users/nelsonchan/Downloads/simpleswap-automation/test-screenshots/01-landing-page.png' });

    // Step 2: Select an available size to reveal "ADD TO CART" button
    console.log('Step 2: Looking for size selection buttons...');

    // Find an available size button (not SOLD)
    const sizeSelectors = [
        'button:has-text("7")',
        'button:has-text("8")',
        'button:has-text("9")',
        'button:has-text("6.5")',
        'button:has-text("7.5")'
    ];

    let sizeButton = null;
    for (const selector of sizeSelectors) {
        try {
            sizeButton = await page.locator(selector).first();
            if (await sizeButton.isVisible({ timeout: 2000 })) {
                const text = await sizeButton.textContent();
                if (!text.includes('SOLD')) {
                    console.log(`✓ Found available size: ${text}`);
                    break;
                }
            }
        } catch (e) {
            continue;
        }
    }

    if (!sizeButton) {
        throw new Error('Could not find available size button on page');
    }

    await page.screenshot({ path: '/Users/nelsonchan/Downloads/simpleswap-automation/test-screenshots/02-before-size-select.png' });

    console.log('Clicking size button...');
    await sizeButton.click();
    await page.waitForTimeout(1000); // Wait for Add to Cart button to appear

    // Step 3: Find and click "ADD TO CART" button
    console.log('Step 3: Looking for "ADD TO CART" button...');

    const addToCartButton = page.locator('button:has-text("ADD TO CART")').first();
    await addToCartButton.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Found "ADD TO CART" button');

    await page.screenshot({ path: '/Users/nelsonchan/Downloads/simpleswap-automation/test-screenshots/03-before-cart-click.png' });

    console.log('Clicking "ADD TO CART" button...');

    // Listen for navigation or new page
    const [response] = await Promise.all([
        page.waitForResponse(
            response => response.url().includes(SERVER_URL) || response.url().includes('simpleswap.io'),
            { timeout: 60000 }
        ).catch(() => null),
        addToCartButton.click()
    ]);

    await page.waitForTimeout(3000); // Wait for redirect

    const currentUrl = page.url();
    console.log(`✓ Current URL: ${currentUrl}\n`);

    await page.screenshot({ path: '/Users/nelsonchan/Downloads/simpleswap-automation/test-screenshots/04-after-click.png' });

    // Step 4: Verify we're on SimpleSwap exchange page
    console.log('Step 4: Verifying exchange URL...');

    if (currentUrl.includes('simpleswap.io/exchange?id=')) {
        const urlParams = new URL(currentUrl).searchParams;
        const exchangeId = urlParams.get('id');

        console.log('✅ SUCCESS! Redirected to SimpleSwap exchange');
        console.log(`Exchange ID: ${exchangeId}`);
        console.log(`Full URL: ${currentUrl}\n`);

        // Verify the page content
        await page.waitForSelector('body', { timeout: 10000 });
        const pageTitle = await page.title();
        console.log(`Page Title: ${pageTitle}`);

        // Take final screenshot
        await page.screenshot({
            path: '/Users/nelsonchan/Downloads/simpleswap-automation/test-screenshots/05-exchange-page.png',
            fullPage: true
        });

        console.log('\n═══════════════════════════');
        console.log('✅ END-TO-END TEST PASSED');
        console.log('═══════════════════════════\n');

        console.log('Test Results:');
        console.log(`✓ Netlify page loads correctly`);
        console.log(`✓ Size selection works`);
        console.log(`✓ "ADD TO CART" button found and clickable`);
        console.log(`✓ Redirects to SimpleSwap exchange`);
        console.log(`✓ Valid exchange ID: ${exchangeId}\n`);

    } else {
        throw new Error(`Expected SimpleSwap exchange URL, but got: ${currentUrl}`);
    }

} catch (error) {
    console.error('\n❌ TEST FAILED');
    console.error(`Error: ${error.message}\n`);

    // Take error screenshot
    try {
        await page.screenshot({
            path: '/Users/nelsonchan/Downloads/simpleswap-automation/test-screenshots/error.png',
            fullPage: true
        });
        console.log('Error screenshot saved to test-screenshots/error.png');
    } catch (e) {
        console.error('Could not save error screenshot');
    }

    // Get page content for debugging
    const currentUrl = page.url();
    console.error(`Current URL: ${currentUrl}`);

    const pageContent = await page.content();
    console.error(`Page content length: ${pageContent.length} characters\n`);

    throw error;

} finally {
    await browser.close();
}
