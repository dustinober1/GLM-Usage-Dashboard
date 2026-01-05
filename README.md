# GLM Usage Dashboard

A real-time web dashboard for monitoring your GLM Coding Plan API usage and quotas.

## Features

- 📊 Real-time usage statistics (tokens, calls, MCP tools)
- 📈 Historical charts with 24-hour data retention
- ⚠️ Quota alerts when approaching limits
- 🔄 Auto-refresh every 30 seconds
- 💾 Persistent data storage

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Collect Usage Data

```bash
# Run once to collect current usage
npm run collect

# Or set up automatic collection every 5 minutes
watch -n 300 npm run collect
```

### 3. View Dashboard

```bash
# Start the dashboard (collects data first)
npm run monitor

# Or open the dashboard directly
npm start
```

The dashboard will open at `http://localhost:8080`

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run collect` | Collect current usage data from API |
| `npm start` | Open the dashboard web interface |
| `npm run monitor` | Collect data then open dashboard |

## Data Storage

Usage data is stored in `~/.glm-monitor/usage-history.json`:
- **Retention:** 288 entries (24 hours at 5-min intervals)
- **Format:** JSON with timestamped entries
- **Size:** ~50KB for full 24-hour history

> **Note:** The dev dashboard uses a symlink (`data/usage-history.json` → `~/.glm-monitor/usage-history.json`) to access the data. This is created automatically by `npm run collect`.

## Dashboard Metrics

### Current Usage
- **Total Tokens Used:** Cumulative token consumption
- **Total Model Calls:** Number of API calls made
- **MCP Tool Calls:** Tool usage count (search, web-reader, zread)

### Quota Tracking
- **Token Quota (5-hour rolling):** % of token limit used
- **Time Quota (1-month):** % of MCP call limit used

### Color Indicators
- 🟢 **Green:** < 50% used
- 🟡 **Yellow:** 50-80% used
- 🔴 **Red:** > 80% used (alert triggered)

## Charts

1. **Token Usage Over Time** - Line chart showing token consumption
2. **Model Calls Over Time** - API call frequency
3. **MCP Tool Usage** - Tool invocation trends
4. **Quota Utilization** - Both quotas tracked over time

## Automation

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
    <string>/usr/local/bin/npm</string>
    <string>run</string>
    <string>collect</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/dustinober/Projects/ZLM_Dashboard</string>
  <key>StartInterval</key>
  <integer>300</integer>
</dict>
</plist>
```

Load with: `launchctl load ~/Library/LaunchAgents/com.user.usage-monitor.plist`

### Linux (cron)

```bash
crontab -e
```

Add:
```
*/5 * * * * cd /Users/dustinober/Projects/ZLM_Dashboard && npm run collect
```

## Environment Variables

The collector script requires these environment variables (already set if you're using GLM Coding Plan):

```bash
ANTHROPIC_BASE_URL="https://api.z.ai/api/anthropic"
ANTHROPIC_AUTH_TOKEN="your-token-here"
```

## Troubleshooting

**No data showing:**
- Run `npm run collect` once to initialize the data file
- Check that `ANTHROPIC_AUTH_TOKEN` is set correctly

**Charts not updating:**
- Refresh the page manually
- Check browser console for errors
- Verify `data/usage-history.json` exists

**CORS errors:**
- Make sure you're accessing via `http://localhost:8080`, not `file://`
- The dashboard uses HTTP server to avoid CORS restrictions

## Security Note

This dashboard is for local monitoring only:
- Data stored locally (no external transmission)
- Dashboard runs on localhost only
- No authentication required (local use)
