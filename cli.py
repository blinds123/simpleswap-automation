"""
SimpleSwap Automation CLI
Unified command-line interface for SimpleSwap automation with browser profiles.
"""

import asyncio
import json
import click
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
import requests
from dataclasses import dataclass
import inquirer

# Configuration
APIFY_TOKEN = os.getenv('APIFY_TOKEN')
if not APIFY_TOKEN:
    raise ValueError("APIFY_TOKEN environment variable required")
ACTOR_ID = "DsCczYpxTSp2ATS6D"
CONFIG_DIR = Path.home() / ".simpleswap"
CONFIG_FILE = CONFIG_DIR / "config.json"

@dataclass
class SimpleSwapConfig:
    """Configuration for SimpleSwap automation"""
    default_wallet: Optional[str] = None
    default_amount: float = 25.0
    default_from_currency: str = "usd-usd"
    default_to_currency: str = "pol-matic"
    profiles: Dict[str, str] = None  # name -> wallet_address mapping

    def __post_init__(self):
        if self.profiles is None:
            self.profiles = {}

class SimpleSwapCLI:
    """Main CLI class for SimpleSwap automation"""

    def __init__(self):
        self.config = self.load_config()
        self.ensure_config_dir()

    def ensure_config_dir(self):
        """Ensure configuration directory exists"""
        CONFIG_DIR.mkdir(exist_ok=True)

    def load_config(self) -> SimpleSwapConfig:
        """Load configuration from file"""
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, 'r') as f:
                    data = json.load(f)
                    return SimpleSwapConfig(**data)
            except Exception as e:
                click.echo(f"Warning: Could not load config: {e}")
        return SimpleSwapConfig()

    def save_config(self):
        """Save configuration to file"""
        try:
            with open(CONFIG_FILE, 'w') as f:
                json.dump({
                    'default_wallet': self.config.default_wallet,
                    'default_amount': self.config.default_amount,
                    'default_from_currency': self.config.default_from_currency,
                    'default_to_currency': self.config.default_to_currency,
                    'profiles': self.config.profiles
                }, f, indent=2)
        except Exception as e:
            click.echo(f"Error saving config: {e}", err=True)

    def trigger_apify_run(self, wallet_address: str, amount: float,
                         from_currency: str, to_currency: str,
                         setup_mode: bool = False) -> Dict[str, Any]:
        """Trigger Apify actor run"""
        url = f"https://api.apify.com/v2/acts/{ACTOR_ID}/runs"
        headers = {
            'Authorization': f'Bearer {APIFY_TOKEN}',
            'Content-Type': 'application/json'
        }

        payload = {
            'wallet_address': wallet_address,
            'amount': amount,
            'from_currency': from_currency,
            'to_currency': to_currency,
            'setup_mode': setup_mode
        }

        try:
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            raise click.ClickException(f"Failed to trigger run: {e}")

    def check_run_status(self, run_id: str) -> Dict[str, Any]:
        """Check status of Apify run"""
        url = f"https://api.apify.com/v2/acts/{ACTOR_ID}/runs/{run_id}"
        headers = {'Authorization': f'Bearer {APIFY_TOKEN}'}

        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            raise click.ClickException(f"Failed to check status: {e}")

    def get_run_result(self, store_id: str) -> Dict[str, Any]:
        """Get result from Apify run"""
        url = f"https://api.apify.com/v2/key-value-stores/{store_id}/records/OUTPUT"
        headers = {'Authorization': f'Bearer {APIFY_TOKEN}'}

        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            raise click.ClickException(f"Failed to get result: {e}")

    def wait_for_completion(self, run_id: str, timeout: int = 300) -> Dict[str, Any]:
        """Wait for run completion with progress indicator"""
        import time

        start_time = time.time()
        with click.progressbar(length=100, label='Processing') as bar:
            while True:
                if time.time() - start_time > timeout:
                    raise click.ClickException("Timeout waiting for completion")

                status_data = self.check_run_status(run_id)
                status = status_data['data']['status']

                if status == 'SUCCEEDED':
                    bar.update(100)
                    break
                elif status == 'FAILED':
                    bar.update(100)
                    raise click.ClickException(f"Run failed: {status_data['data'].get('status', 'Unknown error')}")
                elif status == 'RUNNING':
                    # Update progress based on estimated time
                    elapsed = time.time() - start_time
                    progress = min(90, int((elapsed / timeout) * 90))
                    bar.update(progress)

                time.sleep(5)

        return status_data

@click.group()
@click.version_option(version='1.0.0')
def cli():
    """
    SimpleSwap Automation CLI

    Automated cryptocurrency exchange creation using browser profiles.
    """
    pass

@cli.command()
@click.option('--wallet', '-w', help='Polygon wallet address')
@click.option('--amount', '-a', type=float, help='Amount in USD')
@click.option('--from-currency', '-f', default='usd-usd', help='Source currency')
@click.option('--to-currency', '-t', default='pol-matic', help='Target currency')
@click.option('--profile', '-p', help='Use saved profile')
@click.option('--async-run', is_flag=True, help='Run asynchronously and return run ID')
@click.option('--setup', is_flag=True, help='Run setup mode to save wallet address')
def swap(wallet, amount, from_currency, to_currency, profile, async_run, setup):
    """
    Create a SimpleSwap exchange.

    Examples:
        simpleswap swap --wallet 0x1372Ad41B513b9d6eC008086C03d69C635bAE578 --amount 50
        simpleswap swap --profile my_wallet --amount 100
        simpleswap swap --setup --wallet 0x1372Ad41B513b9d6eC008086C03d69C635bAE578
    """
    cli_instance = SimpleSwapCLI()

    # Use profile if specified
    if profile:
        if profile not in cli_instance.config.profiles:
            raise click.ClickException(f"Profile '{profile}' not found. Use 'simpleswap profiles' to manage profiles.")
        wallet = cli_instance.config.profiles[profile]

    # Use defaults if not provided
    if not wallet:
        wallet = cli_instance.config.default_wallet
        if not wallet:
            raise click.ClickException("Wallet address required. Use --wallet or set default with 'simpleswap config'.")

    if not amount:
        amount = cli_instance.config.default_amount

    click.echo(f"🚀 Starting SimpleSwap exchange...")
    click.echo(f"   Wallet: {wallet[:10]}...{wallet[-6:]}")
    click.echo(f"   Amount: ${amount} USD")
    click.echo(f"   Exchange: {from_currency.upper()} → {to_currency.upper()}")

    if setup:
        click.echo(f"   Mode: Setup (saving wallet address)")
    else:
        click.echo(f"   Mode: Automation")

    try:
        # Trigger the run
        result = cli_instance.trigger_apify_run(wallet, amount, from_currency, to_currency, setup)
        run_id = result['data']['id']

        if async_run:
            click.echo(f"✅ Run started successfully!")
            click.echo(f"   Run ID: {run_id}")
            click.echo(f"   Check status: simpleswap status {run_id}")
            return

        # Wait for completion
        click.echo("⏳ Processing exchange...")
        status_data = cli_instance.wait_for_completion(run_id)
        store_id = status_data['data']['defaultKeyValueStoreId']

        # Get result
        final_result = cli_instance.get_run_result(store_id)

        if final_result.get('status') == 'success':
            click.echo("🎉 SUCCESS! Exchange created!")
            click.echo(f"   Exchange ID: {final_result.get('exchange_id')}")
            click.echo(f"   Exchange URL: {final_result.get('exchange_url')}")
        else:
            click.echo("❌ Exchange creation failed")
            click.echo(f"   Error: {final_result.get('error', 'Unknown error')}")

    except Exception as e:
        raise click.ClickException(str(e))

@cli.command()
@click.argument('run_id')
def status(run_id):
    """Check status of a SimpleSwap run."""
    cli_instance = SimpleSwapCLI()

    try:
        status_data = cli_instance.check_run_status(run_id)
        status = status_data['data']['status']

        click.echo(f"Run ID: {run_id}")
        click.echo(f"Status: {status}")

        if status == 'SUCCEEDED':
            click.echo("✅ Run completed successfully!")
            store_id = status_data['data']['defaultKeyValueStoreId']
            result = cli_instance.get_run_result(store_id)
            click.echo(f"Result: {json.dumps(result, indent=2)}")
        elif status == 'FAILED':
            click.echo("❌ Run failed")
        else:
            click.echo("⏳ Run in progress...")

    except Exception as e:
        raise click.ClickException(str(e))

@cli.command()
@click.argument('run_id')
def result(run_id):
    """Get result of a completed SimpleSwap run."""
    cli_instance = SimpleSwapCLI()

    try:
        status_data = cli_instance.check_run_status(run_id)
        store_id = status_data['data']['defaultKeyValueStoreId']
        result = cli_instance.get_run_result(store_id)

        click.echo(json.dumps(result, indent=2))

    except Exception as e:
        raise click.ClickException(str(e))

@cli.group()
def profiles():
    """Manage wallet profiles."""
    pass

@profiles.command('list')
def list_profiles():
    """List saved wallet profiles."""
    cli_instance = SimpleSwapCLI()

    if not cli_instance.config.profiles:
        click.echo("No profiles saved.")
        return

    click.echo("Saved Profiles:")
    for name, wallet in cli_instance.config.profiles.items():
        click.echo(f"  {name}: {wallet[:10]}...{wallet[-6:]}")

@profiles.command('add')
@click.argument('name')
@click.argument('wallet')
def add_profile(name, wallet):
    """Add a new wallet profile."""
    cli_instance = SimpleSwapCLI()

    cli_instance.config.profiles[name] = wallet
    cli_instance.save_config()

    click.echo(f"✅ Profile '{name}' added successfully!")

@profiles.command('remove')
@click.argument('name')
@click.confirmation_option(prompt='Are you sure you want to remove this profile?')
def remove_profile(name):
    """Remove a wallet profile."""
    cli_instance = SimpleSwapCLI()

    if name not in cli_instance.config.profiles:
        raise click.ClickException(f"Profile '{name}' not found.")

    del cli_instance.config.profiles[name]
    cli_instance.save_config()

    click.echo(f"✅ Profile '{name}' removed successfully!")

@cli.group()
def config():
    """Manage SimpleSwap configuration."""
    pass

@config.command('show')
def show_config():
    """Show current configuration."""
    cli_instance = SimpleSwapCLI()

    click.echo("Current Configuration:")
    click.echo(f"  Default Wallet: {cli_instance.config.default_wallet or 'Not set'}")
    click.echo(f"  Default Amount: ${cli_instance.config.default_amount}")
    click.echo(f"  Default From: {cli_instance.config.default_from_currency}")
    click.echo(f"  Default To: {cli_instance.config.default_to_currency}")
    click.echo(f"  Saved Profiles: {len(cli_instance.config.profiles)}")

@config.command('set')
@click.option('--wallet', help='Default wallet address')
@click.option('--amount', type=float, help='Default amount in USD')
@click.option('--from-currency', help='Default source currency')
@click.option('--to-currency', help='Default target currency')
def set_config(wallet, amount, from_currency, to_currency):
    """Set configuration values."""
    cli_instance = SimpleSwapCLI()

    if wallet:
        cli_instance.config.default_wallet = wallet
    if amount:
        cli_instance.config.default_amount = amount
    if from_currency:
        cli_instance.config.default_from_currency = from_currency
    if to_currency:
        cli_instance.config.default_to_currency = to_currency

    cli_instance.save_config()
    click.echo("✅ Configuration updated successfully!")

@cli.command()
def interactive():
    """Interactive mode for SimpleSwap operations."""
    cli_instance = SimpleSwapCLI()

    click.echo("🎯 SimpleSwap Interactive Mode")
    click.echo("=" * 40)

    # Main menu
    while True:
        choices = [
            'Create Exchange',
            'Setup Mode (Add Wallet)',
            'Manage Profiles',
            'View Configuration',
            'Check Run Status',
            'Exit'
        ]

        action = inquirer.list_input('What would you like to do?', choices=choices)

        if action == 'Exit':
            break
        elif action == 'Create Exchange':
            _interactive_swap(cli_instance)
        elif action == 'Setup Mode (Add Wallet)':
            _interactive_setup(cli_instance)
        elif action == 'Manage Profiles':
            _interactive_profiles(cli_instance)
        elif action == 'View Configuration':
            _interactive_config(cli_instance)
        elif action == 'Check Run Status':
            _interactive_status(cli_instance)

def _interactive_swap(cli_instance):
    """Interactive swap creation"""
    # Choose wallet
    if cli_instance.config.profiles:
        use_profile = inquirer.confirm('Use saved profile?')
        if use_profile:
            profile_choices = list(cli_instance.config.profiles.keys())
            profile = inquirer.list_input('Select profile:', choices=profile_choices)
            wallet = cli_instance.config.profiles[profile]
        else:
            wallet = inquirer.text('Enter wallet address:')
    else:
        wallet = inquirer.text('Enter wallet address:')

    # Amount
    amount = inquirer.text('Enter amount in USD:', default=str(cli_instance.config.default_amount))

    # Currencies
    from_currency = inquirer.text('From currency:', default=cli_instance.config.default_from_currency)
    to_currency = inquirer.text('To currency:', default=cli_instance.config.default_to_currency)

    # Execute
    try:
        result = cli_instance.trigger_apify_run(
            wallet, float(amount), from_currency, to_currency, False
        )
        run_id = result['data']['id']
        click.echo(f"✅ Exchange started! Run ID: {run_id}")

        check_now = inquirer.confirm('Check status now?')
        if check_now:
            status_data = cli_instance.wait_for_completion(run_id)
            store_id = status_data['data']['defaultKeyValueStoreId']
            final_result = cli_instance.get_run_result(store_id)

            if final_result.get('status') == 'success':
                click.echo("🎉 Exchange created successfully!")
                click.echo(f"Exchange ID: {final_result.get('exchange_id')}")
            else:
                click.echo("❌ Exchange failed")
                click.echo(f"Error: {final_result.get('error')}")

    except Exception as e:
        click.echo(f"❌ Error: {e}")

def _interactive_setup(cli_instance):
    """Interactive setup mode"""
    wallet = inquirer.text('Enter wallet address to setup:')

    # Save profile option
    save_profile = inquirer.confirm('Save as profile?')
    if save_profile:
        profile_name = inquirer.text('Profile name:')
        cli_instance.config.profiles[profile_name] = wallet
        cli_instance.save_config()
        click.echo(f"✅ Profile '{profile_name}' saved!")

    # Run setup
    try:
        result = cli_instance.trigger_apify_run(
            wallet, 25, 'usd-usd', 'pol-matic', True
        )
        run_id = result['data']['id']
        click.echo(f"✅ Setup started! Run ID: {run_id}")
        click.echo("This will create a browser profile with your wallet address.")

    except Exception as e:
        click.echo(f"❌ Error: {e}")

def _interactive_profiles(cli_instance):
    """Interactive profile management"""
    if not cli_instance.config.profiles:
        click.echo("No profiles saved.")
        return

    action = inquirer.list_input('Profile action:', choices=['List', 'Add', 'Remove'])

    if action == 'List':
        click.echo("Saved Profiles:")
        for name, wallet in cli_instance.config.profiles.items():
            click.echo(f"  {name}: {wallet[:10]}...{wallet[-6:]}")
    elif action == 'Add':
        name = inquirer.text('Profile name:')
        wallet = inquirer.text('Wallet address:')
        cli_instance.config.profiles[name] = wallet
        cli_instance.save_config()
        click.echo(f"✅ Profile '{name}' added!")
    elif action == 'Remove':
        profile_choices = list(cli_instance.config.profiles.keys())
        profile = inquirer.list_input('Select profile to remove:', choices=profile_choices)
        del cli_instance.config.profiles[profile]
        cli_instance.save_config()
        click.echo(f"✅ Profile '{profile}' removed!")

def _interactive_config(cli_instance):
    """Interactive configuration"""
    click.echo("Current Configuration:")
    click.echo(f"  Default Wallet: {cli_instance.config.default_wallet or 'Not set'}")
    click.echo(f"  Default Amount: ${cli_instance.config.default_amount}")
    click.echo(f"  Default From: {cli_instance.config.default_from_currency}")
    click.echo(f"  Default To: {cli_instance.config.default_to_currency}")

    update_config = inquirer.confirm('Update configuration?')
    if update_config:
        wallet = inquirer.text('Default wallet (leave blank to keep current):')
        amount = inquirer.text('Default amount (leave blank to keep current):')

        if wallet:
            cli_instance.config.default_wallet = wallet
        if amount:
            cli_instance.config.default_amount = float(amount)

        cli_instance.save_config()
        click.echo("✅ Configuration updated!")

@cli.command()
def docs():
    """Show documentation and help."""
    docs_text = """
📚 SimpleSwap Automation Documentation

OVERVIEW:
--------
SimpleSwap Automation uses browser profiles to create cryptocurrency exchanges
without manual interaction. The system saves wallet addresses to SimpleSwap
accounts and then uses them in automated mode.

KEY CONCEPTS:
------------

1. Browser Profiles:
   - Save cookies, localStorage, and session state
   - Persist wallet addresses across runs
   - Bypass SimpleSwap input validation

2. Two-Mode Operation:
   - Setup Mode: Add wallet address to SimpleSwap account
   - Automation Mode: Create exchanges using saved addresses

3. CLI Integration:
   - Command-line interface for easy access
   - Profile management for multiple wallets
   - Asynchronous and synchronous execution

WORKFLOW:
---------
1. Setup Mode (one time):
   simpleswap swap --setup --wallet YOUR_WALLET_ADDRESS

2. Automation Mode (repeated):
   simpleswap swap --wallet YOUR_WALLET_ADDRESS --amount 50

3. Profile Management:
   simpleswap profiles add my_wallet YOUR_WALLET_ADDRESS
   simpleswap swap --profile my_wallet --amount 100

EXAMPLES:
---------
# Setup wallet address
simpleswap swap --setup --wallet 0x1372Ad41B513b9d6eC008086C03d69C635bAE578

# Create exchange for $50
simpleswap swap --wallet 0x1372Ad41B513b9d6eC008086C03d69C635bAE578 --amount 50

# Using profile
simpleswap profiles add main 0x1372Ad41B513b9d6eC008086C03d69C635bAE578
simpleswap swap --profile main --amount 100

# Interactive mode
simpleswap interactive

# Check run status
simpleswap status RUN_ID

# Configuration management
simpleswap config set --wallet 0x1372Ad41B513b9d6eC008086C03d69C635bAE578
simpleswap config show

TROUBLESHOOTING:
---------------
1. Setup Mode Fails:
   - Check wallet address format
   - Ensure SimpleSwap is accessible
   - Run with --async-run to check logs

2. Exchange Creation Fails:
   - Ensure setup mode was completed successfully
   - Check if wallet address is properly saved
   - Verify SimpleSwap service availability

3. Profile Issues:
   - Check profile configuration: simpleswap profiles list
   - Remove and recreate corrupted profiles
   - Validate wallet addresses

API INTEGRATION:
--------------
The CLI integrates with Apify actors for browser automation.
- Actor ID: DsCczYpxTSp2ATS6D
- Authentication: Bearer token
- Monitoring: Real-time status updates

For more information, visit:
- Apify Console: https://console.apify.com/actors/DsCczYpxTSp2ATS6D
- SimpleSwap: https://simpleswap.io
    """
    click.echo(docs_text)

if __name__ == '__main__':
    cli()