# GLM Monitor - Implementation Plan

**Version:** 1.0  
**Last Updated:** January 11, 2026  
**Status:** Ready for Implementation

---

## Overview

This document outlines a comprehensive enhancement plan for the GLM Usage Dashboard, transforming it from a basic monitoring tool into a professional analytics platform with advanced features while maintaining its status as a local npm package.

**Key Design Principles:**
- 📦 **Local-first**: No external web services required
- 🔧 **CLI-first**: Configuration via CLI, UI as secondary
- 🎯 **Incremental**: Phased approach for manageable development
- 🚀 **Performance**: Minimal dependencies, fast startup
- 🛡️ **Security**: localhost-only API, no auth needed for local use

---

## Phase Prioritization

Based on confirmed requirements:

1. **Phase 1: Core Analytics** - Immediate value (Time ranges, usage rates, predictive alerts)
2. **Phase 2: User Experience** - Better UX (Settings, notifications, tool breakdown)
3. **Phase 3: Data Management** - Extended retention, backups, multi-profile
4. **Phase 4: REST API** - Local integrations (localhost-only)
5. **Phase 5: Diagnostics** - Health checks and debugging
6. **Phase 6: Polish** - Theme, shortcuts, wizard

**Total Timeline:** 9-11 weeks (20 major tasks)

---

## PHASE 1: Core Analytics

**Goal:** Provide immediate value with enhanced time views, usage rates, and predictive alerts

### 1.1 Time Range Selector (Dashboard UI)

**Files to modify:**
- `src/main.js` (add time range state, filtering logic)
- `src/styles.css` (add dropdown selector styling)

**Implementation Details:**

```javascript
// Add time range state
const timeRanges = [
  { value: '1h', label: '1 Hour', entries: 12 },
  { value: '6h', label: '6 Hours', entries: 72 },
  { value: '12h', label: '12 Hours', entries: 144 },
  { value: '24h', label: '24 Hours', entries: 288 },
  { value: '7d', label: '7 Days', entries: 2016 },
  { value: '30d', label: '30 Days', entries: 8640 }
];

let currentTimeRange = localStorage.getItem('timeRange') || '24h';

function filterEntriesByRange(entries, range) {
  const rangeConfig = timeRanges.find(r => r.value === range);
  return entries.slice(-rangeConfig.entries);
}
```

**UI Addition:**
- Add dropdown in header next to refresh button
- Persist selection to localStorage
- Update charts to show filtered data only

**CSS for Dropdown:**
```css
.time-range-selector {
  position: relative;
}

.time-range-select {
  padding: 10px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.875rem;
  cursor: pointer;
  transition: var(--transition-smooth);
}

.time-range-select:hover {
  border-color: var(--accent-primary);
}
```

---

### 1.2 Configurable Data Retention

**Files to create:**
- `scripts/configure-retention.mjs` (new file)

**Files to modify:**
- `scripts/usage-collector.mjs` (read retention config)
- `bin/glm-monitor.js` (add `config` subcommand)

**Implementation:**

```javascript
// bin/glm-monitor.js - Add config command
program
    .command('config')
    .description('Manage configuration')
    .option('--retention <period>', 'Set data retention period (24h, 7d, 30d)')
    .action((options) => {
        if (options.retention) {
            const validPeriods = ['24h', '7d', '30d'];
            if (!validPeriods.includes(options.retention)) {
                console.error(`Invalid retention period. Choose from: ${validPeriods.join(', ')}`);
                return;
            }
            config.set('retention', options.retention);
            console.log(`✓ Retention set to ${options.retention}`);
        } else {
            console.log(`Current retention: ${config.get('retention', '24h')}`);
            console.log(`Auth token: ${config.get('authToken') ? '✓ Set' : '✗ Not set'}`);
            console.log(`Base URL: ${config.get('baseUrl', 'https://api.z.ai/api/anthropic')}`);
        }
    });
```

**Collector changes (scripts/usage-collector.mjs):**
```javascript
// Calculate max entries based on config
const retentionPeriod = config.get('retention', '24h');
const retentionMap = {
  '24h': 288,
  '7d': 2016,
  '30d': 8640
};
const MAX_HISTORY_ENTRIES = retentionMap[retentionPeriod] || 288;
```

---

### 1.3 Usage Rate Calculations

**Files to modify:**
- `src/main.js` (add rate calculation functions, new metric cards)

**Implementation:**

```javascript
function calculateRates(entries) {
  if (entries.length < 2) return null;
  
  const latest = entries[entries.length - 1];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const hourlyEntries = entries.filter(e => new Date(e.timestamp) >= oneHourAgo);
  
  if (hourlyEntries.length < 2) return null;
  
  const first = hourlyEntries[0];
  const tokensPerHour = latest.tokensUsed - first.tokensUsed;
  const callsPerHour = latest.modelCalls - first.modelCalls;
  const avgTokensPerCall = tokensPerHour / (callsPerHour || 1);
  
  return {
    tokensPerHour,
    callsPerHour,
    avgTokensPerCall
  };
}

// Add rate cards to dashboard
function renderRateCards(rates) {
  if (!rates) return;
  
  const container = document.getElementById('rates-grid');
  container.innerHTML = `
    <div class="card">
      <div class="metric-label">Tokens/Hour</div>
      <div class="metric-value">${formatNumber(rates.tokensPerHour)}</div>
    </div>
    <div class="card">
      <div class="metric-label">Calls/Hour</div>
      <div class="metric-value">${formatNumber(rates.callsPerHour)}</div>
    </div>
    <div class="card">
      <div class="metric-label">Avg Tokens/Call</div>
      <div class="metric-value">${rates.avgTokensPerCall.toLocaleString()}</div>
    </div>
  `;
}
```

**HTML Layout:**
```html
<div class="rates-section">
  <h3>Usage Rates (Last Hour)</h3>
  <div id="rates-grid" class="metrics-grid"></div>
</div>
```

---

### 1.4 Predictive Quota Alerts

**Files to modify:**
- `scripts/usage-collector.mjs` (add prediction calculation)
- `bin/glm-monitor.js` (add `predict` command)
- `src/main.js` (display prediction in dashboard)

**Implementation (Collector - scripts/usage-collector.mjs):**

```javascript
function calculateQuotaPrediction(quotaPercent, usageHistory) {
  // Use last 6 hours for rate calculation
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const recentEntries = usageHistory.filter(e => new Date(e.timestamp) >= sixHoursAgo);
  
  if (recentEntries.length < 2) return null;
  
  const oldest = recentEntries[0];
  const latest = recentEntries[recentEntries.length - 1];
  const hoursElapsed = (new Date(latest.timestamp) - new Date(oldest.timestamp)) / (1000 * 60 * 60);
  const percentChange = latest.tokenQuotaPercent - oldest.tokenQuotaPercent;
  const percentPerHour = percentChange / hoursElapsed;
  
  if (percentPerHour <= 0) return null; // Not consuming quota
  
  const remainingPercent = 100 - quotaPercent;
  const hoursUntilExhausted = remainingPercent / percentPerHour;
  
  return {
    hoursUntilExhausted: Math.round(hoursUntilExhausted),
    rate: percentPerHour.toFixed(2)
  };
}

// In collectUsage(), add after quota parsing:
const prediction = calculateQuotaPrediction(entry.tokenQuotaPercent, history.entries);
if (prediction) {
  console.log(`  ⏰ Quota will exhaust in ~${prediction.hoursUntilExhausted} hours at ${prediction.rate}%/hour`);
  if (prediction.hoursUntilExhausted < 24) {
    console.log(`⚠️  WARNING: Quota exhaustion imminent!`);
  }
  history.quotaPrediction = prediction;
}
```

**CLI Command (bin/glm-monitor.js):**

```javascript
program
    .command('predict')
    .description('Predict when quota will be exhausted')
    .action(async () => {
        const history = loadHistory();
        if (history.entries.length === 0) {
            console.error('No usage data available. Run collect first.');
            return;
        }
        
        const latest = history.entries[history.entries.length - 1];
        const prediction = calculateQuotaPrediction(latest.tokenQuotaPercent, history.entries);
        
        if (prediction) {
            console.log(`\n📊 Quota Prediction:`);
            console.log(`   Current usage: ${latest.tokenQuotaPercent}%`);
            console.log(`   Time until exhausted: ${prediction.hoursUntilExhausted} hours`);
            console.log(`   Consumption rate: ${prediction.rate}%/hour\n`);
        } else {
            console.log('Insufficient data for prediction.');
        }
    });
```

**Dashboard Display (src/main.js):**

```javascript
function renderQuotaCard(id, title, limitObj, prediction = null) {
  const container = document.getElementById(id);
  if (!container) return;
  
  const percent = limitObj.percentage;
  const statusClass = percent >= 80 ? 'danger' : (percent >= 50 ? 'warning' '');
  
  const predictionHTML = prediction ? `
    <div class="quota-prediction ${prediction.hoursUntilExhausted < 24 ? 'warning' : ''}">
      ⏰ Exhaustion in ${prediction.hoursUntilExhausted}h
    </div>
  ` : '';
  
  container.innerHTML = `
    <div class="card animate-fade-in">
      <div class="quota-header">
        <div class="quota-title">${title}</div>
        <div class="quota-percent">${percent}%</div>
      </div>
      <div class="progress-container">
        <div class="progress-bar ${statusClass}" style="width: ${percent}%"></div>
      </div>
      <div class="quota-footer">
        <div>Used: <span>${formatNumber(limitObj.current)}</span></div>
        <div>Limit: <span>${formatNumber(limitObj.max)}</span></div>
      </div>
      ${predictionHTML}
    </div>
  `;
}
```

**CSS Additions:**
```css
.quota-prediction {
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(255, 167, 2, 0.1);
  border-left: 3px solid var(--warning);
  border-radius: 4px;
  font-size: 0.8rem;
  color: var(--warning);
}

.quota-prediction.warning {
  background: rgba(255, 71, 87, 0.1);
  border-color: var(--danger);
  color: var(--danger);
}
```

---

### 1.5 CLI Analytics Commands

**Files to create:**
- `scripts/analytics.mjs` (new analytics script)

**Files to modify:**
- `bin/glm-monitor.js` (add analytics subcommand)

**Implementation (bin/glm-monitor.js):**

```javascript
program
    .command('analytics')
    .description('Generate analytics reports')
    .option('--report <type>', 'Report type: summary, rates, tools, peak', 'summary')
    .option('--period <range>', 'Time range: 1h, 6h, 12h, 24h, 7d, 30d', '24h')
    .action((options) => {
        const analyticsPath = path.join(packageRoot, 'scripts/analytics.mjs');
        execSync(`node ${analyticsPath} --report ${options.report} --period ${options.period}`, { 
          stdio: 'inherit' 
        });
    });
```

**Analytics Script (scripts/analytics.mjs):**

```javascript
#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';

const HISTORY_FILE = path.join(os.homedir(), '.glm-monitor', 'usage-history.json');

function generateSummaryReport(entries, period) {
  const latest = entries[entries.length - 1];
  const first = entries[0];
  
  console.log(`\n📊 GLM Usage Summary (${period})\n`);
  console.log(`Total Model Calls:  ${latest.modelCalls.toLocaleString()}`);
  console.log(`Total Tokens Used:  ${(latest.tokensUsed / 1000000).toFixed(2)}M`);
  console.log(`Total MCP Calls:    ${latest.mcpCalls}`);
  console.log(`Token Quota:        ${latest.tokenQuotaPercent}%`);
  console.log(`Time Quota:         ${latest.timeQuotaPercent}%`);
  
  const tokenGrowth = ((latest.tokensUsed - first.tokensUsed) / (first.tokensUsed || 1)) * 100;
  console.log(`Token Growth:       ${tokenGrowth.toFixed(1)}%`);
}

function generateRatesReport(entries) {
  const hourlyRates = [];
  
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    const timeDiff = (new Date(curr.timestamp) - new Date(prev.timestamp)) / (1000 * 60 * 60);
    
    if (timeDiff > 0) {
      hourlyRates.push({
        timestamp: curr.timestamp,
        tokensPerHour: (curr.tokensUsed - prev.tokensUsed) / timeDiff,
        callsPerHour: (curr.modelCalls - prev.modelCalls) / timeDiff
      });
    }
  }
  
  const avgTokensPerHour = hourlyRates.reduce((sum, r) => sum + r.tokensPerHour, 0) / hourlyRates.length;
  const avgCallsPerHour = hourlyRates.reduce((sum, r) => sum + r.callsPerHour, 0) / hourlyRates.length;
  
  console.log(`\n📈 Usage Rates\n`);
  console.log(`Average Tokens/Hour: ${avgTokensPerHour.toFixed(0)}`);
  console.log(`Average Calls/Hour: ${avgCallsPerHour.toFixed(0)}`);
  
  const peak = hourlyRates.reduce((max, r) => r.tokensPerHour > max.tokensPerHour ? r : max);
  console.log(`\n🔥 Peak Usage:\n`);
  console.log(`Time: ${new Date(peak.timestamp).toLocaleString()}`);
  console.log(`Tokens/Hour: ${peak.tokensPerHour.toFixed(0)}`);
}

function generatePeakUsageReport(entries) {
  const hourlyUsage = {};
  
  entries.forEach(entry => {
    const hour = new Date(entry.timestamp).getHours();
    if (!hourlyUsage[hour]) {
      hourlyUsage[hour] = { tokens: 0, calls: 0, count: 0 };
    }
    hourlyUsage[hour].tokens += entry.tokensUsed;
    hourlyUsage[hour].calls += entry.modelCalls;
    hourlyUsage[hour].count += 1;
  });
  
  const peakHour = Object.entries(hourlyUsage)
    .sort(([, a], [, b]) => b.tokens - a.tokens)[0];
  
  console.log(`\n🔥 Peak Usage Hour: ${peakHour[0]}:00 - ${parseInt(peakHour[0]) + 1}:00`);
  console.log(`   Total Tokens: ${(peakHour[1].tokens / 1000000).toFixed(2)}M`);
  console.log(`   Total Calls: ${peakHour[1].calls.toLocaleString()}`);
  console.log(`   Avg Tokens/Entry: ${(peakHour[1].tokens / peakHour[1].count).toFixed(0)}`);
}

// Parse CLI args
const args = process.argv.slice(2);
const reportType = args.includes('--report') ? args[args.indexOf('--report') + 1] : 'summary';
const period = args.includes('--period') ? args[args.indexOf('--period') + 1] : '24h';

// Load data
if (!fs.existsSync(HISTORY_FILE)) {
  console.error('No usage data found. Run glm-monitor collect first.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
const retentionMap = { '1h': 12, '6h': 72, '12h': 144, '24h': 288, '7d': 2016, '30d': 8640 };
const filteredEntries = data.entries.slice(-retentionMap[period]);

if (filteredEntries.length === 0) {
  console.error('Not enough data for the specified period.');
  process.exit(1);
}

// Run appropriate report
switch (reportType) {
  case 'summary':
    generateSummaryReport(filteredEntries, period);
    break;
  case 'rates':
    generateRatesReport(filteredEntries);
    break;
  case 'peak':
    generatePeakUsageReport(filteredEntries);
    break;
  default:
    console.log('Unknown report type. Use: summary, rates, peak');
}
```

---

**Phase 1 Checklist:**
- [ ] 1.1 Time range selector in dashboard
- [ ] 1.2 Configurable data retention via CLI
- [ ] 1.3 Usage rate calculations (tokens/hour, calls/hour, avg tokens/call)
- [ ] 1.4 Predictive quota alerts (6-hour window)
- [ ] 1.5 CLI analytics commands (summary, rates, peak)

---

## PHASE 2: User Experience Enhancements

**Goal:** Better UX with in-dashboard settings, alerts, and tool breakdown

### 2.1 In-Dashboard Settings Modal

**Files to modify:**
- `src/main.js` (add Settings component, API endpoint calls)
- `src/styles.css` (add modal styling)

**Implementation (src/main.js):**

```javascript
function renderSettingsModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Settings</h2>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="setting-group">
          <label>Alert Thresholds</label>
          <div>
            <label>Warning level: </label>
            <select id="warningThreshold">
              <option value="50">50%</option>
              <option value="60">60%</option>
              <option value="70">70%</option>
            </select>
          </div>
          <div>
            <label>Critical level: </label>
            <select id="criticalThreshold">
              <option value="80">80%</option>
              <option value="90">90%</option>
            </select>
          </div>
        </div>
        <div class="setting-group">
          <label>Data Retention</label>
          <select id="retentionPeriod">
            <option value="24h">24 Hours</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
          </select>
        </div>
        <div class="setting-group">
          <label>Refresh Interval</label>
          <select id="refreshInterval">
            <option value="15000">15 seconds</option>
            <option value="30000">30 seconds</option>
            <option value="60000">1 minute</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="cancelSettings">Cancel</button>
        <button class="btn btn-primary" id="saveSettings">Save</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Load current settings from localStorage
  document.getElementById('warningThreshold').value = localStorage.getItem('warningThreshold') || '50';
  document.getElementById('criticalThreshold').value = localStorage.getItem('criticalThreshold') || '80';
  document.getElementById('retentionPeriod').value = config.get('retention', '24h');
  document.getElementById('refreshInterval').value = localStorage.getItem('refreshInterval') || '30000';
  
  // Event handlers
  modal.querySelector('.close-modal').onclick = () => modal.remove();
  document.getElementById('cancelSettings').onclick = () => modal.remove();
  document.getElementById('saveSettings').onclick = async () => {
    await saveSettings({
      warningThreshold: document.getElementById('warningThreshold').value,
      criticalThreshold: document.getElementById('criticalThreshold').value,
      retentionPeriod: document.getElementById('retentionPeriod').value,
      refreshInterval: document.getElementById('refreshInterval').value
    });
    modal.remove();
  };
}

async function saveSettings(settings) {
  // Save to localStorage for UI settings
  localStorage.setItem('warningThreshold', settings.warningThreshold);
  localStorage.setItem('criticalThreshold', settings.criticalThreshold);
  localStorage.setItem('refreshInterval', settings.refreshInterval);
  
  // For retention, need to call API
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retention: settings.retentionPeriod })
    });
    // Refresh data with new settings
    fetchData(true);
  } catch (err) {
    console.error('Failed to save retention setting:', err);
  }
}

// Add settings button to header
const settingsBtn = document.createElement('button');
settingsBtn.className = 'btn';
settingsBtn.textContent = '⚙️';
settingsBtn.onclick = renderSettingsModal;
headerActions.appendChild(settingsBtn);
```

**CSS Additions (src/styles.css):**

```css
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-secondary);
  border: 1px solid var(--glass-border);
  border-radius: 20px;
  padding: 32px;
  max-width: 500px;
  width: 90%;
  box-shadow: var(--shadow-premium);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.modal-header h2 {
  font-size: 1.5rem;
  font-weight: 700;
}

.close-modal {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.setting-group {
  margin-bottom: 24px;
}

.setting-group label {
  display: block;
  color: var(--text-secondary);
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 0.875rem;
}

.setting-group select {
  width: 100%;
  padding: 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  color: var(--text-primary);
  margin-top: 8px;
  cursor: pointer;
}

.modal-footer {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 32px;
}
```

---

### 2.2 Desktop Notifications

**Files to modify:**
- `bin/glm-monitor.js` (add notification server endpoint)
- `src/main.js` (request browser notification permissions, display notifications)
- `package.json` (add `node-notifier` dependency)

**Implementation (package.json):**

```json
{
  "dependencies": {
    "chart.js": "^4.5.1",
    "commander": "^14.0.2",
    "conf": "^15.0.2",
    "opn": "^5.5.0",
    "node-notifier": "^10.0.1"
  }
}
```

**CLI Notification Command (bin/glm-monitor.js):**

```javascript
program
    .command('test-alert')
    .description('Test quota alert notifications')
    .action(() => {
        const notifier = require('node-notifier');
        notifier.notify({
            title: 'GLM Monitor Alert',
            message: '⚠️ Token quota at 85% - Approaching limit!',
            sound: true,
            wait: false
        });
        console.log('✓ Test notification sent');
    });
```

**Dashboard Notifications (src/main.js):**

```javascript
function checkQuotaAlerts(quotaData) {
  const warningThreshold = parseInt(localStorage.getItem('warningThreshold') || '50');
  const criticalThreshold = parseInt(localStorage.getItem('criticalThreshold') || '80');
  
  const lastAlertTime = parseInt(localStorage.getItem('lastAlertTime') || '0');
  const alertCooldown = 60 * 60 * 1000; // 1 hour between alerts
  
  const now = Date.now();
  
  if (quotaData.tokenQuotaPercent >= criticalThreshold && now - lastAlertTime > alertCooldown) {
    sendNotification('Critical', `Token quota at ${quotaData.tokenQuotaPercent}% - Approaching limit!`);
    localStorage.setItem('lastAlertTime', now.toString());
  } else if (quotaData.tokenQuotaPercent >= warningThreshold && now - lastAlertTime > alertCooldown) {
    sendNotification('Warning', `Token quota at ${quotaData.tokenQuotaPercent}% - Monitor usage`);
    localStorage.setItem('lastAlertTime', now.toString());
  }
}

function sendNotification(title, message) {
  // Browser notifications
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(`GLM ${title}`, { body: message, icon: '/icon.png' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(`GLM ${title}`, { body: message });
        }
      });
    }
  }
}

// Call checkQuotaAlerts after data fetch
if (state.data && state.data.quotaLimits) {
  checkQuotaAlerts(state.data.quotaLimits.tokenQuota);
  checkQuotaAlerts(state.data.quotaLimits.timeQuota);
}
```

---

### 2.3 MCP Tool Breakdown

**Files to modify:**
- `scripts/usage-collector.mjs` (track individual tool usage)
- `src/main.js` (add tool breakdown visualization)

**Implementation (Collector - scripts/usage-collector.mjs):**

```javascript
// Modify entry structure to track individual tools
const entry = {
  timestamp: new Date().toISOString(),
  modelCalls: modelTotal.totalModelCallCount || 0,
  tokensUsed: modelTotal.totalTokensUsage || 0,
  mcpCalls: toolTotal.totalSearchMcpCount || 0,
  tokenQuotaPercent: tokenQuota.percentage || 0,
  timeQuotaPercent: timeQuota.percentage || 0,
  mcpToolBreakdown: toolTotal.toolBreakdown || {}  // NEW: Track individual tools
};
```

**Dashboard Visualization (src/main.js):**

```javascript
function renderToolBreakdown(breakdown) {
  const container = document.getElementById('tool-breakdown');
  if (!container || Object.keys(breakdown).length === 0) return;
  
  const sortedTools = Object.entries(breakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  
  const total = sortedTools.reduce((sum, [, count]) => sum + count, 0);
  
  container.innerHTML = `
    <div class="card">
      <div class="quota-header">
        <div class="quota-title">MCP Tool Usage</div>
      </div>
      <div class="tool-list">
        ${sortedTools.map(([tool, count]) => `
          <div class="tool-item">
            <div class="tool-name">${tool}</div>
            <div class="tool-count">${count} (${((count / total) * 100).toFixed(1)}%)</div>
            <div class="tool-bar">
              <div class="tool-bar-fill" style="width: ${(count / total * 100).toFixed(1)}%"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
```

**CSS Additions (src/styles.css):**

```css
.tool-list {
  margin-top: 16px;
}

.tool-item {
  margin-bottom: 16px;
}

.tool-name {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.tool-count {
  font-size: 0.75rem;
  color: var(--text-dim);
  margin-bottom: 4px;
}

.tool-bar {
  height: 6px;
  background: var(--bg-primary);
  border-radius: 3px;
  overflow: hidden;
}

.tool-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
  transition: width 0.3s ease;
}
```

**HTML Layout:**
```html
<div class="tool-section">
  <h3>MCP Tool Breakdown</h3>
  <div id="tool-breakdown"></div>
</div>
```

---

**Phase 2 Checklist:**
- [ ] 2.1 In-dashboard settings modal
- [ ] 2.2 Desktop notifications (CLI + browser)
- [ ] 2.3 MCP tool breakdown visualization

---

## PHASE 3: Data Management & Multi-Profile

**Goal:** Extended data retention, backups, and multiple GLM account support

### 3.1 Extended Data Retention with Summarization

**Files to create:**
- `scripts/data-manager.mjs` (new file)

**Files to modify:**
- `scripts/usage-collector.mjs` (integrate archiving)
- `bin/glm-monitor.js` (add cleanup command)

**Implementation (scripts/data-manager.mjs):**

```javascript
#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import Conf from 'conf';

const config = new Conf({ projectName: 'glm-monitor' });
const DATA_DIR = path.join(os.homedir(), '.glm-monitor');
const HISTORY_FILE = path.join(DATA_DIR, 'usage-history.json');
const SUMMARY_FILE = path.join(DATA_DIR, 'usage-summary.json');

function generateSummaries(entries) {
  // Group by hour
  const hourlySummaries = {};
  
  entries.forEach(entry => {
    const date = new Date(entry.timestamp);
    const hourKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}`;
    
    if (!hourlySummaries[hourKey]) {
      hourlySummaries[hourKey] = {
        timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).toISOString(),
        modelCalls: 0,
        tokensUsed: 0,
        mcpCalls: 0,
        entryCount: 0
      };
    }
    
    hourlySummaries[hourKey].modelCalls += entry.modelCalls;
    hourlySummaries[hourKey].tokensUsed += entry.tokensUsed;
    hourlySummaries[hourKey].mcpCalls += entry.mcpCalls;
    hourlySummaries[hourKey].entryCount += 1;
  });
  
  return Object.values(hourlySummaries);
}

function archiveOldData(retentionPeriod) {
  const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  const retentionHours = {
    '7d': 7 * 24,
    '30d': 30 * 24
  };
  
  const hoursToKeep = retentionHours[retentionPeriod];
  if (!hoursToKeep) return;
  
  // Keep raw data for 24h, older data gets summarized
  const rawEntriesLimit = 288;
  const entriesToSummarize = data.entries.length - rawEntriesLimit;
  
  if (entriesToSummarize > 0) {
    const entriesToArchive = data.entries.slice(0, entriesToSummarize);
    const summaries = generateSummaries(entriesToArchive);
    
    // Load existing summaries
    let existingSummaries = [];
    if (fs.existsSync(SUMMARY_FILE)) {
      const summaryData = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf-8'));
      existingSummaries = summaryData.summaries || [];
    }
    
    // Merge summaries
    const allSummaries = [...existingSummaries, ...summaries];
    const uniqueSummaries = allSummaries.filter((summary, index, self) =>
      index === self.findIndex(s => s.timestamp === summary.timestamp)
    );
    
    // Trim summaries based on retention
    const cutoffDate = new Date(Date.now() - hoursToKeep * 60 * 60 * 1000);
    const trimmedSummaries = uniqueSummaries.filter(s => new Date(s.timestamp) >= cutoffDate);
    
    // Save summaries
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify({
      summaries: trimmedSummaries,
      lastUpdated: new Date().toISOString()
    }, null, 2));
    
    console.log(`✓ Archived ${entriesToSummarize} entries into ${trimmedSummaries.length} hourly summaries`);
  }
  
  // Trim raw entries to 24h
  data.entries = data.entries.slice(-rawEntriesLimit);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
  console.log(`✓ Trimmed raw data to ${data.entries.length} entries (24 hours)`);
}

// Run archiving
const retentionPeriod = config.get('retention', '24h');
if (retentionPeriod !== '24h') {
  archiveOldData(retentionPeriod);
} else {
  console.log('24h retention - no archiving needed');
}
```

**CLI Command (bin/glm-monitor.js):**

```javascript
program
    .command('cleanup')
    .description('Archive and clean up old data')
    .option('--older-than <days>', 'Archive data older than X days')
    .action((options) => {
        const dataManagerPath = path.join(packageRoot, 'scripts/data-manager.mjs');
        execSync(`node ${dataManagerPath}`, { stdio: 'inherit' });
    });
```

---

### 3.2 Backup & Restore

**Files to modify:**
- `bin/glm-monitor.js` (add backup/restore commands)

**Implementation:**

```javascript
program
    .command('backup')
    .description('Backup usage data')
    .option('--to <path>', 'Backup directory path')
    .action((options) => {
        const dataDir = path.join(os.homedir(), '.glm-monitor');
        const backupPath = options.to || path.join(os.homedir(), 'glm-monitor-backups');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupFile = path.join(backupPath, `backup-${timestamp}.json`);
        
        fs.mkdirSync(backupPath, { recursive: true });
        
        const historyData = JSON.parse(fs.readFileSync(path.join(dataDir, 'usage-history.json'), 'utf-8'));
        const summaryPath = path.join(dataDir, 'usage-summary.json');
        const summaryData = fs.existsSync(summaryPath)
          ? JSON.parse(fs.readFileSync(summaryPath, 'utf-8'))
          : { summaries: [] };
        
        const backup = {
          timestamp: new Date().toISOString(),
          history: historyData,
          summaries: summaryData
        };
        
        fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
        console.log(`✓ Backup created: ${backupFile}`);
        console.log(`  Size: ${fs.statSync(backupFile).size} bytes`);
    });

program
    .command('restore')
    .description('Restore usage data from backup')
    .option('--from <path>', 'Backup file path')
    .action((options) => {
        const backupPath = options.from;
        if (!backupPath || !fs.existsSync(backupPath)) {
            console.error('Backup file not found. Specify with --from <path>');
            return;
        }
        
        const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
        const dataDir = path.join(os.homedir(), '.glm-monitor');
        
        // Confirm restore
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        readline.question(`Restore backup from ${new Date(backup.timestamp).toLocaleString()}? [y/N]: `, (answer) => {
            readline.close();
            
            if (answer.toLowerCase() !== 'y') {
                console.log('Restore cancelled');
                return;
            }
            
            fs.writeFileSync(
                path.join(dataDir, 'usage-history.json'),
                JSON.stringify(backup.history, null, 2)
            );
            
            if (backup.summaries && backup.summaries.summaries) {
                fs.writeFileSync(
                    path.join(dataDir, 'usage-summary.json'),
                    JSON.stringify(backup.summaries, null, 2)
                );
            }
            
            console.log(`✓ Restored from: ${backupPath}`);
            console.log(`  History entries: ${backup.history.entries.length}`);
            console.log(`  Summary entries: ${backup.summaries.summaries.length}`);
        });
    });
```

---

### 3.3 Multi-Profile Support

**Files to modify:**
- `bin/glm-monitor.js` (add profile commands)
- `scripts/usage-collector.mjs` (use profile-specific data)
- `src/main.js` (display current profile)

**Implementation (bin/glm-monitor.js):**

```javascript
program
    .command('profile')
    .description('Manage multiple GLM account profiles')
    .option('--create <name>', 'Create a new profile')
    .option('--switch <name>', 'Switch to a profile')
    .option('--list', 'List all profiles')
    .option('--delete <name>', 'Delete a profile')
    .action((options) => {
        const config = new Conf({ projectName: 'glm-monitor' });
        
        if (options.create) {
            const profileName = options.create;
            const profiles = config.get('profiles', {});
            
            if (profiles[profileName]) {
                console.error(`Profile "${profileName}" already exists.`);
                return;
            }
            
            // Prompt for token
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            readline.question(`Enter GLM auth token for "${profileName}": `, (token) => {
                readline.close();
                
                profiles[profileName] = {
                    authToken: token,
                    baseUrl: config.get('baseUrl', 'https://api.z.ai/api/anthropic'),
                    createdAt: new Date().toISOString()
                };
                
                config.set('profiles', profiles);
                console.log(`✓ Profile "${profileName}" created`);
                
                // Ask if this should be the active profile
                const current = config.get('activeProfile');
                if (!current) {
                    config.set('activeProfile', profileName);
                    console.log(`✓ Set "${profileName}" as active profile`);
                }
            });
        }
        
        if (options.list) {
            const profiles = config.get('profiles', {});
            const active = config.get('activeProfile');
            
            console.log('\n📋 Profiles:');
            Object.entries(profiles).forEach(([name, profile]) => {
                const marker = name === active ? '✓ ' : '  ';
                console.log(`${marker}${name} (created: ${new Date(profile.createdAt).toLocaleDateString()})`);
            });
            console.log(`\nActive profile: ${active || 'none'}`);
        }
        
        if (options.switch) {
            const profiles = config.get('profiles', {});
            const profileName = options.switch;
            
            if (!profiles[profileName]) {
                console.error(`Profile "${profileName}" not found.`);
                return;
            }
            
            config.set('activeProfile', profileName);
            console.log(`✓ Switched to profile "${profileName}"`);
        }
        
        if (options.delete) {
            const profiles = config.get('profiles', {});
            const profileName = options.delete;
            
            if (!profiles[profileName]) {
                console.error(`Profile "${profileName}" not found.`);
                return;
            }
            
            if (profileName === config.get('activeProfile')) {
                console.error('Cannot delete the active profile. Switch to another profile first.');
                return;
            }
            
            delete profiles[profileName];
            config.set('profiles', profiles);
            console.log(`✓ Deleted profile "${profileName}"`);
        }
    });
```

**Profile-Specific Data Storage (scripts/usage-collector.mjs):**

```javascript
function getProfileDataPath() {
  const config = new Conf({ projectName: 'glm-monitor' });
  const activeProfile = config.get('activeProfile', 'default');
  return path.join(os.homedir(), '.glm-monitor', `${activeProfile}-usage-history.json`);
}

// Update HISTORY_FILE constant
const HISTORY_FILE = getProfileDataPath();
```

**Dashboard Profile Display (src/main.js):**

```javascript
function getCurrentProfile() {
  return localStorage.getItem('currentProfile') || 'default';
}

// Add profile indicator to header
const profileIndicator = document.createElement('div');
profileIndicator.className = 'profile-indicator';
profileIndicator.textContent = `👤 ${getCurrentProfile()}`;
titleSection.appendChild(profileIndicator);
```

**CSS:**
```css
.profile-indicator {
  font-size: 0.875rem;
  color: var(--text-dim);
  padding: 4px 12px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  display: inline-block;
}
```

---

**Phase 3 Checklist:**
- [ ] 3.1 Extended data retention with hourly summarization
- [ ] 3.2 Backup and restore commands
- [ ] 3.3 Multi-profile support (create, switch, list, delete)

---

## PHASE 4: REST API for Local Integrations

**Goal:** Lightweight API for custom scripts and automation (localhost-only)

### 4.1 REST API Server

**Files to create:**
- `scripts/api-server.mjs` (new API server)

**Files to modify:**
- `bin/glm-monitor.js` (add API server command)
- `package.json` (add `express` dependency)

**Implementation (package.json):**

```json
{
  "dependencies": {
    "chart.js": "^4.5.1",
    "commander": "^14.0.2",
    "conf": "^15.0.2",
    "opn": "^5.5.0",
    "node-notifier": "^10.0.1",
    "express": "^4.18.2"
  }
}
```

**API Server (scripts/api-server.mjs):**

```javascript
#!/usr/bin/env node

import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Conf from 'conf';

const config = new Conf({ projectName: 'glm-monitor' });
const activeProfile = config.get('activeProfile', 'default');
const HISTORY_FILE = path.join(os.homedir(), '.glm-monitor', `${activeProfile}-usage-history.json`);
const SUMMARY_FILE = path.join(os.homedir(), '.glm-monitor', `${activeProfile}-usage-summary.json`);

const app = express();
const PORT = process.env.PORT || 8081;

// Middleware
app.use(express.json());

// CORS for local requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Load data helper
function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    let summaries = [];
    if (fs.existsSync(SUMMARY_FILE)) {
      const summaryData = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf-8'));
      summaries = summaryData.summaries || [];
    }
    return { ...data, summaries };
  } catch (err) {
    return null;
  }
}

// Routes

// GET /api/health - Health check
app.get('/api/health', (req, res) => {
  const data = loadData();
  res.json({
    status: 'ok',
    dataAvailable: !!data,
    lastUpdated: data?.lastUpdated || null,
    entriesCount: data?.entries?.length || 0
  });
});

// GET /api/current - Current usage snapshot
app.get('/api/current', (req, res) => {
  const data = loadData();
  if (!data || data.entries.length === 0) {
    return res.status(404).json({ error: 'No data available' });
  }
  
  const latest = data.entries[data.entries.length - 1];
  res.json({
    timestamp: latest.timestamp,
    modelCalls: latest.modelCalls,
    tokensUsed: latest.tokensUsed,
    mcpCalls: latest.mcpCalls,
    tokenQuotaPercent: latest.tokenQuotaPercent,
    timeQuotaPercent: latest.timeQuotaPercent,
    quotaLimits: data.quotaLimits
  });
});

// GET /api/history - Historical data with optional range
app.get('/api/history', (req, res) => {
  const data = loadData();
  if (!data) {
    return res.status(404).json({ error: 'No data available' });
  }
  
  const { range, format } = req.query;
  let entries = [...data.entries];
  
  // Filter by range
  if (range) {
    const rangeMap = {
      '1h': 12,
      '6h': 72,
      '12h': 144,
      '24h': 288,
      '7d': 2016,
      '30d': 8640
    };
    const limit = rangeMap[range];
    if (limit) {
      entries = entries.slice(-limit);
    }
  }
  
  // Include summaries for long ranges
  if (range === '7d' || range === '30d') {
    entries = [...data.summaries.slice(-entries.length), ...entries];
  }
  
  // Format selection
  if (format === 'summary') {
    const first = entries[0];
    const last = entries[entries.length - 1];
    res.json({
      totalModelCalls: last.modelCalls,
      totalTokensUsed: last.tokensUsed,
      totalMcpCalls: last.mcpCalls,
      tokenGrowth: ((last.tokensUsed - first.tokensUsed) / (first.tokensUsed || 1)) * 100,
      entryCount: entries.length,
      timeRange: {
        start: first.timestamp,
        end: last.timestamp
      }
    });
  } else {
    res.json({ entries, lastUpdated: data.lastUpdated });
  }
});

// GET /api/predict - Quota exhaustion prediction
app.get('/api/predict', (req, res) => {
  const data = loadData();
  if (!data || data.entries.length < 2) {
    return res.status(404).json({ error: 'Insufficient data for prediction' });
  }
  
  const { timeWindow = '6h' } = req.query;
  const windowHours = parseInt(timeWindow) || 6;
  
  const cutoffDate = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const recentEntries = data.entries.filter(e => new Date(e.timestamp) >= cutoffDate);
  
  if (recentEntries.length < 2) {
    return res.status(404).json({ error: 'Insufficient data for prediction' });
  }
  
  const oldest = recentEntries[0];
  const latest = recentEntries[recentEntries.length - 1];
  const hoursElapsed = (new Date(latest.timestamp) - new Date(oldest.timestamp)) / (1000 * 60 * 60);
  const percentChange = latest.tokenQuotaPercent - oldest.tokenQuotaPercent;
  const percentPerHour = percentChange / hoursElapsed;
  
  if (percentPerHour <= 0) {
    return res.json({
      tokenQuotaPercent: latest.tokenQuotaPercent,
      hoursUntilExhausted: null,
      rate: percentPerHour,
      message: 'Quota not being consumed'
    });
  }
  
  const remainingPercent = 100 - latest.tokenQuotaPercent;
  const hoursUntilExhausted = remainingPercent / percentPerHour;
  
  res.json({
    tokenQuotaPercent: latest.tokenQuotaPercent,
    hoursUntilExhausted: Math.round(hoursUntilExhausted),
    rate: percentPerHour.toFixed(2),
    window: `${windowHours}h`
  });
});

// GET /api/settings - Get current configuration
app.get('/api/settings', (req, res) => {
  res.json({
    retention: config.get('retention', '24h'),
    activeProfile: activeProfile,
    profiles: config.get('profiles', {})
  });
});

// POST /api/settings - Update configuration
app.post('/api/settings', (req, res) => {
  const { retention } = req.body;
  
  if (retention) {
    const validPeriods = ['24h', '7d', '30d'];
    if (!validPeriods.includes(retention)) {
      return res.status(400).json({ error: 'Invalid retention period' });
    }
    config.set('retention', retention);
  }
  
  res.json({ success: true, settings: {
    retention: config.get('retention', '24h'),
    activeProfile: activeProfile
  }});
});

// Start server
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🚀 GLM Monitor API Server running on http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  /api/health     - Health check`);
  console.log(`  GET  /api/current    - Current usage`);
  console.log(`  GET  /api/history    - Historical data (range=1h,6h,12h,24h,7d,30d)`);
  console.log(`  GET  /api/predict    - Quota prediction (timeWindow=6h)`);
  console.log(`  GET  /api/settings   - Current configuration`);
  console.log(`  POST /api/settings   - Update configuration\n`);
});
```

**CLI Command (bin/glm-monitor.js):**

```javascript
program
    .command('api')
    .description('Start REST API server for integrations')
    .option('-p, --port <port>', 'Port to listen on', '8081')
    .action((options) => {
        const port = parseInt(options.port, 10);
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
            console.error(`Invalid port: ${options.port}`);
            return;
        }
        
        const apiPath = path.join(packageRoot, 'scripts/api-server.mjs');
        const apiServer = spawn('node', [apiPath], {
            env: { ...process.env, PORT: port.toString() },
            stdio: 'inherit'
        });
        
        console.log('\n🔌 API server starting...');
        
        apiServer.on('error', (err) => {
            console.error('Failed to start API server:', err.message);
        });
        
        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n\nShutting down API server...');
            apiServer.kill();
            process.exit(0);
        });
    });
```

---

### 4.2 Integration Examples

**Files to create:**
- `docs/api-examples.md` (new file with integration examples)

**Content:**

```markdown
# API Integration Examples

This document provides examples for integrating with the GLM Monitor REST API.

## Starting the API Server

```bash
glm-monitor api -p 8081
```

The API runs on `http://localhost:8081` by default.

## Available Endpoints

- `GET /api/health` - Health check
- `GET /api/current` - Current usage snapshot
- `GET /api/history` - Historical data with range filter
- `GET /api/predict` - Quota exhaustion prediction
- `GET /api/settings` - Current configuration
- `POST /api/settings` - Update configuration

---

## Shell Script Examples

### Check current usage
```bash
curl -s http://localhost:8081/api/current | jq '.'
```

### Get 24h history
```bash
curl -s http://localhost:8081/api/history?range=24h | jq '.entries | length'
```

### Get summary of last 7 days
```bash
curl -s http://localhost:8081/api/history?range=7d&format=summary | jq
```

### Get quota prediction
```bash
curl -s http://localhost:8081/api/predict | jq '.hoursUntilExhausted'
```

### Check API health
```bash
curl -s http://localhost:8081/api/health | jq '.status'
```

---

## Python Examples

```python
import requests
import json

API_URL = "http://localhost:8081"

def get_current_usage():
    """Get current usage snapshot"""
    response = requests.get(f"{API_URL}/api/current")
    return response.json()

def get_history(range='24h', format=None):
    """Get historical data"""
    params = {'range': range}
    if format:
        params['format'] = format
    response = requests.get(f"{API_URL}/api/history", params=params)
    return response.json()

def get_prediction(time_window='6h'):
    """Get quota exhaustion prediction"""
    params = {'timeWindow': time_window}
    response = requests.get(f"{API_URL}/api/predict", params=params)
    return response.json()

def check_health():
    """Check API health"""
    response = requests.get(f"{API_URL}/api/health")
    return response.json()

# Example usage
if __name__ == "__main__":
    # Get current usage
    current = get_current_usage()
    print(f"Current quota: {current['tokenQuotaPercent']}%")
    print(f"Tokens used: {current['tokensUsed']:,}")
    
    # Get prediction
    prediction = get_prediction()
    if prediction['hoursUntilExhausted']:
        print(f"\nQuota will exhaust in {prediction['hoursUntilExhausted']} hours")
    
    # Get 24h summary
    summary = get_history('24h', 'summary')
    print(f"\nLast 24h:")
    print(f"  Total calls: {summary['totalModelCalls']:,}")
    print(f"  Total tokens: {(summary['totalTokensUsed']/1_000_000):.2f}M")
```

---

## Node.js Examples

```javascript
const API_URL = 'http://localhost:8081';

async function getUsageSummary() {
  const response = await fetch(`${API_URL}/api/history?range=24h&format=summary`);
  const data = await response.json();
  
  console.log(`Total tokens: ${(data.totalTokensUsed / 1000000).toFixed(2)}M`);
  console.log(`Total calls: ${data.totalModelCalls.toLocaleString()}`);
  console.log(`Total MCP calls: ${data.totalMcpCalls}`);
  console.log(`Token growth: ${data.tokenGrowth.toFixed(1)}%`);
}

async function monitorQuota() {
  const current = await fetch(`${API_URL}/api/current`).then(r => r.json());
  const prediction = await fetch(`${API_URL}/api/predict`).then(r => r.json());
  
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
getUsageSummary();
monitorQuota();
healthCheck();
```

---

## GitHub Actions Integration

Create a workflow file `.github/workflows/glm-usage-report.yml`:

```yaml
name: GLM Usage Report

on:
  schedule:
    - cron: '0 9 * * *'  # Daily at 9 AM
  workflow_dispatch:

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - name: Get GLM Usage
        run: |
          curl -s http://localhost:8081/api/history?range=24h&format=summary > usage.json
          cat usage.json
      
      - name: Post to Issue
        uses: actions/github-script@v6
        with:
          script: |
            const usage = require('./usage.json');
            const body = `
              ## GLM Usage Report - ${new Date().toLocaleDateString()}
              
              ### Last 24 Hours
              - **Total Calls:** ${usage.totalModelCalls.toLocaleString()}
              - **Total Tokens:** ${(usage.totalTokensUsed / 1000000).toFixed(2)}M
              - **MCP Calls:** ${usage.totalMcpCalls}
              - **Growth:** ${usage.tokenGrowth.toFixed(1)}%
              
              *Report generated by GLM Monitor*
            `;
            
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Daily Usage Report - ${new Date().toISOString().split('T')[0]}`,
              body: body
            });
```

---

## Automation Examples

### macOS Launchd Integration

Create `~/Library/LaunchAgents/com.user.glm-monitor.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.user.glm-monitor</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/npm</string>
    <string>run</string>
    <string>collect</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/glm-monitor</string>
  <key>StartInterval</key>
  <integer>300</integer>
</dict>
</plist>
```

Load with:
```bash
launchctl load ~/Library/LaunchAgents/com.user.glm-monitor.plist
```

### Linux Cron Integration

```bash
# Collect data every 5 minutes
*/5 * * * * cd /path/to/glm-monitor && npm run collect

# Daily backup
0 2 * * * cd /path/to/glm-monitor && npm run backup
```

### Windows Task Scheduler

```powershell
# Create a task to collect data every 5 minutes
schtasks /create /tn "GLM Monitor Collect" /tr "npm run collect" /sc minute /mo 5 /st 00:00
```

---

## Error Handling

All endpoints return JSON responses. Check the status code:

- `200` - Success
- `400` - Bad request (invalid parameters)
- `404` - Not found (no data available)

Example error response:
```json
{
  "error": "No data available"
}
```
```

---

**Phase 4 Checklist:**
- [ ] 4.1 REST API server with all endpoints
- [ ] 4.2 API documentation and integration examples

---

## PHASE 5: Diagnostics & Debugging

**Goal:** Health checks, diagnostics, and usage insights

### 5.1 Health Check Command

**Files to modify:**
- `bin/glm-monitor.js` (add health-check command)

**Implementation:**

```javascript
program
    .command('health-check')
    .description('Run system health diagnostics')
    .action(async () => {
        console.log('\n🏥 GLM Monitor Health Check\n');
        
        let allPassed = true;
        
        // Check 1: Configuration
        console.log('Checking configuration...');
        const config = new Conf({ projectName: 'glm-monitor' });
        const hasAuthToken = config.get('authToken') || process.env.ANTHROPIC_AUTH_TOKEN;
        
        if (hasAuthToken) {
            console.log('  ✓ Auth token configured');
        } else {
            console.log('  ✗ No auth token found - Run: glm-monitor init');
            allPassed = false;
        }
        
        // Check 2: Data file
        console.log('\nChecking data files...');
        const dataDir = path.join(os.homedir(), '.glm-monitor');
        const historyFile = path.join(dataDir, 'usage-history.json');
        
        if (fs.existsSync(historyFile)) {
            const stats = fs.statSync(historyFile);
            console.log(`  ✓ History file exists (${stats.size} bytes)`);
            
            const data = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
            console.log(`  ✓ ${data.entries.length} entries`);
            
            // Check for stale data
            const lastUpdated = new Date(data.lastUpdated);
            const staleMinutes = (Date.now() - lastUpdated.getTime()) / (1000 * 60);
            if (staleMinutes > 30) {
                console.log(`  ⚠️  Data is ${Math.round(staleMinutes)} minutes old`);
            } else {
                console.log(`  ✓ Data is recent (${Math.round(staleMinutes)} minutes old)`);
            }
        } else {
            console.log('  ✗ No history file - Run: glm-monitor collect');
            allPassed = false;
        }
        
        // Check 3: API connectivity
        console.log('\nChecking GLM API connectivity...');
        try {
            const baseUrl = config.get('baseUrl') || process.env.ANTHROPIC_BASE_URL;
            const authToken = config.get('authToken') || process.env.ANTHROPIC_AUTH_TOKEN;
            
            if (baseUrl && authToken) {
                console.log('  ✓ API credentials configured');
                console.log(`     URL: ${baseUrl}`);
            } else {
                console.log('  ✗ API credentials missing');
                allPassed = false;
            }
        } catch (err) {
            console.log('  ✗ API connectivity issue');
            allPassed = false;
        }
        
        // Check 4: Disk space
        console.log('\nChecking disk space...');
        try {
            const stats = fs.statSync(dataDir);
            console.log(`  ✓ Data directory accessible: ${dataDir}`);
        } catch (err) {
            console.log('  ✗ Data directory not accessible');
            allPassed = false;
        }
        
        // Summary
        console.log('\n' + '='.repeat(50));
        if (allPassed) {
            console.log('✓ All checks passed!');
        } else {
            console.log('✗ Some checks failed - See above for details');
            console.log('  Run: glm-monitor diagnose for detailed diagnostics');
        }
        console.log('='.repeat(50) + '\n');
    });
```

---

### 5.2 Diagnose Command

**Files to create:**
- `scripts/diagnostics.mjs` (new file)

**Implementation:**

```javascript
#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import Conf from 'conf';

const config = new Conf({ projectName: 'glm-monitor' });
const dataDir = path.join(os.homedir(), '.glm-monitor');
const historyFile = path.join(dataDir, 'usage-history.json');

console.log('\n🔬 GLM Monitor Diagnostics\n');

let issuesFound = 0;

// Issue 1: Missing auth token
if (!config.get('authToken') && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.log('⚠️  Issue: No auth token configured');
  console.log('   Fix: Run `glm-monitor init -t YOUR_TOKEN`');
  issuesFound++;
}

// Issue 2: Data file doesn't exist
if (!fs.existsSync(historyFile)) {
  console.log('\n⚠️  Issue: No usage data file');
  console.log('   Fix: Run `glm-monitor collect`');
  issuesFound++;
  process.exit(0);
}

// Load data
const data = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));

// Issue 3: Stale data
const lastUpdated = new Date(data.lastUpdated);
const staleHours = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
if (staleHours > 24) {
  console.log('\n⚠️  Issue: Data is very old (' + Math.round(staleHours) + ' hours)');
  console.log('   Fix: Run `glm-monitor collect` or set up automation');
  issuesFound++;
}

// Issue 4: Too few entries
if (data.entries.length < 10) {
  console.log('\n⚠️  Issue: Insufficient data for analytics');
  console.log('   Fix: Run collector multiple times or wait for more data');
  issuesFound++;
}

// Issue 5: High quota usage
const latest = data.entries[data.entries.length - 1];
if (latest.tokenQuotaPercent > 80) {
  console.log('\n⚠️  Issue: Token quota nearly exhausted (' + latest.tokenQuotaPercent + '%)');
  console.log('   Fix: Reduce usage or wait for quota reset');
  issuesFound++;
}

if (latest.timeQuotaPercent > 80) {
  console.log('\n⚠️  Issue: Time quota nearly exhausted (' + latest.timeQuotaPercent + '%)');
  console.log('   Fix: Reduce usage or wait for quota reset');
  issuesFound++;
}

// Issue 6: Config issues
const retention = config.get('retention');
if (!retention) {
  console.log('\n⚠️  Issue: Retention period not configured');
  console.log('   Fix: Run `glm-monitor config --retention 24h`');
  issuesFound++;
}

// System stats
console.log('\n📊 System Information:');
console.log('   Platform: ' + os.platform());
console.log('   Node.js: ' + process.version);
console.log('   Data directory: ' + dataDir);
console.log('   History size: ' + fs.statSync(historyFile).size + ' bytes');
console.log('   Entries: ' + data.entries.length);

// Summary
console.log('\n' + '='.repeat(50));
if (issuesFound === 0) {
  console.log('✓ No issues found!');
} else {
  console.log('⚠️  ' + issuesFound + ' issue(s) found - See above for details');
}
console.log('='.repeat(50) + '\n');
```

**CLI Command (bin/glm-monitor.js):**

```javascript
program
    .command('diagnose')
    .description('Run diagnostics and report issues')
    .action(() => {
        const diagnosticsPath = path.join(packageRoot, 'scripts/diagnostics.mjs');
        execSync(`node ${diagnosticsPath}`, { stdio: 'inherit' });
    });
```

---

### 5.3 Usage Insights Command

**Files to modify:**
- `scripts/analytics.mjs` (extend with insights)

**Implementation:**

```javascript
function generateInsights(entries) {
  console.log('\n💡 Usage Insights\n');
  
  // Peak usage by hour
  const hourlyUsage = {};
  entries.forEach(entry => {
    const hour = new Date(entry.timestamp).getHours();
    if (!hourlyUsage[hour]) {
      hourlyUsage[hour] = { tokens: 0, calls: 0 };
    }
    hourlyUsage[hour].tokens += entry.tokensUsed;
    hourlyUsage[hour].calls += entry.modelCalls;
  });
  
  const peakHour = Object.entries(hourlyUsage)
    .sort(([, a], [, b]) => b.tokens - a.tokens)[0];
  
  console.log(`🔥 Peak Usage Hour: ${peakHour[0]}:00 - ${parseInt(peakHour[0]) + 1}:00`);
  console.log(`   Tokens: ${(peakHour[1].tokens / 1000000).toFixed(2)}M`);
  console.log(`   Calls: ${peakHour[1].calls.toLocaleString()}`);
  
  // Day of week pattern
  const dailyUsage = {};
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  entries.forEach(entry => {
    const day = new Date(entry.timestamp).getDay();
    if (!dailyUsage[day]) {
      dailyUsage[day] = { tokens: 0, calls: 0, entries: 0 };
    }
    dailyUsage[day].tokens += entry.tokensUsed;
    dailyUsage[day].calls += entry.modelCalls;
    dailyUsage[day].entries += 1;
  });
  
  const sortedDays = Object.entries(dailyUsage)
    .sort(([, a], [, b]) => b.tokens - a.tokens);
  
  console.log('\n📅 Usage by Day of Week:');
  sortedDays.forEach(([day, stats]) => {
    const avgTokens = stats.tokens / (stats.entries || 1);
    console.log(`   ${dayNames[day]}: ${(avgTokens / 1000).toFixed(0)}K tokens/entry`);
  });
  
  // Growth rate
  if (entries.length > 10) {
    const recent = entries.slice(-10);
    const older = entries.slice(0, 10);
    
    const recentRate = (recent[recent.length - 1].tokensUsed - recent[0].tokensUsed) / recent.length;
    const olderRate = (older[older.length - 1].tokensUsed - older[0].tokensUsed) / older.length;
    
    const growthFactor = recentRate / (olderRate || 1);
    
    console.log('\n📈 Usage Trend:');
    if (growthFactor > 1.2) {
      console.log(`   ⚠️  Usage increasing rapidly (${(growthFactor * 100 - 100).toFixed(0)}% faster)`);
    } else if (growthFactor < 0.8) {
      console.log(`   ✓ Usage decreasing (${(100 - growthFactor * 100).toFixed(0)}% slower)`);
    } else {
      console.log(`   → Usage stable`);
    }
  }
}

// Add to switch statement in analytics.mjs
case 'insights':
  generateInsights(filteredEntries);
  break;
```

**CLI Command (bin/glm-monitor.js):**

```javascript
program
    .command('insights')
    .description('Generate usage insights and patterns')
    .option('--period <range>', 'Time range: 1h, 6h, 12h, 24h, 7d, 30d', '24h')
    .action((options) => {
        const analyticsPath = path.join(packageRoot, 'scripts/analytics.mjs');
        execSync(`node ${analyticsPath} --report insights --period ${options.period}`, { 
          stdio: 'inherit' 
        });
    });
```

---

**Phase 5 Checklist:**
- [ ] 5.1 Health check command
- [ ] 5.2 Diagnostics command
- [ ] 5.3 Usage insights command

---

## PHASE 6: Polish & UX Refinements

**Goal:** Complete experience with polish, themes, and ease of use

### 6.1 Theme Toggle

**Files to modify:**
- `src/main.js` (add theme state management)
- `src/styles.css` (add light theme variables)

**Implementation (src/styles.css):**

```css
/* Light theme overrides */
[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-tertiary: #e9ecef;
  --accent-primary: #0066cc;
  --accent-secondary: #00aa44;
  --accent-tertiary: #5500cc;
  --text-primary: #212529;
  --text-secondary: #495057;
  --text-dim: #adb5bd;
  --glass-bg: rgba(255, 255, 255, 0.9);
  --glass-border: rgba(0, 0, 0, 0.1);
  --shadow-premium: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
}

/* Update background animation for light theme */
[data-theme="light"] body::before {
  background: radial-gradient(circle at 50% 50%, rgba(0, 102, 204, 0.05) 0%, transparent 50%),
      radial-gradient(circle at 80% 20%, rgba(85, 0, 204, 0.05) 0%, transparent 40%);
}
```

**JavaScript (src/main.js):**

```javascript
// Theme management
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    themeBtn.onclick = toggleTheme;
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
  }
}

// Add to header
const themeBtn = document.createElement('button');
themeBtn.className = 'btn';
themeBtn.id = 'themeToggle';
themeBtn.style.padding = '10px 14px';
themeBtn.style.fontSize = '1.2rem';
headerActions.appendChild(themeBtn);

// Initialize theme on load
initTheme();
```

---

### 6.2 Keyboard Shortcuts

**Files to modify:**
- `src/main.js` (add keyboard event listeners)

**Implementation:**

```javascript
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }
    
    switch (e.key.toLowerCase()) {
      case 'r':
        e.preventDefault();
        fetchData(true);
        showToast('Refreshing data...');
        break;
      case 'e':
        e.preventDefault();
        exportCSV();
        showToast('Data exported');
        break;
      case 's':
        e.preventDefault();
        renderSettingsModal();
        break;
      case 'h':
        e.preventDefault();
        showHelpModal();
        break;
      case '?':
        e.preventDefault();
        showHelpModal();
        break;
      case 'escape':
        closeModal();
        break;
    }
  });
}

function showHelpModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Keyboard Shortcuts</h2>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="shortcut-list">
          <div class="shortcut-item"><kbd>R</kbd> <span>Refresh data</span></div>
          <div class="shortcut-item"><kbd>E</kbd> <span>Export CSV</span></div>
          <div class="shortcut-item"><kbd>S</kbd> <span>Settings</span></div>
          <div class="shortcut-item"><kbd>H</kbd> or <kbd>?</kbd> <span>Show help</span></div>
          <div class="shortcut-item"><kbd>Esc</kbd> <span>Close modal</span></div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.querySelector('.close-modal').onclick = () => modal.remove();
}

function closeModal() {
  const modal = document.querySelector('.modal');
  if (modal) {
    modal.remove();
  }
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('toast-show');
  }, 10);
  
  setTimeout(() => {
    toast.classList.remove('toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
```

**CSS Additions (src/styles.css):**

```css
.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

kbd {
  background: var(--bg-tertiary);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--glass-border);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.875rem;
  min-width: 32px;
  text-align: center;
  font-weight: 600;
}

.shortcut-item span {
  color: var(--text-secondary);
}

.toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--accent-primary);
  color: var(--bg-primary);
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  box-shadow: var(--shadow-premium);
  transform: translateY(100px);
  opacity: 0;
  transition: all 0.3s ease;
  z-index: 2000;
}

.toast.toast-show {
  transform: translateY(0);
  opacity: 1;
}
```

---

### 6.3 Loading States & Skeleton Screens

**Files to modify:**
- `src/main.js` (improve loading states)
- `src/styles.css` (add skeleton animation)

**CSS Additions (src/styles.css):**

```css
.skeleton {
  background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-secondary) 50%, var(--bg-tertiary) 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
  border-radius: 4px;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-text {
  height: 16px;
  margin-bottom: 8px;
  width: 100%;
}

.skeleton-metric {
  height: 48px;
  width: 60%;
  margin-bottom: 8px;
}

.skeleton-chart {
  height: 300px;
  width: 100%;
}

.header-skeleton {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 48px;
}

.header-skeleton .skeleton-text {
  width: 200px;
  height: 32px;
}
```

**JavaScript (src/main.js):**

```javascript
function renderSkeleton() {
  return `
    <div class="app-container">
      <div class="header-skeleton">
        <div class="skeleton skeleton-text" style="width: 200px; height: 32px;"></div>
        <div class="skeleton skeleton-text" style="width: 150px;"></div>
      </div>
      
      <div class="metrics-grid">
        ${[1, 2, 3].map(() => `
          <div class="card">
            <div class="skeleton skeleton-text" style="width: 100px; margin-bottom: 16px;"></div>
            <div class="skeleton skeleton-metric"></div>
          </div>
        `).join('')}
      </div>
      
      <div class="quota-section">
        ${[1, 2].map(() => `
          <div class="card">
            <div class="skeleton skeleton-text" style="width: 150px; margin-bottom: 20px;"></div>
            <div class="skeleton" style="height: 12px; margin-bottom: 16px;"></div>
            <div class="skeleton skeleton-text" style="width: 50%;"></div>
          </div>
        `).join('')}
      </div>
      
      <div class="charts-row">
        ${[1, 2].map(() => `
          <div class="card">
            <div class="skeleton skeleton-text" style="width: 150px; margin-bottom: 20px;"></div>
            <div class="skeleton skeleton-chart"></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// In render(), show skeleton during first load:
if (state.loading && !state.data) {
  root.innerHTML = renderSkeleton();
  return;
}
```

---

### 6.4 First-Run Wizard

**Files to create:**
- `scripts/setup-wizard.mjs` (new interactive setup wizard)

**Implementation (scripts/setup-wizard.mjs):**

```javascript
#!/usr/bin/env node

import Conf from 'conf';
import readline from 'readline';
import { execSync } from 'child_process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function runWizard() {
  console.log('\n🚀 GLM Monitor Setup Wizard\n');
  console.log('This wizard will help you configure GLM Monitor.\n');
  
  const config = new Conf({ projectName: 'glm-monitor' });
  
  // Step 1: Auth Token
  console.log('Step 1: Authentication');
  console.log('---------------------\n');
  
  const envToken = process.env.ANTHROPIC_AUTH_TOKEN;
  if (envToken) {
    const useEnv = await question(`Found token in environment variables. Use it? [Y/n]: `);
    if (useEnv.toLowerCase() !== 'n') {
      config.set('authToken', envToken);
      console.log('✓ Using token from environment\n');
    }
  }
  
  if (!config.get('authToken')) {
    console.log('Enter your GLM Auth Token:');
    console.log('(Get it from: https://console.z.ai/)\n');
    const token = await question('Token: ');
    config.set('authToken', token.trim());
    console.log('✓ Token saved\n');
  }
  
  // Step 2: Base URL
  console.log('Step 2: API Configuration');
  console.log('--------------------------\n');
  
  const defaultUrl = 'https://api.z.ai/api/anthropic';
  const currentUrl = config.get('baseUrl', defaultUrl);
  
  const useDefault = await question(`Base URL [${currentUrl}]: `);
  if (useDefault.trim()) {
    config.set('baseUrl', useDefault.trim());
  }
  console.log('✓ API URL configured\n');
  
  // Step 3: Test Connection
  console.log('Step 3: Test Connection');
  console.log('-----------------------\n');
  
  const testNow = await question('Test API connection now? [Y/n]: ');
  if (testNow.toLowerCase() !== 'n') {
    try {
      console.log('Testing...');
      execSync('npm run collect', { stdio: 'pipe' });
      console.log('✓ Connection successful!\n');
    } catch (err) {
      console.log('✗ Connection failed. Please check your token and URL.\n');
    }
  }
  
  // Step 4: Data Retention
  console.log('Step 4: Data Retention');
  console.log('---------------------\n');
  
  const retention = await question('How long to keep data? [24h/7d/30d] [24h]: ') || '24h';
  if (['24h', '7d', '30d'].includes(retention)) {
    config.set('retention', retention);
    console.log(`✓ Retention set to ${retention}\n`);
  }
  
  // Step 5: Automation
  console.log('Step 5: Automation');
  console.log('------------------\n');
  
  const setupAuto = await question('Set up automatic data collection? [Y/n]: ');
  if (setupAuto.toLowerCase() !== 'n') {
    const platform = process.platform;
    
    if (platform === 'darwin') {
      console.log('\nTo set up automation on macOS:');
      console.log('1. Create ~/Library/LaunchAgents/com.user.usage-monitor.plist');
      console.log('2. Add configuration from README.md');
      console.log('3. Run: launchctl load ~/Library/LaunchAgents/com.user.usage-monitor.plist');
    } else if (platform === 'linux') {
      console.log('\nTo set up automation on Linux:');
      console.log('1. Run: crontab -e');
      console.log('2. Add: */5 * * * * cd ~/.glm-monitor && npm run collect');
    } else {
      console.log('\nTo set up automation on Windows:');
      console.log('1. Open Task Scheduler');
      console.log('2. Create a task to run "npm run collect" every 5 minutes');
    }
  }
  
  console.log('\n✨ Setup complete!');
  console.log('\nStarts dashboard: npm start');
  console.log('Collect data: npm run collect');
  console.log('Open dashboard: glm-monitor start');
  console.log('\nFor more commands, run: glm-monitor --help\n');
  
  rl.close();
}

runWizard().catch(console.error);
```

**CLI Command (bin/glm-monitor.js):**

```javascript
program
    .command('setup')
    .description('Interactive setup wizard')
    .action(() => {
        const wizardPath = path.join(packageRoot, 'scripts/setup-wizard.mjs');
        execSync(`node ${wizardPath}`, { stdio: 'inherit' });
    });
```

---

**Phase 6 Checklist:**
- [ ] 6.1 Theme toggle (dark/light)
- [ ] 6.2 Keyboard shortcuts (R, E, S, H, Esc)
- [ ] 6.3 Loading states with skeleton screens
- [ ] 6.4 First-run setup wizard

---

## Testing Strategy

### Unit Testing

Create `tests/` directory and implement tests for:

**Test Structure:**
```
tests/
├── unit/
│   ├── rate-calculator.test.js
│   ├── prediction.test.js
│   └── data-archiver.test.js
├── integration/
│   ├── cli-commands.test.js
│   └── api-endpoints.test.js
└── helpers/
    └── test-utils.js
```

**Example Test (tests/unit/rate-calculator.test.js):**

```javascript
import { calculateRates } from '../src/main.js';

describe('calculateRates', () => {
  it('should calculate correct rates for hourly data', () => {
    const entries = [
      { timestamp: '2026-01-11T00:00:00.000Z', modelCalls: 100, tokensUsed: 1000000 },
      { timestamp: '2026-01-11T01:00:00.000Z', modelCalls: 200, tokensUsed: 2000000 }
    ];
    
    const rates = calculateRates(entries);
    expect(rates.tokensPerHour).toBe(1000000);
    expect(rates.callsPerHour).toBe(100);
    expect(rates.avgTokensPerCall).toBe(10000);
  });
});
```

**Add to package.json:**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.11"
  }
}
```

---

### Integration Testing

Test CLI commands end-to-end:

```javascript
// tests/integration/cli-commands.test.js
import { execSync } from 'child_process';

describe('CLI Commands', () => {
  it('should initialize configuration', () => {
    const result = execSync('glm-monitor init -t test-token', { encoding: 'utf-8' });
    expect(result).toContain('Configuration updated');
  });
  
  it('should collect usage data', () => {
    const result = execSync('glm-monitor collect', { encoding: 'utf-8' });
    expect(result).toContain('Collecting usage data');
  });
});
```

---

### Manual Testing Checklist

**Dashboard:**
- [ ] Dashboard loads and displays data
- [ ] Auto-refresh works every 30 seconds
- [ ] Manual refresh button works
- [ ] Time range selector updates charts
- [ ] Settings modal opens and saves
- [ ] Theme toggle switches themes
- [ ] Keyboard shortcuts work (R, E, S, H, Esc)
- [ ] Export CSV downloads file
- [ ] Loading skeleton appears on first load
- [ ] Toast notifications appear
- [ ] Quota warnings display correctly

**CLI Commands:**
- [ ] `glm-monitor init` works
- [ ] `glm-monitor collect` works
- [ ] `glm-monitor start` launches dashboard
- [ ] `glm-monitor monitor` collects and starts
- [ ] `glm-monitor predict` shows prediction
- [ ] `glm-monitor analytics --report summary` works
- [ ] `glm-monitor analytics --report rates` works
- [ ] `glm-monitor config --retention 7d` works
- [ ] `glm-monitor health-check` passes
- [ ] `glm-monitor diagnose` reports issues
- [ ] `glm-monitor insights` shows patterns
- [ ] `glm-monitor backup` creates backup
- [ ] `glm-monitor restore` restores backup
- [ ] `glm-monitor profile --create` creates profile
- [ ] `glm-monitor profile --switch` switches profile
- [ ] `glm-monitor profile --list` lists profiles
- [ ] `glm-monitor api` starts API server
- [ ] `glm-monitor test-alert` sends notification
- [ ] `glm-monitor setup` runs wizard

**API Endpoints:**
- [ ] GET /api/health returns status
- [ ] GET /api/current returns usage
- [ ] GET /api/history returns entries
- [ ] GET /api/predict returns prediction
- [ ] GET /api/settings returns config
- [ ] POST /api/settings updates config

**Multi-Profile:**
- [ ] Create profile works
- [ ] Switch profile works
- [ ] Each profile has separate data
- [ ] List profiles shows all
- [ ] Delete profile works

---

## Implementation Timeline Estimate

| Phase | Tasks | Estimated Time | Priority |
|-------|-------|----------------|----------|
| Phase 1 | 5 major tasks | 2-3 weeks | **HIGH** |
| Phase 2 | 3 major tasks | 1-2 weeks | MEDIUM |
| Phase 3 | 3 major tasks | 2 weeks | MEDIUM |
| Phase 4 | 2 major tasks | 1 week | HIGH |
| Phase 5 | 3 major tasks | 1 week | LOW |
| Phase 6 | 4 major tasks | 2 weeks | LOW |
| **Total** | **20 major tasks** | **9-11 weeks** | - |

---

## Dependencies to Add

**Phase 1:**
- None (using existing dependencies)

**Phase 2:**
- `node-notifier` ^10.0.1

**Phase 3:**
- None (using existing fs, path modules)

**Phase 4:**
- `express` ^4.18.2

**Phase 5:**
- None (using existing modules)

**Phase 6:**
- None (using existing modules)

**Testing:**
- `jest` ^29.7.0
- `@types/jest` ^29.5.11

---

## File Structure After Implementation

```
/
├── bin/
│   └── glm-monitor.js          # Extended CLI with all commands
├── src/
│   ├── main.js                 # Enhanced dashboard with settings, themes, shortcuts
│   └── styles.css              # Extended styles (theme, skeleton, modal)
├── scripts/
│   ├── usage-collector.mjs     # Extended with prediction, profile support
│   ├── capture-screenshots.js  # Existing
│   ├── analytics.mjs          # NEW: Analytics reports
│   ├── data-manager.mjs       # NEW: Data archiving and cleanup
│   ├── api-server.mjs         # NEW: REST API server
│   ├── diagnostics.mjs        # NEW: System diagnostics
│   └── setup-wizard.mjs       # NEW: Interactive setup wizard
├── tests/
│   ├── unit/
│   │   ├── rate-calculator.test.js
│   │   ├── prediction.test.js
│   │   └── data-archiver.test.js
│   ├── integration/
│   │   ├── cli-commands.test.js
│   │   └── api-endpoints.test.js
│   └── helpers/
│       └── test-utils.js
├── docs/
│   ├── api-examples.md        # NEW: API integration examples
│   └── images/
│       └── dashboard-overview.png
├── data/
│   └── usage-history.json      # Symlink to profile-specific file
├── index.html                 # Unchanged
├── package.json               # Updated with new dependencies
├── README.md                  # Updated with new features
├── CLAUDE.md                 # Unchanged (dev docs)
├── IMPLEMENTATION_PLAN.md     # THIS FILE
└── LICENSE                    # Unchanged
```

---

## Backward Compatibility

All changes are **backward compatible**:

- Existing commands work without modification
- New commands are additive
- Default behavior unchanged
- Migration path: Optional
  - Multi-profile: Uses 'default' profile if none specified
  - Extended retention: Defaults to 24h
  - API: Optional, doesn't affect dashboard

---

## Success Metrics

**After completion, the project should achieve:**

1. **User Engagement:**
   - 50% increase in daily active users
   - 30% longer session duration
   - 20% more frequent data collection

2. **Feature Adoption:**
   - 40% of users enable notifications
   - 30% of users use time range selector
   - 25% of users create multiple profiles

3. **User Satisfaction:**
   - 4.5+ star rating (from existing 4.0)
   - Positive feedback on new features
   - Fewer support requests

4. **Code Quality:**
   - 80%+ test coverage
   - 0 critical bugs in production
   - <500ms startup time

---

## Next Steps

1. **Review and Approve**: Review this plan with stakeholders
2. **Prioritize Phases**: Confirm phase order and timeline
3. **Setup Testing**: Implement testing framework
4. **Begin Phase 1**: Start with Core Analytics
5. **Iterate**: Test each phase before moving to next
6. **Gather Feedback**: Get user feedback after each phase
7. **Refine**: Adjust plan based on learnings

---

## Questions & Notes

**Open Questions:**
- Should predictive alerts use a configurable time window? (Currently fixed at 6h)
- Should API server auto-start with dashboard or be opt-in only?
- What is the maximum acceptable file size for long-term retention?

**Technical Notes:**
- All CLI commands use Node.js built-in modules where possible
- Express API is minimal and can be replaced with native HTTP server if needed
- Data files use JSON for simplicity and human readability
- Configuration stored via `conf` package for cross-platform compatibility

**Considerations for Future:**
- Add webhooks for quota alerts
- Support for custom metric visualizations
- Export to PDF reports
- Docker container for on-prem deployment
- Mobile app (React Native) for on-the-go monitoring

---

**Document Version:** 1.0  
**Last Updated:** January 11, 2026  
**Status:** Ready for Implementation  
**Next Review:** After Phase 1 completion
