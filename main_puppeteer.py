"""
SimpleSwap Exchange Automation - Puppeteer Version
Using Crawlee's PuppeteerCrawler for Apify compatibility
"""

from apify import Actor
from crawlee.puppeteer_crawler import PuppeteerCrawler, PuppeteerCrawlingContext
import random
from datetime import datetime

async def create_simpleswap_exchange(wallet_address, amount, from_currency, to_currency):
    """
    Create SimpleSwap exchange using Puppeteer
    """

    url = f"https://simpleswap.io/exchange?from={from_currency}&to={to_currency}&rate=floating&amount={amount}"

    await Actor.log.info(f"🚀 Starting SimpleSwap automation")
    await Actor.log.info(f"   URL: {url}")
    await Actor.log.info(f"   Wallet: {wallet_address[:10]}...")

    result = {"status": "pending"}

    async def request_handler(context: PuppeteerCrawlingContext):
        nonlocal result
        page = context.page

        try:
            await Actor.log.info("📄 Page loaded")

            # Wait for page to load
            await page.wait_for_timeout(random.randint(3000, 5000))

            # Scroll
            await page.evaluate('window.scrollBy(0, 200)')
            await page.wait_for_timeout(random.randint(1000, 2000))

            # Find wallet input
            await Actor.log.info("🔍 Finding wallet address field...")
            await page.wait_for_selector('input[placeholder*="address" i]', {'timeout': 15000})

            # Fill wallet
            await Actor.log.info("✍️  Entering wallet address...")
            await page.type('input[placeholder*="address" i]', wallet_address, {'delay': random.randint(50, 150)})
            await page.wait_for_timeout(random.randint(1500, 2500))

            # Press Tab
            await page.keyboard.press('Tab')
            await page.wait_for_timeout(random.randint(2000, 3000))

            # Wait for button to enable
            await Actor.log.info("🔘 Waiting for button...")
            try:
                await page.wait_for_function(
                    '''() => {
                        const btn = document.querySelector('button[data-testid="create-exchange-button"]');
                        return btn && !btn.disabled;
                    }''',
                    {'timeout': 15000}
                )
                await Actor.log.info("✅ Button enabled")
            except:
                await Actor.log.warning("⚠️  Button might be disabled")

            # Click button
            await Actor.log.info("👆 Clicking Create Exchange...")
            await page.click('button:has-text("Create an exchange")', {'force': True})

            # Wait for response
            await page.wait_for_timeout(5000)

            current_url = page.url
            await Actor.log.info(f"🔗 Current URL: {current_url}")

            # Check result
            if "id=" in current_url:
                exchange_id = current_url.split("id=")[1].split("&")[0]

                result = {
                    "status": "success",
                    "wallet_address": wallet_address,
                    "amount": amount,
                    "from_currency": from_currency,
                    "to_currency": to_currency,
                    "exchange_id": exchange_id,
                    "exchange_url": current_url,
                    "created_at": datetime.now().isoformat()
                }

                await Actor.log.info("🎉 SUCCESS!")
                await Actor.log.info(f"   Exchange ID: {exchange_id}")
            else:
                result = {
                    "status": "failed",
                    "error": "No redirect to exchange page",
                    "current_url": current_url,
                    "wallet_address": wallet_address,
                    "amount": amount,
                    "created_at": datetime.now().isoformat()
                }
                await Actor.log.error("❌ Exchange creation failed")

        except Exception as e:
            await Actor.log.error(f"❌ ERROR: {str(e)}")
            result = {
                "status": "error",
                "error": str(e),
                "wallet_address": wallet_address,
                "amount": amount,
                "created_at": datetime.now().isoformat()
            }

    # Create crawler
    crawler = PuppeteerCrawler(
        request_handler=request_handler,
        headless=True,
        max_request_retries=0,
        browser_pool_options={
            'use_fingerprints': True,
        },
        launch_options={
            'args': [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        }
    )

    # Run crawler
    await crawler.run([url])

    return result


async def main():
    """
    Main Apify Actor entry point
    """
    async with Actor:
        actor_input = await Actor.get_input() or {}

        wallet_address = actor_input.get('wallet_address')
        amount = actor_input.get('amount', 25)
        from_currency = actor_input.get('from_currency', 'usd-usd')
        to_currency = actor_input.get('to_currency', 'pol-matic')

        if not wallet_address:
            await Actor.fail("Missing required input: wallet_address")
            return

        await Actor.log.info("="*60)
        await Actor.log.info("SimpleSwap Exchange Automation (Puppeteer)")
        await Actor.log.info("="*60)

        result = await create_simpleswap_exchange(
            wallet_address=wallet_address,
            amount=amount,
            from_currency=from_currency,
            to_currency=to_currency
        )

        await Actor.push_data(result)
        await Actor.set_value('OUTPUT', result)

        await Actor.log.info("="*60)
        await Actor.log.info(f"Status: {result.get('status')}")
        await Actor.log.info("="*60)


if __name__ == '__main__':
    import asyncio
    asyncio.run(main())
