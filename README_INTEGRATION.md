# 🚀 SimpleSwap Automation - Complete Integration Guide

## 📋 Overview

This integration combines **CLI Interface**, **MCP Server**, and **Browser Profile Automation** to provide a complete solution for automated cryptocurrency exchange creation on SimpleSwap.

### Components

1. **🤖 Browser Profile System** (main.py)
   - Playwright-based automation with Apify
   - Two-mode operation (Setup/Automation)
   - Profile persistence and state management

2. **💻 CLI Interface** (cli.py)
   - Command-line tool for easy access
   - Profile management and configuration
   - Interactive and batch processing modes

3. **🧠 MCP Server** (mcp_server.py)
   - Model Context Protocol server for AI integration
   - RESTful API for programmatic access
   - Session management and state persistence

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLI Tool      │    │   MCP Server    │    │  Browser Auto   │
│                 │    │                 │    │   (Apify)       │
│ • User Interface│◄──►│ • AI Integration│◄──►│ • Playwright    │
│ • Profiles      │    │ • Session Mgmt   │    │ • Profiles      │
│ • Configuration │    │ • State Storage  │    │ • SimpleSwap    │
│ • Interactive   │    │ • Resources      │    │ • Exchange      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  Data Storage   │
                    │                 │
                    │ • ~/.simpleswap│
                    │ • Profiles      │
                    │ • Sessions      │
                    │ • Config        │
                    └─────────────────┘
```

## 🚀 Quick Start

### 1. Installation

```bash
# Clone repository
git clone https://github.com/blinds123/simpleswap-automation.git
cd simpleswap-automation

# Install CLI dependencies
pip install -r requirements-cli.txt

# Install MCP dependencies
pip install 'mcp[cli]'

# Install Playwright browsers (for local testing)
playwright install
```

### 2. Initial Setup

**Option A: Using CLI**
```bash
# Setup wallet address (one-time)
python cli.py swap --setup --wallet YOUR_WALLET_ADDRESS

# Or interactively
python cli.py interactive
```

**Option B: Using MCP Server**
```bash
# Start MCP server
python mcp_server.py

# In another terminal, use MCP tools
mcp call setup_wallet wallet_address="YOUR_WALLET_ADDRESS"
```

### 3. Create Exchanges

**CLI Usage:**
```bash
# Direct exchange
python cli.py swap --wallet YOUR_WALLET_ADDRESS --amount 50

# Using profile
python cli.py profiles add my_wallet YOUR_WALLET_ADDRESS
python cli.py swap --profile my_wallet --amount 100

# Interactive mode
python cli.py interactive
```

**MCP Usage:**
```bash
# Create session
mcp call create_session wallet_address="YOUR_WALLET" amount=50.0

# Execute swap
mcp call execute_swap session_id="SESSION_ID"

# Check status
mcp call check_status run_id="RUN_ID"
```

## 📚 Detailed Usage

### CLI Interface

#### Basic Commands
```bash
# Help
python cli.py --help

# Interactive mode
python cli.py interactive

# Documentation
python cli.py docs
```

#### Exchange Creation
```bash
# Setup wallet (one-time)
python cli.py swap --setup --wallet 0x1372Ad41B513b9d6eC008086C03d69C635bAE578

# Create exchange
python cli.py swap --wallet 0x1372Ad41B513b9d6eC008086C03d69C635bAE578 --amount 50

# Asynchronous execution
python cli.py swap --wallet WALLET --amount 100 --async-run

# Custom currencies
python cli.py swap --wallet WALLET --amount 75 --from-currency usd-usd --to-currency pol-matic
```

#### Profile Management
```bash
# Add profile
python cli.py profiles add main 0x1372Ad41B513b9d6eC008086C03d69C635bAE578

# List profiles
python cli.py profiles list

# Use profile
python cli.py swap --profile main --amount 50

# Remove profile
python cli.py profiles remove main
```

#### Configuration
```bash
# Show current config
python cli.py config show

# Set defaults
python cli.py config set --wallet WALLET --amount 50

# View documentation
python cli.py docs
```

#### Status Monitoring
```bash
# Check run status
python cli.py status RUN_ID

# Get run result
python cli.py result RUN_ID
```

### MCP Server

#### Starting Server
```bash
# Development mode
python mcp_server.py

# Or using MCP CLI
mcp dev mcp_server.py
```

#### Available Tools
```bash
# Session Management
mcp call create_session wallet_address="WALLET" amount=50.0
mcp call get_session_info session_id="SESSION_ID"
mcp call list_sessions

# Exchange Operations
mcp call setup_wallet wallet_address="WALLET"
mcp call execute_swap session_id="SESSION_ID"
mcp call check_status run_id="RUN_ID"

# Profile Management
mcp call save_profile name="my_wallet" wallet_address="WALLET"
mcp call get_profile name="my_wallet"
mcp call list_profiles

# Configuration
mcp call set_defaults default_wallet="WALLET" default_amount=50.0
mcp call get_defaults
```

#### Available Resources
```bash
# Session data
mcp resource simple://sessions
mcp resource simple://session/SESSION_ID

# Profiles
mcp resource simple://profiles
mcp resource simple://profile/PROFILE_NAME

# Configuration
mcp resource simple://config

# Documentation
mcp resource simple://docs/setup
mcp resource simple://docs/api
```

## 🔧 Advanced Configuration

### Configuration Files

**CLI Config** (`~/.simpleswap/config.json`):
```json
{
  "default_wallet": "0x1372Ad41B513b9d6eC008086C03d69C635bAE578",
  "default_amount": 25.0,
  "default_from_currency": "usd-usd",
  "default_to_currency": "pol-matic",
  "profiles": {
    "main": "0x1372Ad41B513b9d6eC008086C03d69C635bAE578",
    "backup": "0xABC..."
  }
}
```

**MCP State** (`~/.simpleswap/mcp_state.json`):
```json
{
  "sessions": {
    "session_20251119_123456_0": {
      "session_id": "session_20251119_123456_0",
      "wallet_address": "0x1372...",
      "amount": 50.0,
      "status": "completed",
      "exchange_id": "abc123",
      "exchange_url": "https://simpleswap.io/exchange?id=abc123"
    }
  },
  "profiles": {
    "main": "0x1372Ad41B513b9d6eC008086C03d69C635bAE578"
  },
  "default_wallet": "0x1372Ad41B513b9d6eC008086C03d69C635bAE578"
}
```

### Environment Variables

```bash
# Apify Configuration
export APIFY_TOKEN="YOUR_APIFY_TOKEN"
export ACTOR_ID="DsCczYpxTSp2ATS6D"

# SimpleSwap Configuration
export SIMPLESWAP_DEFAULT_WALLET="YOUR_WALLET"
export SIMPLESWAP_DEFAULT_AMOUNT="25.0"
export SIMPLESWAP_CONFIG_DIR="/path/to/config"
```

### Logging

**CLI Logging:**
```bash
# Enable debug logging
python cli.py --log-level DEBUG swap --wallet WALLET --amount 50

# Log to file
python cli.py --log-file simpleswap.log swap --wallet WALLET --amount 50
```

**MCP Logging:**
```bash
# Set log level
export SIMPLESWAP_LOG_LEVEL=DEBUG
python mcp_server.py
```

## 🔄 Workflow Examples

### Complete Workflow (CLI)

```bash
# 1. Initial setup
python cli.py swap --setup --wallet 0x1372Ad41B513b9d6eC008086C03d69C635bAE578

# 2. Save profile
python cli.py profiles add trading 0x1372Ad41B513b9d6eC008086C03d69C635bAE578

# 3. Create exchange
python cli.py swap --profile trading --amount 100 --async-run
# Output: Run ID: xJifp6Mevdy55tWWv

# 4. Check status
python cli.py status xJifp6Mevdy55tWWv

# 5. Get result
python cli.py result xJifp6Mevdy55tWWv
```

### Batch Processing

```bash
# Multiple exchanges
for amount in 25 50 75 100; do
    python cli.py swap --profile trading --amount $amount --async-run
done

# Check all runs
python cli.py status RUN_ID_1
python cli.py status RUN_ID_2
# etc.
```

### AI Integration (MCP)

```python
# Python script using MCP
import asyncio
from mcp import Client

async def automated_trading():
    client = Client()
    await client.connect("simpleswap-mcp")

    # Setup wallet
    result = await client.call_tool("setup_wallet", {
        "wallet_address": "0x1372Ad41B513b9d6eC008086C03d69C635bAE578"
    })
    setup_run_id = result["run_id"]

    # Wait for setup completion
    while True:
        status = await client.call_tool("check_status", {"run_id": setup_run_id})
        if status["status"] == "SUCCEEDED":
            break
        await asyncio.sleep(5)

    # Create session
    session = await client.call_tool("create_session", {
        "wallet_address": "0x1372Ad41B513b9d6eC008086C03d69C635bAE578",
        "amount": 50.0
    })
    session_id = session["session_id"]

    # Execute swap
    swap_result = await client.call_tool("execute_swap", {"session_id": session_id})
    swap_run_id = swap_result["run_id"]

    # Monitor completion
    while True:
        status = await client.call_tool("check_status", {
            "run_id": swap_run_id,
            "session_id": session_id
        })
        if status["status"] == "SUCCEEDED":
            session_info = await client.call_tool("get_session_info", {
                "session_id": session_id
            })
            print(f"Exchange completed: {session_info['exchange_url']}")
            break
        await asyncio.sleep(5)

asyncio.run(automated_trading())
```

## 🛠️ Development

### Local Testing

```bash
# Test CLI locally
python cli.py --help
python cli.py interactive

# Test MCP server locally
python mcp_server.py

# Test browser automation locally (requires GUI)
python main.py  # Will need manual intervention in setup mode
```

### Docker Integration

```dockerfile
# Dockerfile for integrated system
FROM python:3.11-slim

# Install dependencies
COPY requirements-cli.txt .
RUN pip install -r requirements-cli.txt
RUN pip install 'mcp[cli]'

# Install Playwright
RUN pip install playwright
RUN playwright install chromium

# Copy application
COPY . /app
WORKDIR /app

# Create volume for config
VOLUME ["/root/.simpleswap"]

# Expose MCP port (if needed)
EXPOSE 8000

# Default command
CMD ["python", "mcp_server.py"]
```

### Monitoring

**CLI Monitoring:**
```bash
# Real-time status monitoring
watch -n 5 'python cli.py status RUN_ID'

# Log monitoring
tail -f ~/.simpleswap/simpleswap.log
```

**MCP Monitoring:**
```bash
# Check server health
curl http://localhost:8000/health

# Monitor sessions
mcp resource simple://sessions
```

## 🔍 Troubleshooting

### Common Issues

1. **Setup Mode Fails**
   - Check wallet address format
   - Verify SimpleSwap accessibility
   - Run with `--async-run` for detailed logs

2. **Exchange Creation Fails**
   - Ensure setup mode completed successfully
   - Check if wallet address is properly saved
   - Verify SimpleSwap service status

3. **Profile Issues**
   - Check profile configuration: `python cli.py profiles list`
   - Remove and recreate corrupted profiles
   - Validate wallet addresses

4. **MCP Server Issues**
   - Check server logs for errors
   - Verify configuration file integrity
   - Ensure proper token authentication

### Debug Mode

```bash
# CLI debug mode
SIMPLESWAP_LOG_LEVEL=DEBUG python cli.py swap --wallet WALLET --amount 50

# MCP debug mode
SIMPLESWAP_LOG_LEVEL=DEBUG python mcp_server.py

# Apify debug
export APIFY_LOG_LEVEL=DEBUG
python cli.py swap --wallet WALLET --amount 50
```

### Support

- **Apify Console**: https://console.apify.com/actors/DsCczYpxTSp2ATS6D
- **SimpleSwap**: https://simpleswap.io
- **GitHub Issues**: https://github.com/blinds123/simpleswap-automation/issues

## 📈 Performance & Scaling

### Optimization Tips

1. **Profile Management**
   - Reuse profiles for multiple exchanges
   - Batch setup operations
   - Monitor profile health

2. **Session Management**
   - Clean up old sessions
   - Monitor session state
   - Use appropriate timeouts

3. **Resource Management**
   - Monitor memory usage
   - Clean up temporary files
   - Optimize concurrent requests

### Metrics to Monitor

- Exchange success rate
- Average completion time
- Profile usage statistics
- Error rates and types
- Resource consumption

## 🔐 Security Considerations

- Store API tokens securely
- Use environment variables for sensitive data
- Regularly rotate access tokens
- Monitor for unauthorized access
- Validate wallet addresses
- Audit session logs

---

**🎉 You now have a complete, integrated SimpleSwap automation system!**

This integration provides maximum flexibility:
- **CLI**: Easy command-line access
- **MCP**: AI-driven automation
- **Browser Profiles**: Reliable automation backend
- **Documentation**: Complete knowledge base

Choose the interface that best fits your workflow, or combine them for maximum power!