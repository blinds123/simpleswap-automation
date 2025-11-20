import puppeteer from 'puppeteer-core';
import dotenv from 'dotenv';

dotenv.config();

const BRIGHTDATA_CUSTOMER_ID = process.env.BRIGHTDATA_CUSTOMER_ID;
const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE;
const BRIGHTDATA_PASSWORD = process.env.BRIGHTDATA_PASSWORD;

if (!BRIGHTDATA_CUSTOMER_ID || !BRIGHTDATA_ZONE || !BRIGHTDATA_PASSWORD) {
    console.error('❌ Missing credentials in .env file');
    console.log('\nPlease create .env file with:');
    console.log('BRIGHTDATA_CUSTOMER_ID=your_customer_id');
    console.log('BRIGHTDATA_ZONE=your_zone_name');
    console.log('BRIGHTDATA_PASSWORD=your_password');
    process.exit(1);
}

const BRD_USERNAME = `brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${BRIGHTDATA_ZONE}`;

// Test both with and without Pro Mode parameter
const endpoints = [
    {
        name: 'Default (should include Pro Mode)',
        url: `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222`
    },
    {
        name: 'Explicit Pro Mode parameter',
        url: `wss://${BRD_USERNAME}:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:9222?pro=1`
    }
];

async function testConnection(endpoint) {
    console.log(`\n🧪 Testing: ${endpoint.name}`);
    console.log(`   Endpoint: ${endpoint.url.replace(BRIGHTDATA_PASSWORD, '***')}`);

    try {
        const browser = await puppeteer.connect({
            browserWSEndpoint: endpoint.url,
        });

        console.log('   ✅ Connected successfully!');

        const page = await browser.newPage();
        await page.goto('https://example.com', { waitUntil: 'networkidle2', timeout: 30000 });

        console.log('   ✅ Navigation successful!');
        console.log('   ✅ Pro Mode is WORKING!');

        await browser.close();
        return true;

    } catch (error) {
        console.log('   ❌ Connection failed:', error.message);
        return false;
    }
}

async function main() {
    console.log('🔍 BrightData Pro Mode Test\n');
    console.log('Testing your credentials and Pro Mode access...\n');

    let success = false;

    for (const endpoint of endpoints) {
        const result = await testConnection(endpoint);
        if (result) {
            success = true;
            console.log('\n✅ Your BrightData zone supports Pro Mode!');
            console.log('   You can proceed with the pool system.');
            break;
        }
    }

    if (!success) {
        console.log('\n❌ Could not connect with Pro Mode');
        console.log('\nPossible issues:');
        console.log('1. Zone is not "Browser API" / "Scraping Browser" type');
        console.log('2. Credentials are incorrect');
        console.log('3. Zone is not active/enabled');
        console.log('\nPlease check:');
        console.log('- https://brightdata.com/cp/zones');
        console.log('- Verify zone type is "Browser API" or "Scraping Browser"');
        console.log('- Check credentials in "Access parameters" tab');
    }
}

main();
