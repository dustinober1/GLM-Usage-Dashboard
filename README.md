# GLM Monitor

A professional dashboard for monitoring your GLM Coding Plan API usage and quotas. Track tokens, model calls, MCP tool usage, and quota limits in real-time.

## Features

- 📊 **Real-time metrics** - Tokens, model calls, and MCP tool usage
- 📈 **Historical charts** - 24-hour data retention with auto-refresh
- ⚠️ **Quota alerts** - Visual warnings when approaching limits
- 🔄 **Auto-refresh** - Dashboard updates every 30 seconds
- 💾 **Persistent storage** - Data survives restarts
- 📤 **Export** - Download data as CSV

## Installation

### Option 1: Global Install (Recommended)

```bash
npm install -g glm-monitor
```

This installs the `glm-monitor` CLI tool globally, available from anywhere.

### Option 2: Project Install

```bash
git clone <repo-url>
cd GLM_Dashboard
npm install
```

## Quick Start

### 1. Initialize Configuration

```bash
# If globally installed
glm-monitor init

# Or if using project directly
npx glm-monitor init
```

Or set your token explicitly:

```bash
glm-monitor init -t "YOUR_AUTH_TOKEN_HERE"
```

### 2. Collect Data

```bash
# Collect current usage
npm run collect

# Or using the CLI
glm-monitor collect
```

### 3. Open Dashboard

```bash
# Collect data then open dashboard
npm run monitor

# Or using the CLI
glm-monitor monitor
```

The dashboard opens at `http://localhost:8080` (or port 5173 in dev mode).

## Development Mode

For development with hot-reload:

```bash
npm run dev
```

Then open `http://localhost:5173` in your browser.

| Mode | URL | Description |
|------|-----|-------------|
| Dev | `http://localhost:5173` | Hot-reload, Vite dev server |
| Prod | `http://localhost:8080` | Built version, serves data |

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run collect` | Collect usage data from API |
| `npm start` | Launch the dashboard |
| `npm run monitor` | Collect data then open dashboard |
| `npm run dev` | Start development server |
| `npm run build` | Build for production |

## CLI Commands

```bash
# Initialize/update configuration
glm-monitor init [-t TOKEN] [-u URL]

# Collect current usage
glm-monitor collect

# Collect and open dashboard
glm-monitor monitor

# Start dashboard server
glm-monitor start [-p PORT]
```

## Dashboard Metrics

### Current Usage Cards
- **Compute Tokens** - Total tokens consumed with trend indicator
- **API Manifestations** - Total model calls made
- **MCP Tool Navigations** - Tool invocation count (search, web-reader, zread)

### Quota Tracking
- **Neural Token Capacity** (5-hour rolling) - % of token limit used
- **Temporal Access Quota** (monthly) - % of MCP call limit used

### Visual Indicators
- 🟢 **Green:** < 50% used
- 🟡 **Yellow:** 50-80% used
- 🔴 **Red:** > 80% used

## Automation

Set up automatic data collection every 5 minutes.

### macOS (launchd)

Create `~/Library/LaunchAgents/com.user.usage-monitor.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.user.usage-monitor</string>
  <key>ProgramArguments</key>
  <array>
    <string>usr/local/bin/npm</string>
    <string>run</string>
    <string>collect</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/GLM_Dashboard</string>
  <key>StartInterval</key>
  <integer>300</integer>
</dict>
</plist>
```

Load with:
```bash
launchctl load ~/Library/LaunchAgents/com.user.usage-monitor.plist
```

### Linux (cron)

```bash
crontab -e
```

Add:
```
*/5 * * * * cd /path/to/GLM_Dashboard && npm run collect
```

## Data Storage

| Location | Purpose |
|----------|---------|
| `~/.glm-monitor/usage-history.json` | Persistent data storage |
| `~/.glm-monitor/config.json` | Auth token and API settings |

- **Retention:** 288 entries (24 hours at 5-min intervals)
- **Auto-trim:** Old entries removed automatically

## Troubleshooting

### "token expired or incorrect"
Your auth token has expired. Re-initialize:
```bash
glm-monitor init -t "YOUR_NEW_TOKEN"
```

### No data showing in dashboard
1. Run `npm run collect` to fetch initial data
2. Verify `~/.glm-monitor/usage-history.json` exists
3. Check browser console for errors

### Charts not updating
1. Click the **"Sync Now"** button to manually refresh
2. Dashboard auto-refreshes every 30 seconds
3. Verify data file is being updated: `ls -la ~/.glm-monitor/`

### CORS errors
- Access via `http://localhost:5173` (dev) or `http://localhost:8080` (prod)
- Do not open `index.html` directly as a file

## Configuration

The dashboard uses these environment variables (optional, overrides config):

```bash
export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
export ANTHROPIC_AUTH_TOKEN="your-token-here"
```

Or store permanently via `glm-monitor init`.

## API Endpoints

The collector queries these GLM Monitoring API endpoints:

| Endpoint | Purpose |
|----------|---------|
| `/api/monitor/usage/model-usage` | Token and call statistics |
| `/api/monitor/usage/tool-usage` | MCP tool invocation counts |
| `/api/monitor/usage/quota/limit` | Current quota limits and usage |

## License

MIT
