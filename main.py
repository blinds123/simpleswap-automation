"""
SimpleSwap Exchange Automation - Browser Profile Approach
"""

import asyncio
from playwright.async_api import async_playwright
from apify import Actor
from apify.storage import KeyValueStore
import random
import json
import os
from datetime import datetime


class BrowserProfileManager:
    """
    Manages browser profiles for SimpleSwap automation.
    Handles saving/loading cookies, localStorage, and sessionStorage.
    """

    def __init__(self, actor):
        self.actor = actor
        self.key_value_store = None

    async def initialize(self):
        """Initialize the key value store for profile persistence."""
        self.key_value_store = await KeyValueStore.open()

    async def save_profile(self, context, profile_name="simpleswap_profile"):
        """
        Save complete browser profile state.

        Args:
            context: Playwright browser context
            profile_name: Name for the profile file

        Returns:
            dict: Saved profile data
        """
        try:
            # Get cookies
            cookies = await context.cookies()

            # Get localStorage and sessionStorage
            local_storage = await self._get_storage(context, 'localStorage')
            session_storage = await self._get_storage(context, 'sessionStorage')

            # Get user agent
            user_agent = await context.evaluate("() => navigator.userAgent")

            # Compile profile data
            profile_data = {
                "cookies": cookies,
                "localStorage": local_storage,
                "sessionStorage": session_storage,
                "userAgent": user_agent,
                "timestamp": Actor.now().isoformat(),
                "version": "1.0"
            }

            # Save to KeyValueStore
            await self.key_value_store.set_value(profile_name, profile_data)

            self.actor.log.info(f"✅ Profile saved: {profile_name}")
            self.actor.log.info(f"   Cookies: {len(cookies)}")
            self.actor.log.info(f"   LocalStorage keys: {len(local_storage or {})}")
            self.actor.log.info(f"   SessionStorage keys: {len(session_storage or {})}")

            return profile_data

        except Exception as e:
            self.actor.log.error(f"❌ Error saving profile: {str(e)}")
            return None

    async def load_profile(self, context, profile_name="simpleswap_profile"):
        """
        Load browser profile state.

        Args:
            context: Playwright browser context
            profile_name: Name of the profile to load

        Returns:
            bool: True if profile was loaded successfully
        """
        try:
            # Get profile data
            profile_data = await self.key_value_store.get_value(profile_name)

            if not profile_data:
                self.actor.log.warning(f"⚠️ Profile not found: {profile_name}")
                return False

            # Restore cookies
            if profile_data.get("cookies"):
                await context.add_cookies(profile_data["cookies"])
                self.actor.log.info(f"✅ Restored {len(profile_data['cookies'])} cookies")

            # Restore localStorage
            if profile_data.get("localStorage"):
                await self._restore_storage(context, profile_data["localStorage"], 'localStorage')
                self.actor.log.info(f"✅ Restored {len(profile_data['localStorage'])} localStorage items")

            # Restore sessionStorage
            if profile_data.get("sessionStorage"):
                await self._restore_storage(context, profile_data["sessionStorage"], 'sessionStorage')
                self.actor.log.info(f"✅ Restored {len(profile_data['sessionStorage'])} sessionStorage items")

            self.actor.log.info(f"✅ Profile loaded: {profile_name} (saved: {profile_data.get('timestamp')})")
            return True

        except Exception as e:
            self.actor.log.error(f"❌ Error loading profile: {str(e)}")
            return False

    async def profile_exists(self, profile_name="simpleswap_profile"):
        """
        Check if a profile exists.

        Args:
            profile_name: Name of the profile to check

        Returns:
            bool: True if profile exists
        """
        profile_data = await self.key_value_store.get_value(profile_name)
        return profile_data is not None

    async def delete_profile(self, profile_name="simpleswap_profile"):
        """
        Delete a browser profile.

        Args:
            profile_name: Name of the profile to delete
        """
        try:
            await self.key_value_store.set_value(profile_name, None)
            self.actor.log.info(f"🗑️ Profile deleted: {profile_name}")
            return True
        except Exception as e:
            self.actor.log.error(f"❌ Error deleting profile: {str(e)}")
            return False

    async def _get_storage(self, context, storage_type):
        """
        Get storage data from the page.

        Args:
            context: Playwright browser context
            storage_type: 'localStorage' or 'sessionStorage'

        Returns:
            dict: Storage data
        """
        try:
            return await context.evaluate(f"""
                () => {{
                    const storage = window.{storage_type};
                    const data = {{}};
                    for (let i = 0; i < storage.length; i++) {{
                        const key = storage.key(i);
                        const value = storage.getItem(key);
                        data[key] = value;
                    }}
                    return data;
                }}
            """)
        except Exception as e:
            self.actor.log.warning(f"⚠️ Could not get {storage_type}: {str(e)}")
            return {}

    async def _restore_storage(self, context, storage_data, storage_type):
        """
        Restore storage data to the page.

        Args:
            context: Playwright browser context
            storage_data: Dictionary of storage data
            storage_type: 'localStorage' or 'sessionStorage'
        """
        try:
            await context.evaluate(f"""
                (data) => {{
                    const storage = window.{storage_type};
                    storage.clear();
                    for (const [key, value] of Object.entries(data)) {{
                        storage.setItem(key, value);
                    }}
                    return Object.keys(data).length;
                }}
            """, storage_data)
        except Exception as e:
            self.actor.log.warning(f"⚠️ Could not restore {storage_type}: {str(e)}")

async def run_setup_mode(profile_manager, wallet_address, amount, from_currency, to_currency):
    """
    Setup mode: Try to create a browser profile with the wallet address.
    Since Apify cloud doesn't support GUI browsers, we'll attempt an automated
    approach and save the profile state regardless of outcome for manual testing.
    """
    Actor.log.info("="*60)
    Actor.log.info("🔧 SETUP MODE - Browser Profile Creation")
    Actor.log.info("="*60)
    Actor.log.info(f"Wallet Address: {wallet_address[:10]}...")
    Actor.log.info(f"Amount: {amount} {from_currency.upper()} → {to_currency.upper()}")
    Actor.log.info("="*60)

    url = f"https://simpleswap.io/exchange?from={from_currency}&to={to_currency}&rate=floating&amount={amount}"

    async with async_playwright() as playwright:
        # Note: In Apify cloud, headless must be True
        # For local testing with GUI, set headless=False
        headless_mode = Actor.configuration.headless if hasattr(Actor.configuration, 'headless') else True

        browser = await playwright.chromium.launch(
            headless=headless_mode,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        )

        # Use persistent context
        user_data_dir = Actor.get_user_data_dir() or "/tmp/browser_profile"
        context = await browser.new_context(
            user_data_dir=user_data_dir,
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
            Actor.log.info("🌐 Loading SimpleSwap page...")
            await page.goto(url, timeout=30000, wait_until="domcontentloaded")

            # Human-like pause
            await page.wait_for_timeout(random.randint(3000, 5000))

            # Try to enter the wallet address (this might not work, but we'll try)
            Actor.log.info("🔧 Attempting to enter wallet address...")
            try:
                # Find wallet input field
                await page.wait_for_selector('input[placeholder*="address" i]', timeout=15000)

                # Click input field
                await page.click('input[placeholder*="address" i]', timeout=5000)
                await page.wait_for_timeout(1000)

                # Type first few characters
                await page.keyboard.type(wallet_address[:10], delay=random.randint(50, 100))
                await page.wait_for_timeout(2000)

                # Try to find "Add a new address" link
                try:
                    await page.click('text="Add a new address"', timeout=5000)
                    await page.wait_for_timeout(2000)

                    # Fill modal if it appears
                    try:
                        await page.fill('input[placeholder*="Wallet address" i]', wallet_address, timeout=3000)
                        await page.wait_for_timeout(1000)

                        # Fill label field
                        await page.fill('input[placeholder*="Label" i]', 'My Polygon Wallet', timeout=3000)
                        await page.wait_for_timeout(1000)

                        # Click Add button
                        await page.click('button:has-text("Add")', timeout=3000)
                        Actor.log.info("✅ Attempted to add address to saved list")

                    except Exception as modal_error:
                        Actor.log.warning(f"⚠️ Could not complete modal: {modal_error}")

                except Exception as add_link_error:
                    Actor.log.warning(f"⚠️ Could not find 'Add a new address' link: {add_link_error}")

            except Exception as input_error:
                Actor.log.warning(f"⚠️ Could not interact with input field: {input_error}")

            # Save whatever state we managed to create
            Actor.log.info("💾 Saving browser profile state...")
            profile_saved = await profile_manager.save_profile(context)

            # Take screenshot for debugging
            try:
                await page.evaluate('window.scrollTo(0, 0)')
                await page.wait_for_timeout(500)
                await page.screenshot(path='setup_attempt.png')
                await Actor.set_value('setup_screenshot', await page.screenshot(), content_type='image/png')
            except:
                pass

            if headless_mode:
                # Cloud mode - provide instructions for local testing
                result = {
                    "status": "setup_info",
                    "wallet_address": wallet_address,
                    "amount": amount,
                    "from_currency": from_currency,
                    "to_currency": to_currency,
                    "message": "Setup mode attempted in headless environment. For full setup, run locally with headless=False.",
                    "profile_saved": profile_saved is not None,
                    "instructions": [
                        "1. Run this actor locally with headless=False",
                        "2. Or use the SimpleSwap website directly to add the wallet address",
                        "3. Then run in automation mode"
                    ],
                    "created_at": datetime.now().isoformat()
                }

                Actor.log.info("ℹ️ Setup completed with limited success in headless mode")
                Actor.log.info("   For full setup, run locally or add address manually")
            else:
                # Local GUI mode
                if profile_saved:
                    result = {
                        "status": "setup_completed",
                        "wallet_address": wallet_address,
                        "amount": amount,
                        "from_currency": from_currency,
                        "to_currency": to_currency,
                        "message": "Browser profile saved successfully. Ready for automation mode.",
                        "created_at": datetime.now().isoformat()
                    }

                    Actor.log.info("✅ Setup completed successfully!")
                    Actor.log.info("   Profile saved. You can now run in automation mode.")
                else:
                    result = {
                        "status": "setup_failed",
                        "error": "Failed to save browser profile",
                        "wallet_address": wallet_address,
                        "created_at": datetime.now().isoformat()
                    }

                    Actor.log.error("❌ Setup failed - could not save profile")

            await Actor.push_data(result)
            await Actor.set_value('OUTPUT', result)

        except Exception as e:
            Actor.log.exception(f"Setup error: {str(e)}")
            result = {
                "status": "setup_error",
                "error": str(e),
                "wallet_address": wallet_address,
                "created_at": datetime.now().isoformat()
            }
            await Actor.push_data(result)
            await Actor.set_value('OUTPUT', result)

        finally:
            await browser.close()


async def run_automation_mode(profile_manager, wallet_address, amount, from_currency, to_currency):
    """
    Automation mode: Use saved browser profile to create exchanges automatically.
    """
    Actor.log.info("="*60)
    Actor.log.info("🤖 AUTOMATION MODE - Creating Exchange")
    Actor.log.info("="*60)
    Actor.log.info(f"Wallet Address: {wallet_address[:10]}...")
    Actor.log.info(f"Amount: {amount} {from_currency.upper()} → {to_currency.upper()}")

    url = f"https://simpleswap.io/exchange?from={from_currency}&to={to_currency}&rate=floating&amount={amount}"

    async with async_playwright() as playwright:
        # Launch browser
        browser = await playwright.chromium.launch(
            headless=Actor.configuration.headless,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        )

        # Use persistent context
        user_data_dir = Actor.get_user_data_dir() or "/tmp/browser_profile"
        context = await browser.new_context(
            user_data_dir=user_data_dir,
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
            # Load saved profile
            Actor.log.info("📂 Loading browser profile...")
            profile_loaded = await profile_manager.load_profile(context)

            if not profile_loaded:
                Actor.log.error("❌ No saved profile found!")
                Actor.log.error("   Please run setup mode first to add wallet address")
                result = {
                    "status": "failed",
                    "error": "No saved profile found. Run setup mode first.",
                    "wallet_address": wallet_address,
                    "amount": amount,
                    "created_at": datetime.now().isoformat()
                }
                await Actor.push_data(result)
                await Actor.set_value('OUTPUT', result)
                return

            Actor.log.info("🌐 Loading SimpleSwap page...")
            await page.goto(url, timeout=30000, wait_until="domcontentloaded")

            # Human-like pause
            await page.wait_for_timeout(random.randint(3000, 5000))

            # Scroll
            await page.mouse.wheel(0, random.randint(100, 300))
            await page.wait_for_timeout(random.randint(1000, 2000))

            # Find wallet input field
            Actor.log.info("🔍 Finding wallet address field...")
            await page.wait_for_selector('input[placeholder*="address" i]', timeout=15000)

            # Try to close any warning/info messages that might block the input
            try:
                Actor.log.info("⚠️ Checking for blocking messages...")
                await page.click('[data-testid="info-message"] button, .message button, .alert button', timeout=2000)
                await page.wait_for_timeout(1000)
            except:
                pass

            # NEW APPROACH: Click input field to open dropdown, then select saved address
            Actor.log.info("📍 Clicking wallet address field...")
            try:
                await page.click('input[placeholder*="address" i]', timeout=5000)
            except:
                Actor.log.warning("Normal click failed, using force...")
                await page.click('input[placeholder*="address" i]', force=True)

            await page.wait_for_timeout(random.randint(1000, 2000))

            # Wait for dropdown to appear and look for saved address
            Actor.log.info("🔍 Looking for saved address in dropdown...")

            # Try to find the wallet address in the dropdown
            address_selector = f'text="{wallet_address}"'
            try:
                # Wait for the address to appear in dropdown
                await page.wait_for_selector(address_selector, timeout=10000)
                Actor.log.info("✅ Found saved address in dropdown!")

                # Click the saved address
                await page.click(address_selector)
                Actor.log.info("✅ Selected saved address")

            except Exception as e:
                Actor.log.warning(f"⚠️ Could not find saved address: {str(e)}")

                # Fallback: Try typing first few characters to trigger autocomplete
                Actor.log.info("🔄 Trying to trigger autocomplete...")
                await page.keyboard.type(wallet_address[:8], delay=random.randint(100, 150))
                await page.wait_for_timeout(2000)

                try:
                    await page.wait_for_selector(address_selector, timeout=5000)
                    await page.click(address_selector)
                    Actor.log.info("✅ Found and selected address after autocomplete")
                except:
                    Actor.log.error("❌ Could not find saved address in dropdown")
                    result = {
                        "status": "failed",
                        "error": "Saved address not found in dropdown. Profile may be invalid.",
                        "wallet_address": wallet_address,
                        "amount": amount,
                        "created_at": datetime.now().isoformat()
                    }
                    await Actor.push_data(result)
                    await Actor.set_value('OUTPUT', result)
                    return

            await page.wait_for_timeout(random.randint(2000, 3000))

            # Verify address is selected
            current_value = await page.evaluate("""
                () => {
                    const input = document.querySelector('input[placeholder*="address" i]');
                    return input ? input.value : null;
                }
            """)

            if current_value and wallet_address.lower() in current_value.lower():
                Actor.log.info(f"✅ Address selected: {current_value[:20]}...")
            else:
                Actor.log.error(f"❌ Address not properly selected. Field value: {current_value}")
                result = {
                    "status": "failed",
                    "error": "Address not selected properly",
                    "field_value": current_value,
                    "wallet_address": wallet_address,
                    "amount": amount,
                    "created_at": datetime.now().isoformat()
                }
                await Actor.push_data(result)
                await Actor.set_value('OUTPUT', result)
                return

            # Press Tab to move to next field and trigger validation
            await page.keyboard.press('Tab')
            await page.wait_for_timeout(random.randint(3000, 5000))

            # Wait for button to be enabled
            Actor.log.info("⏳ Waiting for Create Exchange button...")
            try:
                await page.wait_for_function(
                    """() => {
                        const btn = document.querySelector('button[data-testid="create-exchange-button"]');
                        return btn && !btn.disabled;
                    }""",
                    timeout=15000
                )
                Actor.log.info("✅ Button is enabled")
            except:
                Actor.log.warning("⚠️ Button might still be disabled, trying anyway...")

            # Scroll to top and take screenshot before clicking
            await page.evaluate('window.scrollTo(0, 0)')
            await page.wait_for_timeout(500)
            await page.screenshot(path='before_click.png')
            await Actor.set_value('before_click', await page.screenshot(), content_type='image/png')

            # Click button
            Actor.log.info("🎯 Clicking Create Exchange button...")
            await page.click('button:has-text("Create an exchange")', force=True)

            # Wait for response
            await page.wait_for_timeout(5000)

            # Scroll to top and take screenshot after clicking
            await page.evaluate('window.scrollTo(0, 0)')
            await page.wait_for_timeout(500)
            await page.screenshot(path='after_click.png')
            await Actor.set_value('after_click', await page.screenshot(), content_type='image/png')

            # Check for error messages on page
            error_messages = await page.locator('[role="alert"]').all_text_contents()
            if error_messages:
                Actor.log.warning(f"⚠️ Error messages on page: {error_messages}")

            # Dump page HTML for debugging
            page_html = await page.content()
            await Actor.set_value('page_html', page_html)

            # Check result
            current_url = page.url
            Actor.log.info(f"📍 Current URL: {current_url}")

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
                Actor.log.info(f"   Exchange ID: {exchange_id}")
                Actor.log.info(f"   URL: {current_url}")
                Actor.log.info("="*60)

                # Save updated profile after successful exchange
                Actor.log.info("💾 Saving updated profile...")
                await profile_manager.save_profile(context)

            else:
                result = {
                    "status": "failed",
                    "error": "No redirect to exchange page",
                    "current_url": current_url,
                    "wallet_address": wallet_address,
                    "amount": amount,
                    "created_at": datetime.now().isoformat()
                }

                Actor.log.error("❌ Exchange creation failed - no redirect")
                Actor.log.error(f"   Current URL: {current_url}")

            # Save result
            await Actor.push_data(result)
            await Actor.set_value('OUTPUT', result)

        except Exception as e:
            Actor.log.exception(f"❌ Automation error: {str(e)}")

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


async def main() -> None:
    async with Actor:
        # Get input
        actor_input = await Actor.get_input() or {}

        wallet_address = actor_input.get('wallet_address')
        amount = actor_input.get('amount', 25)
        from_currency = actor_input.get('from_currency', 'usd-usd')
        to_currency = actor_input.get('to_currency', 'pol-matic')
        setup_mode = actor_input.get('setup_mode', False)

        if not wallet_address:
            Actor.log.error("❌ Missing required input: wallet_address")
            await Actor.exit()
            return

        # Initialize profile manager
        profile_manager = BrowserProfileManager(Actor)
        await profile_manager.initialize()

        # Choose execution mode
        if setup_mode:
            await run_setup_mode(profile_manager, wallet_address, amount, from_currency, to_currency)
        else:
            await run_automation_mode(profile_manager, wallet_address, amount, from_currency, to_currency)

if __name__ == '__main__':
    asyncio.run(main())
