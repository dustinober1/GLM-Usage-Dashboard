#!/usr/bin/env node

/**
 * GLM Data Manager
 * 
 * Handles data archiving, summarization, and cleanup for extended retention periods.
 * Raw data is kept for 24 hours, older data is summarized into hourly aggregates.
 * 
 * Usage:
 *   node scripts/data-manager.mjs
 *   glm-monitor cleanup
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import Conf from 'conf'

const config = new Conf({ projectName: 'glm-monitor' });
const DATA_DIR = path.join(os.homedir(), '.glm-monitor');

/**
 * Get the data file path for the active profile
 */
function getProfileDataPath(filename = 'usage-history.json') {
    const activeProfile = config.get('activeProfile', 'default');
    if (activeProfile === 'default') {
        return path.join(DATA_DIR, filename);
    }
    const baseName = filename.replace('.json', '');
    return path.join(DATA_DIR, `${activeProfile}-${baseName}.json`);
}

const HISTORY_FILE = getProfileDataPath('usage-history.json');
const SUMMARY_FILE = getProfileDataPath('usage-summary.json');

/**
 * Generate hourly summaries from raw entries
 * Groups entries by hour and calculates aggregated metrics
 */
export function generateSummaries(entries) {
    const hourlySummaries = {};

    entries.forEach(entry => {
        const date = new Date(entry.timestamp);
        // Create hour key in format: "YYYY-MM-DD HH"
        const hourKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}`;

        if (!hourlySummaries[hourKey]) {
            hourlySummaries[hourKey] = {
                timestamp: new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).toISOString(),
                modelCalls: 0,
                tokensUsed: 0,
                mcpCalls: 0,
                tokenQuotaPercent: 0,
                timeQuotaPercent: 0,
                entryCount: 0,
                // Track max values for the hour
                maxModelCalls: 0,
                maxTokensUsed: 0,
                maxMcpCalls: 0
            };
        }

        const summary = hourlySummaries[hourKey];

        // Track the latest (cumulative) values within the hour
        summary.modelCalls = Math.max(summary.modelCalls, entry.modelCalls || 0);
        summary.tokensUsed = Math.max(summary.tokensUsed, entry.tokensUsed || 0);
        summary.mcpCalls = Math.max(summary.mcpCalls, entry.mcpCalls || 0);

        // Use the latest quota percentages for the hour
        summary.tokenQuotaPercent = entry.tokenQuotaPercent || summary.tokenQuotaPercent;
        summary.timeQuotaPercent = entry.timeQuotaPercent || summary.timeQuotaPercent;

        summary.entryCount += 1;
    });

    return Object.values(hourlySummaries).sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
    );
}

/**
 * Archive old data by summarizing entries older than the raw retention period
 * Keeps raw data for 24 hours, summarizes older data into hourly aggregates
 */
export function archiveOldData(retentionPeriod) {
    // Load current history
    if (!fs.existsSync(HISTORY_FILE)) {
        console.log('No history file found. Nothing to archive.');
        return { archived: 0, trimmed: 0 };
    }

    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));

    if (!data.entries || data.entries.length === 0) {
        console.log('No entries to archive.');
        return { archived: 0, trimmed: 0 };
    }

    const retentionHours = {
        '7d': 7 * 24,
        '30d': 30 * 24
    };

    const hoursToKeep = retentionHours[retentionPeriod];
    if (!hoursToKeep) {
        console.log('24h retention - no archiving needed');
        return { archived: 0, trimmed: 0 };
    }

    // Keep raw data for 24 hours (288 entries at 5-min intervals)
    const rawEntriesLimit = 288;
    const entriesToSummarize = data.entries.length - rawEntriesLimit;

    let archivedCount = 0;
    let trimmedCount = 0;

    if (entriesToSummarize > 0) {
        const entriesToArchive = data.entries.slice(0, entriesToSummarize);
        const summaries = generateSummaries(entriesToArchive);

        // Load existing summaries
        let existingSummaries = [];
        if (fs.existsSync(SUMMARY_FILE)) {
            try {
                const summaryData = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf-8'));
                existingSummaries = summaryData.summaries || [];
            } catch (e) {
                console.warn('Warning: Could not parse existing summary file:', e.message);
            }
        }

        // Merge summaries (avoid duplicates by timestamp)
        const allSummaries = [...existingSummaries, ...summaries];
        const uniqueSummaries = allSummaries.filter((summary, index, self) =>
            index === self.findIndex(s => s.timestamp === summary.timestamp)
        );

        // Trim summaries based on retention period
        const cutoffDate = new Date(Date.now() - hoursToKeep * 60 * 60 * 1000);
        const trimmedSummaries = uniqueSummaries.filter(s => new Date(s.timestamp) >= cutoffDate);

        trimmedCount = uniqueSummaries.length - trimmedSummaries.length;

        // Save summaries
        fs.writeFileSync(SUMMARY_FILE, JSON.stringify({
            summaries: trimmedSummaries,
            lastUpdated: new Date().toISOString(),
            retentionPeriod
        }, null, 2));

        archivedCount = entriesToSummarize;
        console.log(`✓ Archived ${entriesToSummarize} entries into ${summaries.length} hourly summaries`);

        if (trimmedCount > 0) {
            console.log(`✓ Removed ${trimmedCount} summaries older than ${retentionPeriod}`);
        }
    }

    // Trim raw entries to 24h
    const originalCount = data.entries.length;
    data.entries = data.entries.slice(-rawEntriesLimit);
    data.lastUpdated = new Date().toISOString();

    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
    console.log(`✓ Trimmed raw data from ${originalCount} to ${data.entries.length} entries (24 hours)`);

    return { archived: archivedCount, trimmed: trimmedCount };
}

/**
 * Get combined data (raw + summaries) for extended time ranges
 */
export function getCombinedData(range) {
    const rangeHours = {
        '1h': 1,
        '6h': 6,
        '12h': 12,
        '24h': 24,
        '7d': 7 * 24,
        '30d': 30 * 24
    };

    const hours = rangeHours[range] || 24;
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    let entries = [];
    let summaries = [];

    // Load raw entries
    if (fs.existsSync(HISTORY_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
            entries = (data.entries || []).filter(e => new Date(e.timestamp) >= cutoffDate);
        } catch (e) {
            console.warn('Warning: Could not load history file:', e.message);
        }
    }

    // For extended ranges, also load summaries
    if (hours > 24 && fs.existsSync(SUMMARY_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf-8'));
            summaries = (data.summaries || []).filter(s => new Date(s.timestamp) >= cutoffDate);
        } catch (e) {
            console.warn('Warning: Could not load summary file:', e.message);
        }
    }

    // Combine and sort by timestamp (summaries first, then raw entries)
    // Remove overlapping periods (prefer raw entries over summaries)
    const rawTimestamps = new Set(entries.map(e => {
        const d = new Date(e.timestamp);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
    }));

    const filteredSummaries = summaries.filter(s => {
        const d = new Date(s.timestamp);
        const hourKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
        return !rawTimestamps.has(hourKey);
    });

    return [...filteredSummaries, ...entries].sort((a, b) =>
        new Date(a.timestamp) - new Date(b.timestamp)
    );
}

/**
 * Get storage statistics
 */
export function getStorageStats() {
    const stats = {
        historyFile: { exists: false, size: 0, entries: 0 },
        summaryFile: { exists: false, size: 0, entries: 0 },
        totalSize: 0
    };

    if (fs.existsSync(HISTORY_FILE)) {
        const fileStat = fs.statSync(HISTORY_FILE);
        const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        stats.historyFile = {
            exists: true,
            size: fileStat.size,
            entries: data.entries?.length || 0,
            path: HISTORY_FILE
        };
        stats.totalSize += fileStat.size;
    }

    if (fs.existsSync(SUMMARY_FILE)) {
        const fileStat = fs.statSync(SUMMARY_FILE);
        const data = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf-8'));
        stats.summaryFile = {
            exists: true,
            size: fileStat.size,
            entries: data.summaries?.length || 0,
            path: SUMMARY_FILE
        };
        stats.totalSize += fileStat.size;
    }

    return stats;
}

// CLI execution
if (process.argv[1] === new URL(import.meta.url).pathname ||
    process.argv[1]?.endsWith('data-manager.mjs')) {
    const retentionPeriod = config.get('retention', '24h');

    console.log(`\n📦 GLM Data Manager`);
    console.log(`   Retention period: ${retentionPeriod}`);
    console.log(`   Profile: ${config.get('activeProfile', 'default')}\n`);

    if (retentionPeriod === '24h') {
        console.log('ℹ️  24h retention mode - no archiving needed');
        console.log('   Set longer retention with: glm-monitor config --retention 7d\n');
    } else {
        archiveOldData(retentionPeriod);
    }

    // Show storage stats
    const stats = getStorageStats();
    console.log(`\n📊 Storage Statistics:`);
    console.log(`   Raw entries: ${stats.historyFile.entries}`);
    console.log(`   Hourly summaries: ${stats.summaryFile.entries}`);
    console.log(`   Total size: ${(stats.totalSize / 1024).toFixed(1)} KB\n`);
}
