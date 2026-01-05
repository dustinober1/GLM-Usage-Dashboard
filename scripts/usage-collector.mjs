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
const MAX_HISTORY_ENTRIES = 288; // 24 hours * 12 (5-min intervals)

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
