"""
SimpleSwap Exchange Automation - Apify Actor
Automates exchange creation on SimpleSwap with maximum stealth
"""

from apify import Actor
from playwright.async_api import async_playwright
import random
import time
from datetime import datetime

async def create_simpleswap_exchange(wallet_address, amount, from_currency, to_currency, headless=True):
    """
    Create SimpleSwap exchange with maximum human-like behavior

    Args:
        wallet_address: Polygon wallet address
        amount: Amount in USD
        from_currency: Currency to send (e.g., "usd-usd")
        to_currency: Currency to receive (e.g., "pol-matic")
        headless: Run in headless mode

    Returns:
        dict: Exchange details or error
    """

    # Build pre-formatted URL
    url = f"https://simpleswap.io/exchange?from={from_currency}&to={to_currency}&rate=floating&amount={amount}"

    await Actor.log.info(f"🚀 Starting SimpleSwap automation")
    await Actor.log.info(f"   URL: {url}")
    await Actor.log.info(f"   Wallet: {wallet_address[:10]}...")

    async with async_playwright() as p:
        # Launch browser with maximum stealth
        browser = await p.chromium.launch(
            headless=headless,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ]
        )

        # Create context with realistic fingerprint
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='en-US',
            timezone_id='America/New_York',
            permissions=['geolocation'],
            geolocation={'longitude': -74.0060, 'latitude': 40.7128},
            color_scheme='light',
        )

        page = await context.new_page()

        # Remove webdriver traces
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        """)

        try:
            # Navigate to page
            await Actor.log.info("📄 Loading SimpleSwap page...")
            await page.goto(url, timeout=30000, wait_until="domcontentloaded")

            # Human-like pause (reading page)
            await page.wait_for_timeout(random.randint(3000, 5000))

            # Scroll like reading
            await page.mouse.wheel(0, random.randint(100, 300))
            await page.wait_for_timeout(random.randint(1000, 2000))

            # Find wallet input
            await Actor.log.info("🔍 Finding wallet address field...")
            wallet_input = page.locator('input[placeholder*="address" i]').first
            await wallet_input.wait_for(state="visible", timeout=15000)

            # Fill wallet address
            await Actor.log.info("✍️  Entering wallet address...")
            await wallet_input.fill(wallet_address)
            await page.wait_for_timeout(random.randint(1500, 2500))

            # Trigger validation (Tab key)
            await wallet_input.press("Tab")
            await page.wait_for_timeout(random.randint(2000, 3000))

            # Find Create Exchange button
            await Actor.log.info("🔘 Looking for 'Create an exchange' button...")

            # Wait for button to become enabled
            try:
                await page.wait_for_function(
                    """
                    () => {
                        const btn = document.querySelector('button[data-testid="create-exchange-button"]');
                        return btn && !btn.disabled;
                    }
                    """,
                    timeout=15000
                )
                await Actor.log.info("✅ Button is enabled")
            except:
                await Actor.log.warning("⚠️  Button might still be disabled, trying anyway...")

            # Click button
            exchange_btn = page.locator('button:has-text("Create an exchange")').first
            await page.wait_for_timeout(random.randint(1000, 2000))

            await Actor.log.info("👆 Clicking 'Create an exchange'...")
            await exchange_btn.click(force=True)

            # Wait for response
            await page.wait_for_timeout(5000)

            # Check result
            current_url = page.url
            await Actor.log.info(f"🔗 Current URL: {current_url}")

            # Check if exchange was created
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

                await Actor.log.info("🎉 SUCCESS! Exchange created!")
                await Actor.log.info(f"   Exchange ID: {exchange_id}")
                await Actor.log.info(f"   URL: {current_url}")

                return result
            else:
                await Actor.log.error("❌ Exchange creation failed - no redirect")

                return {
                    "status": "failed",
                    "error": "No redirect to exchange page",
                    "current_url": current_url,
                    "wallet_address": wallet_address,
                    "amount": amount,
                    "created_at": datetime.now().isoformat()
                }

        except Exception as e:
            await Actor.log.error(f"❌ ERROR: {str(e)}")

            return {
                "status": "error",
                "error": str(e),
                "wallet_address": wallet_address,
                "amount": amount,
                "created_at": datetime.now().isoformat()
            }

        finally:
            await browser.close()


async def main():
    """
    Main Apify Actor entry point
    """
    async with Actor:
        # Get input
        actor_input = await Actor.get_input() or {}

        wallet_address = actor_input.get('wallet_address')
        amount = actor_input.get('amount', 25)
        from_currency = actor_input.get('from_currency', 'usd-usd')
        to_currency = actor_input.get('to_currency', 'pol-matic')
        headless = actor_input.get('headless', True)

        # Validate input
        if not wallet_address:
            await Actor.fail("Missing required input: wallet_address")
            return

        await Actor.log.info("="*60)
        await Actor.log.info("SimpleSwap Exchange Automation")
        await Actor.log.info("="*60)

        # Run automation
        result = await create_simpleswap_exchange(
            wallet_address=wallet_address,
            amount=amount,
            from_currency=from_currency,
            to_currency=to_currency,
            headless=headless
        )

        # Save result to dataset
        await Actor.push_data(result)

        # Set output
        await Actor.set_value('OUTPUT', result)

        await Actor.log.info("="*60)
        await Actor.log.info(f"Status: {result.get('status')}")
        await Actor.log.info("="*60)


if __name__ == '__main__':
    import asyncio
    asyncio.run(main())
