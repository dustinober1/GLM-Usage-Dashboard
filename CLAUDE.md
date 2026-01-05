# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **real-time usage monitoring dashboard** for the GLM Coding Plan API. It consists of two main components:

1. **Data Collector** (`scripts/usage-collector.mjs`) - A Node.js script that queries usage statistics from the GLM API
2. **Web Dashboard** (`index.html`) - A single-page application that visualizes the collected data with real-time charts and metrics

The dashboard monitors token usage, model calls, MCP tool invocations, and quota limits (5-hour rolling token quota and 1-month time quota).

## Common Development Commands

```bash
# Install dependencies
npm install

# Collect current usage data from the API (run this manually or schedule it)
npm run collect

# Start the dashboard web server (opens at http://localhost:8080)
npm start

# Collect data then immediately open the dashboard
npm run monitor
```

## Environment Variables

The collector requires these environment variables to be set in your shell:

```bash
export ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
export ANTHROPIC_AUTH_TOKEN="your-token-here"
```

These are typically already set if you're using GLM Coding Plan. The `collect.sh` wrapper script validates these variables before running the collector.

## Architecture

### Data Collection Flow

1. **API Queries**: The collector (`scripts/usage-collector.mjs`) makes three HTTPS requests to the GLM monitoring API:
   - `/api/monitor/usage/model-usage` - Total model calls and tokens consumed
   - `/api/monitor/usage/tool-usage` - MCP tool invocation counts
   - `/api/monitor/usage/quota/limit` - Current quota limits and usage percentages

2. **Data Storage**: Results are appended to `data/usage-history.json` with:
   - `entries` - Array of timestamped usage snapshots (max 288 entries = 24 hours at 5-min intervals)
   - `lastUpdated` - ISO timestamp of last collection
   - `quotaLimits` - Current quota details (token and time quotas with current/max/percentage)

3. **Auto-Trim**: Old entries beyond `MAX_HISTORY_ENTRIES` are automatically removed to keep file size manageable (~50KB for 24 hours).

### Dashboard Architecture

The dashboard is a **single-file HTML application** with:

- **No build process** - Uses vanilla JS and CDN-hosted Chart.js v4.4.1
- **Auto-refresh** - Fetches `data/usage-history.json` every 30 seconds
- **Dual Y-axis charts** - Tokens (millions) on left axis, model calls (thousands) on right axis
- **Color-coded alerts** - Green (<50%), Yellow (50-80%), Red (>80%) for quota utilization

### Data Format

Each entry in `data/usage-history.json`:
```json
{
  "timestamp": "2026-01-05T14:37:16.312Z",
  "modelCalls": 6614,
  "tokensUsed": 260325210,
  "mcpCalls": 6,
  "tokenQuotaPercent": 10,
  "timeQuotaPercent": 1
}
```

## Automation

To collect data continuously, set up a scheduled task:

**macOS (launchd):**
```bash
# Create ~/Library/LaunchAgents/com.user.usage-monitor.plist
# Load with: launchctl load ~/Library/LaunchAgents/com.user.usage-monitor.plist
```

**Linux (cron):**
```bash
*/5 * * * * cd /path/to/project && npm run collect
```

## Important Implementation Details

- **HTTP Server Required**: The dashboard must run via `http-server` (not `file://`) to avoid CORS restrictions when fetching JSON data
- **Timestamp Cache Busting**: Dashboard appends `?t={timestamp}` to data URL to prevent browser caching
- **Graceful Degradation**: If `usage-history.json` doesn't exist, the dashboard shows an error message directing users to run `npm run collect`
- **No Authentication**: Dashboard is designed for local use only (localhost binding)

## File Structure

```
/
├── collect.sh              # Wrapper script that validates env vars
├── index.html              # Single-page dashboard application
├── package.json            # NPM scripts and dependencies
├── scripts/
│   └── usage-collector.mjs # Main data collection script
└── data/
    └── usage-history.json  # Persistent storage (auto-generated)
```

## Testing Changes

When modifying the collector:
1. Run `npm run collect` and check console output for quota warnings
2. Verify `data/usage-history.json` is updated with new entry
3. Check that old entries are trimmed when exceeding 288 entries

When modifying the dashboard:
1. Start with `npm start`
2. Open browser DevTools to monitor fetch requests
3. Verify chart updates every 30 seconds without page refresh
4. Test quota alerts at different percentage thresholds (50%, 80%)
