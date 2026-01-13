# GLM Monitor API Integration Guide

This document provides comprehensive examples for integrating with the GLM Monitor REST API.

## Table of Contents

- [Starting the API Server](#starting-the-api-server)
- [Available Endpoints](#available-endpoints)
- [Shell/Curl Examples](#shellcurl-examples)
- [Python Examples](#python-examples)
- [Node.js Examples](#nodejs-examples)
- [Automation Examples](#automation-examples)
- [Error Handling](#error-handling)

---

## Starting the API Server

Start the API server using the CLI:

```bash
# Default port (8081)
glm-monitor api

# Custom port
glm-monitor api -p 9000
```

The API runs on `http://localhost:8081` by default and only accepts connections from localhost for security.

---

## Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check and data availability |
| `/api/current` | GET | Current usage snapshot |
| `/api/history` | GET | Historical data with range filter |
| `/api/predict` | GET | Quota exhaustion prediction |
| `/api/rates` | GET | Usage rate calculations |
| `/api/settings` | GET | Current configuration |
| `/api/settings` | POST | Update configuration |

---

## Shell/Curl Examples

### Check API Health

```bash
curl -s http://localhost:8081/api/health | jq '.'
```

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "dataAvailable": true,
  "lastUpdated": "2026-01-12T20:00:00.000Z",
  "entriesCount": 150,
  "summariesCount": 24,
  "activeProfile": "default"
}
```

### Get Current Usage

```bash
curl -s http://localhost:8081/api/current | jq '.'
```

**Response:**
```json
{
  "timestamp": "2026-01-12T20:00:00.000Z",
  "modelCalls": 15234,
  "tokensUsed": 4523890,
  "mcpCalls": 892,
  "tokenQuotaPercent": 45.2,
  "timeQuotaPercent": 32.1,
  "mcpToolBreakdown": { "web_search": 234, "code_search": 156 },
  "quotaLimits": { "tokenQuota": { "current": 4523890, "max": 10000000 } },
  "profile": "default"
}
```

### Get 24h History

```bash
# Raw entries
curl -s "http://localhost:8081/api/history?range=24h" | jq '.entries | length'

# Summary format
curl -s "http://localhost:8081/api/history?range=24h&format=summary" | jq '.'
```

**Summary Response:**
```json
{
  "totalModelCalls": 15234,
  "totalTokensUsed": 4523890,
  "totalMcpCalls": 892,
  "tokenGrowth": 12.5,
  "entryCount": 288,
  "timeRange": {
    "start": "2026-01-11T20:00:00.000Z",
    "end": "2026-01-12T20:00:00.000Z"
  },
  "profile": "default"
}
```

### Get Quota Prediction

```bash
# Default 6-hour window
curl -s http://localhost:8081/api/predict | jq '.'

# Custom window
curl -s "http://localhost:8081/api/predict?timeWindow=12h" | jq '.'
```

**Response:**
```json
{
  "tokenQuotaPercent": 45.2,
  "timeQuotaPercent": 32.1,
  "hoursUntilExhausted": 72,
  "rate": 0.75,
  "window": "6h",
  "status": "ok",
  "profile": "default"
}
```

### Get Usage Rates

```bash
curl -s "http://localhost:8081/api/rates?window=1h" | jq '.'
```

**Response:**
```json
{
  "window": "1h",
  "tokensPerHour": 125000,
  "callsPerHour": 45,
  "avgTokensPerCall": 2778,
  "entriesCount": 12,
  "profile": "default"
}
```

### Update Settings

```bash
curl -s -X POST http://localhost:8081/api/settings \
  -H "Content-Type: application/json" \
  -d '{"retention": "7d"}' | jq '.'
```

---

## Python Examples

### Installation

```bash
pip install requests
```

### glm_monitor.py

```python
"""GLM Monitor API Client"""

import requests
from typing import Optional, Dict, Any

API_URL = "http://localhost:8081"


def get_current_usage() -> Dict[str, Any]:
    """Get current usage snapshot."""
    response = requests.get(f"{API_URL}/api/current")
    response.raise_for_status()
    return response.json()


def get_history(range: str = '24h', format: Optional[str] = None) -> Dict[str, Any]:
    """
    Get historical data.
    
    Args:
        range: Time range (1h, 6h, 12h, 24h, 7d, 30d)
        format: Output format ('raw' or 'summary')
    """
    params = {'range': range}
    if format:
        params['format'] = format
    response = requests.get(f"{API_URL}/api/history", params=params)
    response.raise_for_status()
    return response.json()


def get_prediction(time_window: str = '6h') -> Dict[str, Any]:
    """Get quota exhaustion prediction."""
    params = {'timeWindow': time_window}
    response = requests.get(f"{API_URL}/api/predict", params=params)
    response.raise_for_status()
    return response.json()


def get_rates(window: str = '1h') -> Dict[str, Any]:
    """Get usage rates."""
    params = {'window': window}
    response = requests.get(f"{API_URL}/api/rates", params=params)
    response.raise_for_status()
    return response.json()


def check_health() -> Dict[str, Any]:
    """Check API health."""
    response = requests.get(f"{API_URL}/api/health")
    response.raise_for_status()
    return response.json()


def get_settings() -> Dict[str, Any]:
    """Get current settings."""
    response = requests.get(f"{API_URL}/api/settings")
    response.raise_for_status()
    return response.json()


def update_settings(retention: str) -> Dict[str, Any]:
    """Update settings."""
    response = requests.post(
        f"{API_URL}/api/settings",
        json={'retention': retention}
    )
    response.raise_for_status()
    return response.json()


# Example usage
if __name__ == "__main__":
    # Health check
    health = check_health()
    print(f"API Status: {health['status']}")
    print(f"Data available: {health['dataAvailable']}")
    print(f"Entries: {health['entriesCount']}")
    
    # Current usage
    current = get_current_usage()
    print(f"\nCurrent quota: {current['tokenQuotaPercent']}%")
    print(f"Tokens used: {current['tokensUsed']:,}")
    
    # Prediction
    prediction = get_prediction()
    if prediction.get('hoursUntilExhausted'):
        print(f"\nQuota exhaustion in {prediction['hoursUntilExhausted']} hours")
        if prediction.get('status') == 'warning':
            print("⚠️  WARNING: Quota will be exhausted soon!")
    
    # Rates
    rates = get_rates()
    print(f"\nUsage rates (last hour):")
    print(f"  Tokens/hour: {rates['tokensPerHour']:,}")
    print(f"  Calls/hour: {rates['callsPerHour']}")
    
    # 24h summary
    summary = get_history('24h', 'summary')
    print(f"\nLast 24h:")
    print(f"  Total calls: {summary['totalModelCalls']:,}")
    print(f"  Total tokens: {(summary['totalTokensUsed']/1_000_000):.2f}M")
    print(f"  Growth: {summary['tokenGrowth']:.1f}%")
```

### Quota Monitor Script

```python
"""Monitor quota and send alerts."""

import time
import requests
from datetime import datetime

API_URL = "http://localhost:8081"
WARNING_THRESHOLD = 80  # percent
CRITICAL_THRESHOLD = 90  # percent
CHECK_INTERVAL = 300  # seconds (5 minutes)


def send_alert(level: str, message: str):
    """Send alert (customize for your notification system)."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {message}")
    
    # Example: Send to Slack
    # requests.post(SLACK_WEBHOOK, json={"text": f"[{level}] {message}"})
    
    # Example: Send email
    # send_email(subject=f"GLM Monitor {level}", body=message)


def monitor():
    """Main monitoring loop."""
    print("Starting GLM quota monitor...")
    last_alert = 0
    alert_cooldown = 3600  # 1 hour between alerts
    
    while True:
        try:
            # Get current usage
            response = requests.get(f"{API_URL}/api/current", timeout=10)
            if response.status_code != 200:
                print(f"Failed to get usage data: {response.status_code}")
                time.sleep(CHECK_INTERVAL)
                continue
            
            data = response.json()
            quota = data['tokenQuotaPercent']
            
            # Check thresholds
            now = time.time()
            if now - last_alert > alert_cooldown:
                if quota >= CRITICAL_THRESHOLD:
                    send_alert("CRITICAL", f"Token quota at {quota}%!")
                    last_alert = now
                elif quota >= WARNING_THRESHOLD:
                    send_alert("WARNING", f"Token quota at {quota}%")
                    last_alert = now
            
            # Get prediction
            pred = requests.get(f"{API_URL}/api/predict", timeout=10).json()
            if pred.get('hoursUntilExhausted') and pred['hoursUntilExhausted'] < 12:
                send_alert("WARNING", f"Quota exhaustion in {pred['hoursUntilExhausted']}h")
            
        except Exception as e:
            print(f"Error: {e}")
        
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    monitor()
```

---

## Node.js Examples

### Basic Usage

```javascript
const API_URL = 'http://localhost:8081';

async function getUsageSummary() {
  const response = await fetch(`${API_URL}/api/history?range=24h&format=summary`);
  const data = await response.json();
  
  console.log(`Total tokens: ${(data.totalTokensUsed / 1_000_000).toFixed(2)}M`);
  console.log(`Total calls: ${data.totalModelCalls.toLocaleString()}`);
  console.log(`Total MCP calls: ${data.totalMcpCalls}`);
  console.log(`Token growth: ${data.tokenGrowth.toFixed(1)}%`);
}

async function monitorQuota() {
  const [current, prediction] = await Promise.all([
    fetch(`${API_URL}/api/current`).then(r => r.json()),
    fetch(`${API_URL}/api/predict`).then(r => r.json())
  ]);
  
  console.log(`Current quota: ${current.tokenQuotaPercent}%`);
  
  if (prediction.hoursUntilExhausted !== null) {
    console.log(`Time to exhaustion: ${prediction.hoursUntilExhausted} hours`);
    
    if (prediction.hoursUntilExhausted < 24) {
      console.warn('⚠️  WARNING: Quota will be exhausted soon!');
    }
  }
}

async function healthCheck() {
  const health = await fetch(`${API_URL}/api/health`).then(r => r.json());
  console.log(`Status: ${health.status}`);
  console.log(`Data available: ${health.dataAvailable}`);
  console.log(`Last updated: ${health.lastUpdated}`);
  console.log(`Entry count: ${health.entriesCount}`);
}

// Run examples
(async () => {
  await healthCheck();
  console.log('---');
  await getUsageSummary();
  console.log('---');
  await monitorQuota();
})();
```

### Express Middleware for Quota Gating

```javascript
/**
 * Middleware to check GLM quota before allowing API requests.
 * Add to your Express app to gate expensive operations.
 */
async function checkQuotaMiddleware(threshold = 90) {
  return async (req, res, next) => {
    try {
      const response = await fetch('http://localhost:8081/api/current');
      const data = await response.json();
      
      if (data.tokenQuotaPercent >= threshold) {
        return res.status(503).json({
          error: 'Service temporarily unavailable',
          reason: 'GLM quota threshold exceeded',
          quota: data.tokenQuotaPercent
        });
      }
      
      req.glmQuota = data;
      next();
    } catch (error) {
      // If GLM monitor unavailable, allow request
      console.warn('GLM Monitor unavailable');
      next();
    }
  };
}

// Usage in Express app
// app.use('/api/expensive', checkQuotaMiddleware(85));
```

---

## Automation Examples

### macOS Launchd Integration

Create `~/Library/LaunchAgents/com.user.glm-api.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.glm-api</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npx</string>
        <string>glm-monitor</string>
        <string>api</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/glm-api.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/glm-api.error.log</string>
</dict>
</plist>
```

Load with:
```bash
launchctl load ~/Library/LaunchAgents/com.user.glm-api.plist
```

### Linux Systemd Service

Create `/etc/systemd/user/glm-api.service`:

```ini
[Unit]
Description=GLM Monitor API Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/npx glm-monitor api
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
```

Enable and start:
```bash
systemctl --user enable glm-api
systemctl --user start glm-api
```

### Cron: Periodic Data Collection + API

```bash
# Collect data every 5 minutes
*/5 * * * * cd ~/glm-monitor && npx glm-monitor collect >> /tmp/glm-collect.log 2>&1

# Daily backup at 2 AM
0 2 * * * cd ~/glm-monitor && npx glm-monitor backup >> /tmp/glm-backup.log 2>&1
```

### GitHub Actions Workflow

`.github/workflows/glm-usage-report.yml`:

```yaml
name: GLM Usage Report

on:
  schedule:
    - cron: '0 9 * * *'  # Daily at 9 AM UTC
  workflow_dispatch:

jobs:
  report:
    runs-on: self-hosted  # Needs access to local API
    steps:
      - name: Get GLM Usage Summary
        id: usage
        run: |
          SUMMARY=$(curl -s http://localhost:8081/api/history?range=24h\&format=summary)
          echo "summary=$SUMMARY" >> $GITHUB_OUTPUT
      
      - name: Create Issue
        uses: actions/github-script@v6
        with:
          script: |
            const summary = JSON.parse('${{ steps.usage.outputs.summary }}');
            const body = `
            ## GLM Usage Report - ${new Date().toLocaleDateString()}
            
            ### Last 24 Hours
            - **Total Calls:** ${summary.totalModelCalls.toLocaleString()}
            - **Total Tokens:** ${(summary.totalTokensUsed / 1000000).toFixed(2)}M
            - **MCP Calls:** ${summary.totalMcpCalls}
            - **Growth:** ${summary.tokenGrowth.toFixed(1)}%
            
            *Report generated by GLM Monitor*
            `;
            
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Daily Usage Report - ${new Date().toISOString().split('T')[0]}`,
              body: body,
              labels: ['usage-report']
            });
```

---

## Error Handling

All endpoints return JSON responses with appropriate HTTP status codes:

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad request (invalid parameters) |
| 404 | Not found (no data available) |
| 500 | Internal server error |

### Error Response Format

```json
{
  "error": "Description of the error"
}
```

### Example Error Handling

```python
import requests

def safe_get_usage():
    try:
        response = requests.get("http://localhost:8081/api/current", timeout=5)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        print("API server not running. Start with: glm-monitor api")
        return None
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            print("No usage data. Run: glm-monitor collect")
        else:
            print(f"API error: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        return None
```

---

## Security Notes

- The API server only binds to `127.0.0.1` (localhost)
- No authentication is required for local access
- CORS headers are set to allow local development
- Auth tokens are never exposed via the API
- Profile data only shows names and creation dates, not credentials

---

## Troubleshooting

### API server won't start
```bash
# Check if port is in use
lsof -i :8081

# Try different port
glm-monitor api -p 9000
```

### No data available
```bash
# Collect data first
glm-monitor collect

# Check data exists
ls -la ~/.glm-monitor/
```

### Connection refused
```bash
# Ensure API is running
curl http://localhost:8081/api/health

# Start API server
glm-monitor api
```
