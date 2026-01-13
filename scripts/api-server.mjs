#!/usr/bin/env node

/**
 * GLM Monitor REST API Server
 * 
 * Lightweight localhost-only API for custom scripts and automation.
 * Provides endpoints for querying usage data, predictions, and configuration.
 */

import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Conf from 'conf';

const config = new Conf({ projectName: 'glm-monitor' });
const DATA_DIR = path.join(os.homedir(), '.glm-monitor');

/**
 * Get the active profile name
 */
function getActiveProfile() {
    return config.get('activeProfile', 'default');
}

/**
 * Get the history file path for the active profile
 */
function getHistoryFilePath() {
    const activeProfile = getActiveProfile();
    const fileName = activeProfile === 'default'
        ? 'usage-history.json'
        : `${activeProfile}-usage-history.json`;
    return path.join(DATA_DIR, fileName);
}

/**
 * Get the summary file path for the active profile
 */
function getSummaryFilePath() {
    const activeProfile = getActiveProfile();
    const fileName = activeProfile === 'default'
        ? 'usage-summary.json'
        : `${activeProfile}-usage-summary.json`;
    return path.join(DATA_DIR, fileName);
}

/**
 * Load usage data from files
 */
function loadData() {
    try {
        const historyPath = getHistoryFilePath();
        const summaryPath = getSummaryFilePath();

        if (!fs.existsSync(historyPath)) {
            return null;
        }

        const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        let summaries = [];

        if (fs.existsSync(summaryPath)) {
            const summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
            summaries = summaryData.summaries || [];
        }

        return { ...data, summaries };
    } catch (err) {
        console.error('Error loading data:', err.message);
        return null;
    }
}

/**
 * Time range mapping for filtering entries
 */
const RANGE_MAP = {
    '1h': 12,
    '6h': 72,
    '12h': 144,
    '24h': 288,
    '7d': 2016,
    '30d': 8640
};

// Create Express app
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

// Request logging (optional, for debugging)
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} ${req.method} ${req.path}`);
    next();
});

// ============================================================================
// API Routes
// ============================================================================

/**
 * GET /api/health - Health check
 * Returns API status and basic data availability info
 */
app.get('/api/health', (req, res) => {
    const data = loadData();
    const activeProfile = getActiveProfile();

    res.json({
        status: 'ok',
        version: '1.0.0',
        dataAvailable: !!data,
        lastUpdated: data?.lastUpdated || null,
        entriesCount: data?.entries?.length || 0,
        summariesCount: data?.summaries?.length || 0,
        activeProfile: activeProfile
    });
});

/**
 * GET /api/current - Current usage snapshot
 * Returns the most recent usage data point
 */
app.get('/api/current', (req, res) => {
    const data = loadData();

    if (!data || !data.entries || data.entries.length === 0) {
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
        mcpToolBreakdown: latest.mcpToolBreakdown || {},
        quotaLimits: data.quotaLimits || null,
        profile: getActiveProfile()
    });
});

/**
 * GET /api/history - Historical data with optional range
 * Query params:
 *   - range: 1h, 6h, 12h, 24h, 7d, 30d
 *   - format: 'raw' (default) or 'summary'
 */
app.get('/api/history', (req, res) => {
    const data = loadData();

    if (!data) {
        return res.status(404).json({ error: 'No data available' });
    }

    const { range, format } = req.query;
    let entries = [...(data.entries || [])];

    // Filter by range
    if (range && RANGE_MAP[range]) {
        const limit = RANGE_MAP[range];
        entries = entries.slice(-limit);
    }

    // Include summaries for long ranges (7d, 30d)
    if ((range === '7d' || range === '30d') && data.summaries && data.summaries.length > 0) {
        // Prepend summaries for data older than what's in entries
        const oldestEntryTime = entries.length > 0 ? new Date(entries[0].timestamp) : new Date();
        const relevantSummaries = data.summaries.filter(s => new Date(s.timestamp) < oldestEntryTime);
        entries = [...relevantSummaries, ...entries];
    }

    // Format selection
    if (format === 'summary') {
        if (entries.length === 0) {
            return res.status(404).json({ error: 'No data for the specified range' });
        }

        const first = entries[0];
        const last = entries[entries.length - 1];

        res.json({
            totalModelCalls: last.modelCalls || 0,
            totalTokensUsed: last.tokensUsed || 0,
            totalMcpCalls: last.mcpCalls || 0,
            tokenGrowth: first.tokensUsed > 0
                ? ((last.tokensUsed - first.tokensUsed) / first.tokensUsed) * 100
                : 0,
            entryCount: entries.length,
            timeRange: {
                start: first.timestamp,
                end: last.timestamp
            },
            profile: getActiveProfile()
        });
    } else {
        res.json({
            entries,
            lastUpdated: data.lastUpdated,
            profile: getActiveProfile()
        });
    }
});

/**
 * GET /api/predict - Quota exhaustion prediction
 * Query params:
 *   - timeWindow: hours to use for rate calculation (default: 6h)
 */
app.get('/api/predict', (req, res) => {
    const data = loadData();

    if (!data || !data.entries || data.entries.length < 2) {
        return res.status(404).json({ error: 'Insufficient data for prediction' });
    }

    const { timeWindow = '6h' } = req.query;
    const windowHours = parseInt(timeWindow) || 6;

    const cutoffDate = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const recentEntries = data.entries.filter(e => new Date(e.timestamp) >= cutoffDate);

    if (recentEntries.length < 2) {
        return res.status(404).json({ error: 'Insufficient data for prediction in the specified window' });
    }

    const oldest = recentEntries[0];
    const latest = recentEntries[recentEntries.length - 1];
    const hoursElapsed = (new Date(latest.timestamp) - new Date(oldest.timestamp)) / (1000 * 60 * 60);

    if (hoursElapsed <= 0) {
        return res.status(400).json({ error: 'Invalid time window' });
    }

    const percentChange = latest.tokenQuotaPercent - oldest.tokenQuotaPercent;
    const percentPerHour = percentChange / hoursElapsed;

    // If not consuming quota (rate <= 0)
    if (percentPerHour <= 0) {
        return res.json({
            tokenQuotaPercent: latest.tokenQuotaPercent,
            timeQuotaPercent: latest.timeQuotaPercent,
            hoursUntilExhausted: null,
            rate: 0,
            message: 'Quota not being consumed or decreasing',
            window: `${windowHours}h`,
            profile: getActiveProfile()
        });
    }

    const remainingPercent = 100 - latest.tokenQuotaPercent;
    const hoursUntilExhausted = remainingPercent / percentPerHour;

    res.json({
        tokenQuotaPercent: latest.tokenQuotaPercent,
        timeQuotaPercent: latest.timeQuotaPercent,
        hoursUntilExhausted: Math.round(hoursUntilExhausted),
        rate: parseFloat(percentPerHour.toFixed(2)),
        window: `${windowHours}h`,
        status: hoursUntilExhausted < 24 ? 'warning' : 'ok',
        profile: getActiveProfile()
    });
});

/**
 * GET /api/settings - Get current configuration
 */
app.get('/api/settings', (req, res) => {
    const profiles = config.get('profiles', {});
    const activeProfile = getActiveProfile();

    // Get profile-specific info without exposing tokens
    const profileList = Object.keys(profiles).map(name => ({
        name,
        isActive: name === activeProfile,
        createdAt: profiles[name].createdAt || null
    }));

    // Always include default profile
    profileList.unshift({
        name: 'default',
        isActive: activeProfile === 'default',
        createdAt: null
    });

    res.json({
        retention: config.get('retention', '24h'),
        activeProfile: activeProfile,
        profiles: profileList,
        baseUrl: config.get('baseUrl', 'https://api.z.ai/api/anthropic')
    });
});

/**
 * POST /api/settings - Update configuration
 * Body: { retention: '24h' | '7d' | '30d' }
 */
app.post('/api/settings', (req, res) => {
    const { retention } = req.body;

    if (retention) {
        const validPeriods = ['24h', '7d', '30d'];
        if (!validPeriods.includes(retention)) {
            return res.status(400).json({
                error: 'Invalid retention period',
                validOptions: validPeriods
            });
        }
        config.set('retention', retention);
    }

    res.json({
        success: true,
        settings: {
            retention: config.get('retention', '24h'),
            activeProfile: getActiveProfile()
        }
    });
});

/**
 * GET /api/rates - Calculate usage rates
 * Query params:
 *   - window: hours to use for rate calculation (default: 1h)
 */
app.get('/api/rates', (req, res) => {
    const data = loadData();

    if (!data || !data.entries || data.entries.length < 2) {
        return res.status(404).json({ error: 'Insufficient data for rate calculation' });
    }

    const { window = '1h' } = req.query;
    const windowHours = parseInt(window) || 1;

    const cutoffDate = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const entries = data.entries.filter(e => new Date(e.timestamp) >= cutoffDate);

    if (entries.length < 2) {
        return res.status(404).json({ error: 'Insufficient data for the specified window' });
    }

    const first = entries[0];
    const last = entries[entries.length - 1];
    const hoursElapsed = (new Date(last.timestamp) - new Date(first.timestamp)) / (1000 * 60 * 60);

    if (hoursElapsed <= 0) {
        return res.status(400).json({ error: 'Invalid time window' });
    }

    const tokensPerHour = (last.tokensUsed - first.tokensUsed) / hoursElapsed;
    const callsPerHour = (last.modelCalls - first.modelCalls) / hoursElapsed;
    const avgTokensPerCall = callsPerHour > 0 ? tokensPerHour / callsPerHour : 0;

    res.json({
        window: `${windowHours}h`,
        tokensPerHour: Math.round(tokensPerHour),
        callsPerHour: Math.round(callsPerHour),
        avgTokensPerCall: Math.round(avgTokensPerCall),
        entriesCount: entries.length,
        profile: getActiveProfile()
    });
});

// ============================================================================
// Error handling
// ============================================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path,
        availableEndpoints: [
            'GET /api/health',
            'GET /api/current',
            'GET /api/history',
            'GET /api/predict',
            'GET /api/rates',
            'GET /api/settings',
            'POST /api/settings'
        ]
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('API Error:', err.message);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// ============================================================================
// Server startup
// ============================================================================

const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🚀 GLM Monitor API Server`);
    console.log(`   Running on: http://localhost:${PORT}`);
    console.log(`   Profile: ${getActiveProfile()}`);
    console.log(`\n📚 Available endpoints:`);
    console.log(`   GET  /api/health     - Health check`);
    console.log(`   GET  /api/current    - Current usage snapshot`);
    console.log(`   GET  /api/history    - Historical data (range=1h,6h,12h,24h,7d,30d)`);
    console.log(`   GET  /api/predict    - Quota prediction (timeWindow=6h)`);
    console.log(`   GET  /api/rates      - Usage rates (window=1h)`);
    console.log(`   GET  /api/settings   - Current configuration`);
    console.log(`   POST /api/settings   - Update configuration`);
    console.log(`\n💡 Press Ctrl+C to stop the server\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down API server...');
    server.close(() => {
        console.log('   Server closed.\n');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    server.close(() => {
        process.exit(0);
    });
});

export { app, loadData, getActiveProfile };
