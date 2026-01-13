#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';

import { fileURLToPath } from 'url';

const HISTORY_FILE = path.join(os.homedir(), '.glm-monitor', 'usage-history.json');

export function generateSummaryReport(entries, period) {
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

export function generateRatesReport(entries) {
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

    if (hourlyRates.length === 0) {
        console.log(`\n📈 Usage Rates\n`);
        console.log("Insufficient data to calculate rates.");
        return;
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

export function generatePeakUsageReport(entries) {
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

    if (!peakHour) {
        console.log(`\n🔥 Peak Usage Report\n`);
        console.log("Insufficient data.");
        return;
    }

    console.log(`\n🔥 Peak Usage Hour: ${peakHour[0]}:00 - ${parseInt(peakHour[0]) + 1}:00`);
    console.log(`   Total Tokens: ${(peakHour[1].tokens / 1000000).toFixed(2)}M`);
    console.log(`   Total Calls: ${peakHour[1].calls.toLocaleString()}`);
    console.log(`   Avg Tokens/Entry: ${(peakHour[1].tokens / peakHour[1].count).toFixed(0)}`);
}

export function runCLI(args) {
    const reportIndex = args.indexOf('--report');
    const reportType = reportIndex !== -1 ? args[reportIndex + 1] : 'summary';
    const periodIndex = args.indexOf('--period');
    const period = periodIndex !== -1 ? args[periodIndex + 1] : '24h';

    run(reportType, period);
}

function run(reportType, period) {
    // Load data
    if (!fs.existsSync(HISTORY_FILE)) {
        console.error('No usage data found. Run glm-monitor collect first.');
        process.exit(1);
    }

    let data;
    try {
        data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    } catch (e) {
        console.error('Failed to parse history file.');
        process.exit(1);
    }

    const retentionMap = { '1h': 12, '6h': 72, '12h': 144, '24h': 288, '7d': 2016, '30d': 8640 };
    // Default to 24h count if period invalid or not found
    const entriesCount = retentionMap[period] || 288;
    const filteredEntries = data.entries.slice(-entriesCount);

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
}

// Only execute if running directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runCLI(process.argv.slice(2));
}
