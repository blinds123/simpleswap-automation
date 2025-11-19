"""
SimpleSwap Automation - Unified Workflow
Combines CLI, MCP, and Browser Profiles for complete automation.
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, Any, Optional
from dataclasses import dataclass
import requests

@dataclass
class WorkflowConfig:
    """Configuration for unified workflow"""
    wallet_address: str
    amount: float = 25.0
    from_currency: str = "usd-usd"
    to_currency: str = "pol-matic"
    profile_name: Optional[str] = None
    setup_required: bool = False
    interactive: bool = False
    use_cli: bool = True
    use_mcp: bool = False
    async_execution: bool = False
    monitor_completion: bool = True

class SimpleSwapWorkflow:
    """Unified workflow manager for SimpleSwap automation"""

    def __init__(self, config: WorkflowConfig):
        self.config = config
        self.apify_token = os.getenv('APIFY_TOKEN')
        if not self.apify_token:
            raise ValueError("APIFY_TOKEN environment variable required")
        self.actor_id = "DsCczYpxTSp2ATS6D"
        self.run_id = None
        self.session_id = None

    def run_cli_command(self, cmd: list, timeout: int = 300) -> Dict[str, Any]:
        """Execute CLI command and return result"""
        try:
            print(f"🔧 Running CLI command: {' '.join(cmd)}")

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=Path(__file__).parent
            )

            if result.returncode != 0:
                return {
                    'success': False,
                    'error': result.stderr,
                    'stdout': result.stdout
                }

            return {
                'success': True,
                'output': result.stdout,
                'stderr': result.stderr
            }

        except subprocess.TimeoutExpired:
            return {'success': False, 'error': 'Command timed out'}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def run_mcp_operation(self, tool: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Execute MCP operation"""
        try:
            # Start MCP server in background
            server_process = subprocess.Popen([
                sys.executable, 'mcp_server.py'
            ], cwd=Path(__file__).parent, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            # Give server time to start
            await asyncio.sleep(2)

            # For this example, we'll simulate MCP calls
            # In practice, you'd use the MCP client library
            print(f"🧠 MCP Operation: {tool} with params: {params}")

            # Simulate processing time
            await asyncio.sleep(1)

            # Mock response based on operation
            if tool == "setup_wallet":
                mock_run_id = f"setup_{int(time.time())}"
                return {'success': True, 'run_id': mock_run_id}
            elif tool == "create_session":
                mock_session_id = f"session_{int(time.time())}"
                return {'success': True, 'session_id': mock_session_id}
            elif tool == "execute_swap":
                mock_run_id = f"swap_{int(time.time())}"
                return {'success': True, 'run_id': mock_run_id}
            elif tool == "check_status":
                return {'success': True, 'status': 'SUCCEEDED'}

            return {'success': True, 'result': 'Operation completed'}

        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            # Clean up server process
            if 'server_process' in locals():
                server_process.terminate()

    def check_apify_status(self, run_id: str) -> Dict[str, Any]:
        """Check status of Apify run"""
        try:
            url = f"https://api.apify.com/v2/acts/{self.actor_id}/runs/{run_id}"
            headers = {'Authorization': f'Bearer {self.apify_token}'}

            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()

        except Exception as e:
            return {'error': str(e)}

    def get_apify_result(self, store_id: str) -> Dict[str, Any]:
        """Get result from Apify run"""
        try:
            url = f"https://api.apify.com/v2/key-value-stores/{store_id}/records/OUTPUT"
            headers = {'Authorization': f'Bearer {self.apify_token}'}

            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()

        except Exception as e:
            return {'error': str(e)}

    async def setup_wallet(self) -> bool:
        """Setup wallet address in SimpleSwap"""
        print("🔧 Setting up wallet address...")

        if self.config.use_cli:
            # CLI Setup
            cmd = [
                'python', 'cli.py', 'swap',
                '--wallet', self.config.wallet_address,
                '--amount', str(self.config.amount),
                '--setup'
            ]

            if self.config.async_execution:
                cmd.append('--async-run')

            result = self.run_cli_command(cmd)

            if result['success']:
                if self.config.async_execution:
                    # Extract run ID from output
                    output = result['output']
                    if 'Run ID:' in output:
                        run_id = output.split('Run ID:')[1].strip()
                        self.run_id = run_id
                        print(f"✅ Setup started: {run_id}")
                        return True
                else:
                    print("✅ Setup completed successfully")
                    return True
            else:
                print(f"❌ Setup failed: {result['error']}")
                return False

        elif self.config.use_mcp:
            # MCP Setup
            result = await self.run_mcp_operation('setup_wallet', {
                'wallet_address': self.config.wallet_address
            })

            if result['success']:
                self.run_id = result.get('run_id')
                print(f"✅ Setup started: {self.run_id}")
                return True
            else:
                print(f"❌ Setup failed: {result['error']}")
                return False

        return False

    async def execute_exchange(self) -> bool:
        """Execute cryptocurrency exchange"""
        print("💱 Executing exchange...")

        if self.config.use_cli:
            # CLI Exchange
            cmd = [
                'python', 'cli.py', 'swap',
                '--wallet', self.config.wallet_address,
                '--amount', str(self.config.amount),
                '--from-currency', self.config.from_currency,
                '--to-currency', self.config.to_currency
            ]

            if self.config.profile_name:
                cmd.extend(['--profile', self.config.profile_name])

            if self.config.async_execution:
                cmd.append('--async-run')

            result = self.run_cli_command(cmd)

            if result['success']:
                if self.config.async_execution:
                    # Extract run ID from output
                    output = result['output']
                    if 'Run ID:' in output:
                        run_id = output.split('Run ID:')[1].strip()
                        self.run_id = run_id
                        print(f"✅ Exchange started: {run_id}")
                        return True
                else:
                    print("✅ Exchange completed successfully")
                    return True
            else:
                print(f"❌ Exchange failed: {result['error']}")
                return False

        elif self.config.use_mcp:
            # MCP Exchange
            if not self.session_id:
                # Create session first
                session_result = await self.run_mcp_operation('create_session', {
                    'wallet_address': self.config.wallet_address,
                    'amount': self.config.amount,
                    'from_currency': self.config.from_currency,
                    'to_currency': self.config.to_currency
                })

                if session_result['success']:
                    self.session_id = session_result.get('session_id')
                else:
                    print(f"❌ Session creation failed: {session_result['error']}")
                    return False

            # Execute swap
            result = await self.run_mcp_operation('execute_swap', {
                'session_id': self.session_id
            })

            if result['success']:
                self.run_id = result.get('run_id')
                print(f"✅ Exchange started: {self.run_id}")
                return True
            else:
                print(f"❌ Exchange failed: {result['error']}")
                return False

        return False

    async def monitor_completion(self) -> Dict[str, Any]:
        """Monitor execution completion"""
        if not self.run_id:
            return {'success': False, 'error': 'No run ID to monitor'}

        print(f"⏳ Monitoring execution: {self.run_id}")

        start_time = time.time()
        timeout = 300  # 5 minutes

        while time.time() - start_time < timeout:
            status_data = self.check_apify_status(self.run_id)

            if 'error' in status_data:
                print(f"❌ Status check failed: {status_data['error']}")
                continue

            status = status_data['data']['status']
            print(f"📊 Status: {status}")

            if status == 'SUCCEEDED':
                print("✅ Execution completed successfully!")

                # Get result
                store_id = status_data['data']['defaultKeyValueStoreId']
                result = self.get_apify_result(store_id)

                if 'error' not in result:
                    print(f"🎉 Exchange created!")
                    print(f"   Exchange ID: {result.get('exchange_id')}")
                    print(f"   Exchange URL: {result.get('exchange_url')}")
                    return {'success': True, 'result': result}
                else:
                    print(f"❌ Failed to get result: {result['error']}")

            elif status == 'FAILED':
                print("❌ Execution failed")
                return {'success': False, 'error': 'Run failed'}

            await asyncio.sleep(5)

        return {'success': False, 'error': 'Monitoring timeout'}

    async def save_profile(self) -> bool:
        """Save wallet profile"""
        if not self.config.profile_name:
            return True

        print(f"💾 Saving profile: {self.config.profile_name}")

        if self.config.use_cli:
            cmd = [
                'python', 'cli.py', 'profiles', 'add',
                self.config.profile_name, self.config.wallet_address
            ]

            result = self.run_cli_command(cmd)
            return result['success']

        elif self.config.use_mcp:
            result = await self.run_mcp_operation('save_profile', {
                'name': self.config.profile_name,
                'wallet_address': self.config.wallet_address
            })
            return result['success']

        return False

    async def run_interactive_setup(self) -> bool:
        """Interactive setup mode"""
        print("🎯 Interactive Setup Mode")
        print("=" * 40)

        # Get wallet address
        wallet = input("Enter your Polygon wallet address: ").strip()
        if not wallet or not wallet.startswith('0x'):
            print("❌ Invalid wallet address")
            return False

        # Get profile name
        save_profile = input("Save as profile? (y/n): ").strip().lower()
        profile_name = None
        if save_profile == 'y':
            profile_name = input("Enter profile name: ").strip()
            if not profile_name:
                print("❌ Profile name required")
                return False

        # Update config
        self.config.wallet_address = wallet
        self.config.profile_name = profile_name

        # Run setup
        setup_success = await self.setup_wallet()

        if setup_success and profile_name:
            await self.save_profile()

        return setup_success

    async def run_interactive_exchange(self) -> bool:
        """Interactive exchange mode"""
        print("💱 Interactive Exchange Mode")
        print("=" * 40)

        # Get exchange details
        amount = input(f"Enter amount in USD (default {self.config.amount}): ").strip()
        if amount:
            try:
                self.config.amount = float(amount)
            except ValueError:
                print("❌ Invalid amount")
                return False

        # Check if using profile
        if self.config.profiles:
            use_profile = input("Use saved profile? (y/n): ").strip().lower()
            if use_profile == 'y':
                print("Available profiles:")
                # List profiles would be implemented here
                profile_name = input("Enter profile name: ").strip()
                self.config.profile_name = profile_name

        # Execute exchange
        return await self.execute_exchange()

    async def run(self) -> Dict[str, Any]:
        """Main workflow execution"""
        print("🚀 SimpleSwap Unified Workflow")
        print("=" * 50)
        print(f"   Wallet: {self.config.wallet_address[:10]}...{self.config.wallet_address[-6:] if self.config.wallet_address else 'Not set'}")
        print(f"   Amount: ${self.config.amount}")
        print(f"   Exchange: {self.config.from_currency.upper()} → {self.config.to_currency.upper()}")
        print(f"   Interface: {'CLI' if self.config.use_cli else 'MCP'}")
        print(f"   Mode: {'Interactive' if self.config.interactive else 'Automated'}")
        print("=" * 50)

        try:
            # Interactive mode
            if self.config.interactive:
                if self.config.setup_required:
                    return await self.run_interactive_setup()
                else:
                    return await self.run_interactive_exchange()

            # Automated mode
            # 1. Save profile if specified
            if self.config.profile_name:
                profile_success = await self.save_profile()
                if not profile_success:
                    print("⚠️ Failed to save profile, continuing...")

            # 2. Setup if required
            if self.config.setup_required:
                setup_success = await self.setup_wallet()
                if not setup_success:
                    return {'success': False, 'error': 'Setup failed'}

                if self.config.monitor_completion and self.run_id:
                    await self.monitor_completion()

                return {'success': True, 'message': 'Setup completed'}

            # 3. Execute exchange
            exchange_success = await self.execute_exchange()
            if not exchange_success:
                return {'success': False, 'error': 'Exchange execution failed'}

            # 4. Monitor completion
            if self.config.monitor_completion and self.run_id:
                result = await self.monitor_completion()
                return result

            return {'success': True, 'message': 'Exchange execution started'}

        except KeyboardInterrupt:
            return {'success': False, 'error': 'User interrupted'}
        except Exception as e:
            return {'success': False, 'error': str(e)}

async def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="SimpleSwap Unified Workflow")
    parser.add_argument('--wallet', '-w', help='Polygon wallet address')
    parser.add_argument('--amount', '-a', type=float, default=25.0, help='Amount in USD')
    parser.add_argument('--from-currency', '-f', default='usd-usd', help='Source currency')
    parser.add_argument('--to-currency', '-t', default='pol-matic', help='Target currency')
    parser.add_argument('--profile', '-p', help='Profile name')
    parser.add_argument('--setup', action='store_true', help='Run setup mode')
    parser.add_argument('--interactive', '-i', action='store_true', help='Interactive mode')
    parser.add_argument('--cli', action='store_true', default=True, help='Use CLI interface')
    parser.add_argument('--mcp', action='store_true', help='Use MCP interface')
    parser.add_argument('--async-exec', action='store_true', help='Asynchronous execution')
    parser.add_argument('--no-monitor', action='store_true', help='Skip completion monitoring')

    args = parser.parse_args()

    # Create configuration
    config = WorkflowConfig(
        wallet_address=args.wallet or '',
        amount=args.amount,
        from_currency=args.from_currency,
        to_currency=args.to_currency,
        profile_name=args.profile,
        setup_required=args.setup,
        interactive=args.interactive,
        use_cli=args.cli and not args.mcp,
        use_mcp=args.mcp,
        async_execution=args.async_exec,
        monitor_completion=not args.no_monitor
    )

    # Create and run workflow
    workflow = SimpleSwapWorkflow(config)
    result = await workflow.run()

    # Output result
    if result['success']:
        print("✅ Workflow completed successfully!")
        if 'result' in result:
            print(f"   Result: {json.dumps(result['result'], indent=2)}")
        if 'message' in result:
            print(f"   Message: {result['message']}")
    else:
        print("❌ Workflow failed!")
        print(f"   Error: {result['error']}")

    return 0 if result['success'] else 1

if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)