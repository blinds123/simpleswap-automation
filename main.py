"""
SimpleSwap Exchange Automation - Official Apify Playwright Pattern
"""

import asyncio
from playwright.async_api import async_playwright
from apify import Actor
import random
from datetime import datetime

async def main() -> None:
    async with Actor:
        # Get input
        actor_input = await Actor.get_input() or {}

        wallet_address = actor_input.get('wallet_address')
        amount = actor_input.get('amount', 25)
        from_currency = actor_input.get('from_currency', 'usd-usd')
        to_currency = actor_input.get('to_currency', 'pol-matic')

        if not wallet_address:
            Actor.log.error("Missing required input: wallet_address")
            await Actor.exit()
            return

        # Build URL
        url = f"https://simpleswap.io/exchange?from={from_currency}&to={to_currency}&rate=floating&amount={amount}"

        Actor.log.info("="*60)
        Actor.log.info("SimpleSwap Exchange Automation")
        Actor.log.info("="*60)
        Actor.log.info(f"URL: {url}")
        Actor.log.info(f"Wallet: {wallet_address[:10]}...")

        # Launch Playwright
        Actor.log.info("Launching Playwright...")

        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(
                headless=Actor.config.headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                ]
            )

            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                locale='en-US',
                timezone_id='America/New_York',
            )

            page = await context.new_page()

            # Anti-detection
            await page.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                window.chrome = { runtime: {} };
            """)

            try:
                Actor.log.info("Loading SimpleSwap page...")
                await page.goto(url, timeout=30000, wait_until="domcontentloaded")

                # Human-like pause
                await page.wait_for_timeout(random.randint(3000, 5000))

                # Scroll
                await page.mouse.wheel(0, random.randint(100, 300))
                await page.wait_for_timeout(random.randint(1000, 2000))

                # Find and fill wallet
                Actor.log.info("Finding wallet address field...")
                await page.wait_for_selector('input[placeholder*="address" i]', timeout=15000)

                Actor.log.info("Entering wallet address...")
                wallet_input = await page.query_selector('input[placeholder*="address" i]')
                await wallet_input.fill(wallet_address)
                await page.wait_for_timeout(random.randint(1500, 2500))

                # Press Tab to trigger validation
                await page.keyboard.press('Tab')
                await page.wait_for_timeout(random.randint(2000, 3000))

                # Wait for button to be enabled
                Actor.log.info("Waiting for Create Exchange button...")
                try:
                    await page.wait_for_function(
                        """() => {
                            const btn = document.querySelector('button[data-testid="create-exchange-button"]');
                            return btn && !btn.disabled;
                        }""",
                        timeout=15000
                    )
                    Actor.log.info("Button is enabled")
                except:
                    Actor.log.warning("Button might still be disabled, trying anyway...")

                # Click button
                Actor.log.info("Clicking Create Exchange button...")
                await page.click('button:has-text("Create an exchange")', force=True)

                # Wait for response
                await page.wait_for_timeout(5000)

                # Check result
                current_url = page.url
                Actor.log.info(f"Current URL: {current_url}")

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

                    Actor.log.info("="*60)
                    Actor.log.info("🎉 SUCCESS! Exchange created!")
                    Actor.log.info(f"Exchange ID: {exchange_id}")
                    Actor.log.info(f"URL: {current_url}")
                    Actor.log.info("="*60)

                else:
                    result = {
                        "status": "failed",
                        "error": "No redirect to exchange page",
                        "current_url": current_url,
                        "wallet_address": wallet_address,
                        "amount": amount,
                        "created_at": datetime.now().isoformat()
                    }

                    Actor.log.error("Exchange creation failed - no redirect")
                    Actor.log.error(f"Current URL: {current_url}")

                # Save result
                await Actor.push_data(result)
                await Actor.set_value('OUTPUT', result)

            except Exception as e:
                Actor.log.exception(f"Error during automation: {str(e)}")

                result = {
                    "status": "error",
                    "error": str(e),
                    "wallet_address": wallet_address,
                    "amount": amount,
                    "created_at": datetime.now().isoformat()
                }

                await Actor.push_data(result)
                await Actor.set_value('OUTPUT', result)

            finally:
                await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
