#!/usr/bin/env node

/**
 * GLM Usage Collector
 *
 * Queries the ZAI usage API and stores historical data.
 * Run this script periodically (e.g., every 5 minutes) to collect usage data.
 *
 * Usage:
 *   node scripts/usage-collector.mjs
 *
 * Environment variables required:
 *   - ANTHROPIC_BASE_URL: Your API base URL
 *   - ANTHROPIC_AUTH_TOKEN: Your auth token
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import Conf from 'conf';

const config = new Conf({ projectName: 'glm-monitor' });
const DATA_DIR = path.join(os.homedir(), '.glm-monitor');
const HISTORY_FILE = path.join(DATA_DIR, 'usage-history.json');

// Calculate max entries based on config
const retentionPeriod = config.get('retention', '24h');
const retentionMap = {
  '24h': 288,
  '7d': 2016,
  '30d': 8640
};
const MAX_HISTORY_ENTRIES = retentionMap[retentionPeriod] || 288;

// Create symlink for dev dashboard access
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');
const DEV_DATA_LINK = path.join(PROJECT_ROOT, 'data', 'usage-history.json');

try {
  fs.mkdirSync(path.dirname(DEV_DATA_LINK), { recursive: true });
  // Remove existing link/file if it's broken or not a symlink
  if (fs.existsSync(DEV_DATA_LINK)) {
    const stats = fs.lstatSync(DEV_DATA_LINK);
    if (!stats.isSymbolicLink()) {
      fs.unlinkSync(DEV_DATA_LINK);
    }
  }
  // Create symlink if it doesn't exist
  if (!fs.existsSync(DEV_DATA_LINK)) {
    fs.symlinkSync(HISTORY_FILE, DEV_DATA_LINK);
  }
} catch (e) {
  // Ignore symlink errors (e.g., on Windows without admin permissions)
}

// Read configuration
const baseUrl = config.get('baseUrl') || process.env.ANTHROPIC_BASE_URL || 'https://api.z.ai/api/anthropic';
const authToken = config.get('authToken') || process.env.ANTHROPIC_AUTH_TOKEN;

// Validation
if (!authToken) {
  console.error('\x1b[31mError: GLM Auth Token not configured.\x1b[0m');
  console.error('\x1b[33mRun `glm-monitor init` to set up your credentials.\x1b[0m');
  process.exit(1);
}

// Determine platform and API URLs
const parsedBaseUrl = new URL(baseUrl);
const baseDomain = `${parsedBaseUrl.protocol}//${parsedBaseUrl.host}`;

const modelUsageUrl = `${baseDomain}/api/monitor/usage/model-usage`;
const toolUsageUrl = `${baseDomain}/api/monitor/usage/tool-usage`;
const quotaLimitUrl = `${baseDomain}/api/monitor/usage/quota/limit`;

/**
 * Query the usage API
 */
async function queryUsage(apiUrl, label) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, now.getHours(), 0, 0, 0);
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 59, 59, 999);

    const formatDateTime = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    const startTime = formatDateTime(startDate);
    const endTime = formatDateTime(endDate);
    const queryParams = `?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}`;

    const parsedUrl = new URL(apiUrl);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + queryParams,
      method: 'GET',
      headers: {
        'Authorization': authToken,
        'Accept-Language': 'en-US,en',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Load existing history
 */
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Warning: Failed to load history file:', e.message);
  }
  return { entries: [], lastUpdated: null };
}

/**
 * Save history
 */
function saveHistory(history) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (e) {
    console.error('Error: Failed to save history:', e.message);
  }
}

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

/**
 * Main collection function
 */
async function collectUsage() {
  console.log(`[${new Date().toISOString()}] Collecting usage data...`);

  try {
    // Query all endpoints
    const [modelData, toolData, quotaData] = await Promise.all([
      queryUsage(modelUsageUrl, 'Model usage'),
      queryUsage(toolUsageUrl, 'Tool usage'),
      queryUsage(quotaLimitUrl, 'Quota limit')
    ]);

    // Extract current totals
    const modelTotal = modelData.data?.totalUsage;
    const toolTotal = toolData.data?.totalUsage;

    if (!modelTotal || !toolTotal) {
      throw new Error('API response missing expected totalUsage data structure');
    }

    // Find current quota percentage
    const tokenQuota = quotaData.data?.limits?.find(l => l.type === 'TOKENS_LIMIT') || {};
    const timeQuota = quotaData.data?.limits?.find(l => l.type === 'TIME_LIMIT') || {};

    // Create entry
    const entry = {
      timestamp: new Date().toISOString(),
      modelCalls: modelTotal.totalModelCallCount || 0,
      tokensUsed: modelTotal.totalTokensUsage || 0,
      mcpCalls: toolTotal.totalSearchMcpCount || 0,
      tokenQuotaPercent: tokenQuota.percentage || 0,
      timeQuotaPercent: timeQuota.percentage || 0
    };

    // Load and update history
    const history = loadHistory();

    // Prevention: Check if the last entry is the same (ignoring milliseconds if any)
    const latestExisting = history.entries[history.entries.length - 1];
    if (latestExisting && latestExisting.timestamp === entry.timestamp) {
      console.log('  ! Entry already exists for this second, skipping.');
      return;
    }

    history.entries.push(entry);

    // Trim to max entries
    if (history.entries.length > MAX_HISTORY_ENTRIES) {
      history.entries = history.entries.slice(-MAX_HISTORY_ENTRIES);
    }

    history.lastUpdated = new Date().toISOString();
    history.quotaLimits = {
      tokenQuota: {
        current: tokenQuota.currentValue || 0,
        max: tokenQuota.usage || 0,
        percentage: tokenQuota.percentage || 0
      },
      timeQuota: {
        current: timeQuota.currentValue || 0,
        max: timeQuota.usage || 0,
        percentage: timeQuota.percentage || 0
      }
    };

    const prediction = calculateQuotaPrediction(entry.tokenQuotaPercent, history.entries);
    if (prediction) {
      console.log(`  ⏰ Quota will exhaust in ~${prediction.hoursUntilExhausted} hours at ${prediction.rate}%/hour`);
      if (prediction.hoursUntilExhausted < 24) {
        console.log(`⚠️  WARNING: Quota exhaustion imminent!`);
      }
      history.quotaPrediction = prediction;
    }

    saveHistory(history);

    console.log(`  ✓ Model calls: ${entry.modelCalls.toLocaleString()}`);
    console.log(`  ✓ Tokens used: ${(entry.tokensUsed / 1_000_000).toFixed(2)}M`);
    console.log(`  ✓ MCP calls: ${entry.mcpCalls}`);
    console.log(`  ✓ Token quota: ${entry.tokenQuotaPercent}%`);
    console.log(`  ✓ Time quota: ${entry.timeQuotaPercent}%`);
    console.log(`  ✓ History entries: ${history.entries.length}`);

    // Alert if approaching limits
    if (entry.tokenQuotaPercent > 80) {
      console.log(`⚠️  WARNING: Token quota at ${entry.tokenQuotaPercent}%!`);
    }
    if (entry.timeQuotaPercent > 80) {
      console.log(`⚠️  WARNING: Time quota at ${entry.timeQuotaPercent}%!`);
    }

  } catch (error) {
    console.error(`✗ Collection failed: ${error.message}`);
    process.exit(1);
  }
}

// Run collector
collectUsage();
