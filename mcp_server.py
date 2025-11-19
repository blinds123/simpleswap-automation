"""
SimpleSwap Automation MCP Server
Model Context Protocol server for AI-driven SimpleSwap automation.
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional, Any, AsyncGenerator
from pathlib import Path
import requests
from dataclasses import dataclass, asdict
from contextlib import asynccontextmanager

# MCP Imports
try:
    from mcp.server.fastmcp import FastMCP
    from mcp.types import (
        Resource, Tool, TextContent, ImageContent, EmbeddedResource,
        CallToolResult, GetResourceResult, ListResourcesResult,
        ListToolsResult
    )
except ImportError:
    print("MCP not installed. Install with: pip install 'mcp[cli]'")
    exit(1)

# SimpleSwap Configuration
APIFY_TOKEN = os.getenv('APIFY_TOKEN')
if not APIFY_TOKEN:
    raise ValueError("APIFY_TOKEN environment variable required")
ACTOR_ID = "DsCczYpxTSp2ATS6D"
CONFIG_DIR = Path.home() / ".simpleswap"
STATE_FILE = CONFIG_DIR / "mcp_state.json"

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("simpleswap-mcp")

@dataclass
class SwapSession:
    """Represents an active swap session"""
    session_id: str
    wallet_address: str
    amount: float
    from_currency: str
    to_currency: str
    status: str = "created"
    run_id: Optional[str] = None
    exchange_id: Optional[str] = None
    exchange_url: Optional[str] = None
    created_at: str = ""
    completed_at: Optional[str] = None

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now().isoformat()

@dataclass
class SimpleSwapState:
    """Persistent state for SimpleSwap MCP server"""
    sessions: Dict[str, SwapSession] = None
    profiles: Dict[str, str] = None  # name -> wallet_address
    default_wallet: Optional[str] = None
    default_amount: float = 25.0
    default_from_currency: str = "usd-usd"
    default_to_currency: str = "pol-matic"

    def __post_init__(self):
        if self.sessions is None:
            self.sessions = {}
        if self.profiles is None:
            self.profiles = {}

class SimpleSwapMCPServer:
    """Main MCP server for SimpleSwap automation"""

    def __init__(self):
        # Ensure config directory exists
        CONFIG_DIR.mkdir(exist_ok=True)

        # Load state
        self.state = self.load_state()

        # Initialize FastMCP
        self.mcp = FastMCP("SimpleSwapAutomation", version="1.0.0")

        # Setup tools and resources
        self.setup_tools()
        self.setup_resources()
        self.setup_prompts()

    def load_state(self) -> SimpleSwapState:
        """Load persistent state from file"""
        if STATE_FILE.exists():
            try:
                with open(STATE_FILE, 'r') as f:
                    data = json.load(f)
                    # Convert session dicts back to SwapSession objects
                    sessions = {}
                    for session_id, session_data in data.get('sessions', {}).items():
                        sessions[session_id] = SwapSession(**session_data)

                    return SimpleSwapState(
                        sessions=sessions,
                        profiles=data.get('profiles', {}),
                        default_wallet=data.get('default_wallet'),
                        default_amount=data.get('default_amount', 25.0),
                        default_from_currency=data.get('default_from_currency', 'usd-usd'),
                        default_to_currency=data.get('default_to_currency', 'pol-matic')
                    )
            except Exception as e:
                logger.error(f"Error loading state: {e}")
        return SimpleSwapState()

    def save_state(self):
        """Save persistent state to file"""
        try:
            data = {
                'sessions': {sid: asdict(session) for sid, session in self.state.sessions.items()},
                'profiles': self.state.profiles,
                'default_wallet': self.state.default_wallet,
                'default_amount': self.state.default_amount,
                'default_from_currency': self.state.default_from_currency,
                'default_to_currency': self.state.default_to_currency
            }
            with open(STATE_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving state: {e}")

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
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to trigger run: {e}")
            raise

    def check_run_status(self, run_id: str) -> Dict[str, Any]:
        """Check status of Apify run"""
        url = f"https://api.apify.com/v2/acts/{ACTOR_ID}/runs/{run_id}"
        headers = {'Authorization': f'Bearer {APIFY_TOKEN}'}

        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to check status: {e}")
            raise

    def get_run_result(self, store_id: str) -> Dict[str, Any]:
        """Get result from Apify run"""
        url = f"https://api.apify.com/v2/key-value-stores/{store_id}/records/OUTPUT"
        headers = {'Authorization': f'Bearer {APIFY_TOKEN}'}

        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to get result: {e}")
            raise

    def setup_tools(self):
        """Setup MCP tools"""

        @self.mcp.tool()
        def create_session(wallet_address: str, amount: float = 25.0,
                          from_currency: str = "usd-usd", to_currency: str = "pol-matic") -> str:
            """
            Create a new SimpleSwap session for automated exchange creation.

            Args:
                wallet_address: Polygon wallet address to receive crypto
                amount: Amount in USD to exchange (default: 25.0)
                from_currency: Source currency (default: "usd-usd")
                to_currency: Target currency (default: "pol-matic")

            Returns:
                Session ID for tracking the exchange
            """
            session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{len(self.state.sessions)}"

            session = SwapSession(
                session_id=session_id,
                wallet_address=wallet_address,
                amount=amount,
                from_currency=from_currency,
                to_currency=to_currency
            )

            self.state.sessions[session_id] = session
            self.save_state()

            logger.info(f"Created session {session_id} for wallet {wallet_address[:10]}...")
            return f"Session created: {session_id}"

        @self.mcp.tool()
        def setup_wallet(wallet_address: str, session_id: Optional[str] = None) -> str:
            """
            Setup wallet address in SimpleSwap (one-time operation).

            This runs setup mode to add the wallet address to SimpleSwap account
            using browser profiles.

            Args:
                wallet_address: Polygon wallet address to setup
                session_id: Optional session ID to associate with

            Returns:
                Run ID for tracking the setup process
            """
            try:
                result = self.trigger_apify_run(
                    wallet_address, 25.0, "usd-usd", "pol-matic", setup_mode=True
                )
                run_id = result['data']['id']

                if session_id and session_id in self.state.sessions:
                    self.state.sessions[session_id].run_id = run_id
                    self.state.sessions[session_id].status = "setup_in_progress"
                    self.save_state()

                logger.info(f"Setup started for wallet {wallet_address[:10]}..., run ID: {run_id}")
                return f"Setup started: {run_id}"

            except Exception as e:
                error_msg = f"Failed to start setup: {str(e)}"
                logger.error(error_msg)
                return error_msg

        @self.mcp.tool()
        def execute_swap(session_id: str) -> str:
            """
            Execute automated swap for a created session.

            Args:
                session_id: Session ID returned from create_session

            Returns:
                Run ID for tracking the exchange process
            """
            if session_id not in self.state.sessions:
                return f"Error: Session {session_id} not found"

            session = self.state.sessions[session_id]

            try:
                result = self.trigger_apify_run(
                    session.wallet_address, session.amount,
                    session.from_currency, session.to_currency, setup_mode=False
                )
                run_id = result['data']['id']

                session.run_id = run_id
                session.status = "swap_in_progress"
                self.save_state()

                logger.info(f"Swap started for session {session_id}, run ID: {run_id}")
                return f"Swap started: {run_id}"

            except Exception as e:
                session.status = "failed"
                self.save_state()
                error_msg = f"Failed to start swap: {str(e)}"
                logger.error(error_msg)
                return error_msg

        @self.mcp.tool()
        def check_status(run_id: str, session_id: Optional[str] = None) -> str:
            """
            Check status of a SimpleSwap run.

            Args:
                run_id: Run ID from setup or execute_swap
                session_id: Optional session ID to update

            Returns:
                Current status information
            """
            try:
                status_data = self.check_run_status(run_id)
                status = status_data['data']['status']

                # Update session if provided
                if session_id and session_id in self.state.sessions:
                    session = self.state.sessions[session_id]

                    if status == 'SUCCEEDED':
                        session.status = "completed"
                        session.completed_at = datetime.now().isoformat()

                        # Get final result
                        store_id = status_data['data']['defaultKeyValueStoreId']
                        result = self.get_run_result(store_id)

                        if result.get('status') == 'success':
                            session.exchange_id = result.get('exchange_id')
                            session.exchange_url = result.get('exchange_url')

                    elif status == 'FAILED':
                        session.status = "failed"
                    elif status == 'RUNNING':
                        session.status = "running"

                    self.save_state()

                status_info = {
                    'run_id': run_id,
                    'status': status,
                    'started_at': status_data['data']['startedAt'],
                    'finished_at': status_data['data'].get('finishedAt')
                }

                return json.dumps(status_info, indent=2)

            except Exception as e:
                error_msg = f"Failed to check status: {str(e)}"
                logger.error(error_msg)
                return error_msg

        @self.mcp.tool()
        def get_session_info(session_id: str) -> str:
            """
            Get detailed information about a session.

            Args:
                session_id: Session ID to query

            Returns:
                Session information in JSON format
            """
            if session_id not in self.state.sessions:
                return json.dumps({'error': f'Session {session_id} not found'})

            session = self.state.sessions[session_id]
            return json.dumps(asdict(session), indent=2)

        @self.mcp.tool()
        def list_sessions() -> str:
            """
            List all active sessions.

            Returns:
                List of sessions with basic information
            """
            sessions_info = []
            for session_id, session in self.state.sessions.items():
                sessions_info.append({
                    'session_id': session_id,
                    'wallet_address': session.wallet_address[:10] + "..." + session.wallet_address[-6:],
                    'amount': session.amount,
                    'status': session.status,
                    'created_at': session.created_at,
                    'exchange_id': session.exchange_id
                })

            return json.dumps(sessions_info, indent=2)

        @self.mcp.tool()
        def save_profile(name: str, wallet_address: str) -> str:
            """
            Save a wallet profile for easy reuse.

            Args:
                name: Profile name
                wallet_address: Polygon wallet address

            Returns:
                Confirmation message
            """
            self.state.profiles[name] = wallet_address
            self.save_state()

            logger.info(f"Saved profile '{name}' for wallet {wallet_address[:10]}...")
            return f"Profile '{name}' saved successfully"

        @self.mcp.tool()
        def get_profile(name: str) -> str:
            """
            Get wallet address from saved profile.

            Args:
                name: Profile name

            Returns:
                Wallet address or error message
            """
            if name not in self.state.profiles:
                return f"Profile '{name}' not found"

            return self.state.profiles[name]

        @self.mcp.tool()
        def list_profiles() -> str:
            """
            List all saved wallet profiles.

            Returns:
                List of profiles with masked addresses
            """
            profiles_info = []
            for name, wallet in self.state.profiles.items():
                profiles_info.append({
                    'name': name,
                    'wallet_address': wallet[:10] + "..." + wallet[-6:]
                })

            return json.dumps(profiles_info, indent=2)

        @self.mcp.tool()
        def set_defaults(default_wallet: Optional[str] = None, default_amount: Optional[float] = None,
                       default_from_currency: Optional[str] = None, default_to_currency: Optional[str] = None) -> str:
            """
            Set default configuration values.

            Args:
                default_wallet: Default wallet address
                default_amount: Default amount in USD
                default_from_currency: Default source currency
                default_to_currency: Default target currency

            Returns:
                Confirmation message
            """
            if default_wallet:
                self.state.default_wallet = default_wallet
            if default_amount:
                self.state.default_amount = default_amount
            if default_from_currency:
                self.state.default_from_currency = default_from_currency
            if default_to_currency:
                self.state.default_to_currency = default_to_currency

            self.save_state()

            logger.info("Default configuration updated")
            return "Default configuration updated successfully"

        @self.mcp.tool()
        def get_defaults() -> str:
            """
            Get current default configuration.

            Returns:
                Default configuration in JSON format
            """
            defaults = {
                'default_wallet': self.state.default_wallet,
                'default_amount': self.state.default_amount,
                'default_from_currency': self.state.default_from_currency,
                'default_to_currency': self.state.default_to_currency
            }

            return json.dumps(defaults, indent=2)

    def setup_resources(self):
        """Setup MCP resources"""

        @self.mcp.resource("simple://sessions")
        def list_sessions_resource() -> str:
            """List all active sessions"""
            sessions_info = []
            for session_id, session in self.state.sessions.items():
                sessions_info.append(asdict(session))
            return json.dumps(sessions_info, indent=2)

        @self.mcp.resource("simple://session/{session_id}")
        def get_session_resource(session_id: str) -> str:
            """Get specific session information"""
            if session_id not in self.state.sessions:
                return json.dumps({'error': f'Session {session_id} not found'})

            return json.dumps(asdict(self.state.sessions[session_id]), indent=2)

        @self.mcp.resource("simple://profiles")
        def list_profiles_resource() -> str:
            """List all saved profiles"""
            return json.dumps(self.state.profiles, indent=2)

        @self.mcp.resource("simple://profile/{profile_name}")
        def get_profile_resource(profile_name: str) -> str:
            """Get specific profile"""
            if profile_name not in self.state.profiles:
                return json.dumps({'error': f'Profile {profile_name} not found'})

            return json.dumps({
                'name': profile_name,
                'wallet_address': self.state.profiles[profile_name]
            }, indent=2)

        @self.mcp.resource("simple://config")
        def get_config_resource() -> str:
            """Get current configuration"""
            config = {
                'default_wallet': self.state.default_wallet,
                'default_amount': self.state.default_amount,
                'default_from_currency': self.state.default_from_currency,
                'default_to_currency': self.state.default_to_currency,
                'total_sessions': len(self.state.sessions),
                'total_profiles': len(self.state.profiles)
            }
            return json.dumps(config, indent=2)

        @self.mcp.resource("simple://docs/setup")
        def setup_docs() -> str:
            """Setup documentation"""
            return """
# SimpleSwap Setup Guide

## One-Time Setup

Before creating exchanges, you need to setup your wallet address:

1. **Setup Mode**: Run setup to add your wallet to SimpleSwap
   ```
   Tool: setup_wallet
   Args: wallet_address="YOUR_POLYGON_WALLET_ADDRESS"
   ```

2. **Verification**: Wait for setup to complete
   ```
   Tool: check_status
   Args: run_id="SETUP_RUN_ID"
   ```

## Profile Management

Save frequently used wallets:

```
Tool: save_profile
Args: name="my_wallet", wallet_address="YOUR_WALLET_ADDRESS"
```

## Session Management

Create sessions for tracking exchanges:

```
Tool: create_session
Args: wallet_address="WALLET", amount=50.0
```

## Exchange Execution

```
Tool: execute_swap
Args: session_id="SESSION_ID"
```

## Status Monitoring

```
Tool: check_status
Args: run_id="RUN_ID", session_id="SESSION_ID"
```
            """

        @self.mcp.resource("simple://docs/api")
        def api_docs() -> str:
            """API documentation"""
            return """
# SimpleSwap MCP API Documentation

## Tools

### Session Management
- `create_session`: Create new exchange session
- `get_session_info`: Get session details
- `list_sessions`: List all sessions

### Exchange Operations
- `setup_wallet`: One-time wallet setup
- `execute_swap`: Execute automated exchange
- `check_status`: Check run status

### Profile Management
- `save_profile`: Save wallet profile
- `get_profile`: Get saved profile
- `list_profiles`: List all profiles

### Configuration
- `set_defaults`: Set default values
- `get_defaults`: Get current defaults

## Resources

- `simple://sessions`: All sessions
- `simple://session/{id}`: Specific session
- `simple://profiles`: All profiles
- `simple://profile/{name}`: Specific profile
- `simple://config`: Current configuration
- `simple://docs/setup`: Setup guide
- `simple://docs/api`: This documentation

## Workflow

1. Setup wallet (one time)
2. Create session
3. Execute swap
4. Monitor status
5. Get results
            """

    def setup_prompts(self):
        """Setup MCP prompts"""

        @self.mcp.prompt()
        def setup_new_wallet() -> str:
            """Prompt for setting up a new wallet"""
            return """
I'll help you setup a new wallet address for SimpleSwap automation.

First, I need your Polygon wallet address. Please provide:
- Your wallet address (starts with 0x)
- Optionally, a profile name to save it for future use

Then I'll:
1. Run setup mode to add your wallet to SimpleSwap
2. Save your wallet profile for easy reuse
3. Verify the setup was successful

Please provide your wallet address to get started.
            """

        @self.mcp.prompt()
        def create_exchange() -> str:
            """Prompt for creating a new exchange"""
            return """
I'll help you create a cryptocurrency exchange on SimpleSwap.

Please provide:
- Your wallet address (or profile name if saved)
- Amount in USD to exchange
- Source and target currencies (defaults: USD to POL-MATIC)

I'll then:
1. Create a session for tracking
2. Execute the automated exchange
3. Monitor the progress
4. Return the exchange details

What exchange would you like to create?
            """

        @self.mcp.prompt()
        def check_session_status() -> str:
            """Prompt for checking session status"""
            return """
I'll help you check the status of your exchange operations.

Please provide:
- Your session ID (if checking a specific session)
- Or run ID (if checking a specific run)

I'll check the current status and provide you with:
- Current progress
- Any errors or issues
- Expected completion time
- Final exchange details if completed

What would you like to check?
            """

    async def run(self):
        """Run the MCP server"""
        logger.info("Starting SimpleSwap MCP Server...")
        await self.mcp.run()

async def main():
    """Main entry point"""
    server = SimpleSwapMCPServer()
    await server.run()

if __name__ == "__main__":
    asyncio.run(main())