const { Actor } = require("apify");
const puppeteer = require("puppeteer");

// --- ⚠️ ACTION REQUIRED: INSERT YOUR BRIGHT DATA CREDENTIALS HERE ---
// 1. Sign up for a free account at: https://brightdata.com/ai/mcp-server
// 2. In your dashboard, go to "Proxies & Scraping Infrastructure".
// 3. Create a new "Scraping Browser" zone.
// 4. In the "Access parameters" for that zone, find your credentials.
// 5. Paste the Customer ID, Zone name, and Password below.

const BRIGHTDATA_CUSTOMER_ID = 'YOUR_CUSTOMER_ID';
const BRIGHTDATA_ZONE = 'YOUR_ZONE_NAME';
const BRIGHTDATA_PASSWORD = 'YOUR_ZONE_PASSWORD';

// --- Do not edit below this line ---

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;
const BROWSER_WSE_ENDPOINT = `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`;

Actor.main(async () => {
    const input = await Actor.getInput();
    const { wallet_address, amount = 25 } = input;

    if (!wallet_address) {
        await Actor.fail("Missing required input: wallet_address");
        return;
    }

    if (BRIGHTDATA_CUSTOMER_ID.includes('YOUR_')) {
        await Actor.fail("ERROR: Bright Data credentials are not set in main.js. Please follow the instructions to add them.");
        return;
    }

    const url = `https://simpleswap.io/exchange?from=usd-usd&to=pol-matic&rate=floating&amount=${amount}`;
    
    Actor.log.info("▶️ Starting SimpleSwap automation via Bright Data Scraping Browser...");
    Actor.log.info(`   Connecting to remote browser...`);

    let browser;
    try {
        browser = await puppeteer.connect({
            browserWSEndpoint: BROWSER_WSE_ENDPOINT,
        });

        const page = await browser.newPage();
        Actor.log.info("✅ Connected to Bright Data Scraping Browser.");

        Actor.log.info(`   Navigating to: ${url}`);
        await page.goto(url, { timeout: 120000, waitUntil: "networkidle2" });
        Actor.log.info("✅ Page loaded successfully via Bright Data.");

        const addressInputSelector = 'input[placeholder*="address" i]';
        await page.waitForSelector(addressInputS elector, { timeout: 20000 });

        await page.type(addressInputSelector, wallet_address, { delay: 110 });
        Actor.log.info("✅ Finished typing address.");

        const createButtonSelector = 'button[data-testid="create-exchange-button"]';
        await page.waitForFunction(
            (selector) => document.querySelector(selector) && !document.querySelector(selector).disabled,
            { timeout: 20000 },
            createButtonSelector
        );
        Actor.log.info("✅ 'Create an exchange' button is enabled.");
        
        await page.click(createButtonSelector);
        await page.waitForNavigation({ timeout: 45000, waitUntil: 'networkidle2' });

        const currentUrl = page.url();
        Actor.log.info(`✅ Redirected to final page: ${currentUrl}`);

        if (currentUrl.includes("?id=")) {
            const urlParams = new new URL(currentUrl).searchParams;
            const exchange_id = urlParams.get('id');
            const finalResult = {
                status: "success",
                method: "Bright Data Scraping Browser",
                exchange_id: exchange_id,
                exchange_url: currentUrl,
            };
            await Actor.setValue("OUTPUT", finalResult);
            await Actor.exit(`✅ Exchange created successfully: ${exchange_id}`);
        } else {
            throw new Error("Failed to extract exchange ID from final URL.");
        }

    } catch (e) {
        Actor.log.error(`❌ Automation failed: ${e.message}`, { stack: e.stack });
        try {
            const screenshot = await page.screenshot({ fullPage: true });
            await Actor.setValue("screenshot_on_error.png", screenshot, { contentType: "image/png" });
        } catch (screenshotError) {
            Actor.log.error(`   Could not take screenshot: ${screenshotError.message}`);
        }
        await Actor.fail(`Automation failed. See log for details.`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});
