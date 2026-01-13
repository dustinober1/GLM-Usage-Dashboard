#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import Conf from 'conf';

const config = new Conf({ projectName: 'glm-monitor' });
const dataDir = path.join(os.homedir(), '.glm-monitor');
const activeProfile = config.get('activeProfile', 'default');
const historyFileName = activeProfile === 'default'
    ? 'usage-history.json'
    : `${activeProfile}-usage-history.json`;
const historyFile = path.join(dataDir, historyFileName);

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

    // Still show system info
    console.log('\n📊 System Information:');
    console.log('   Platform: ' + os.platform());
    console.log('   Node.js: ' + process.version);
    console.log('   Data directory: ' + dataDir);
    console.log('   Active profile: ' + activeProfile);

    console.log('\n' + '='.repeat(50));
    console.log('⚠️  ' + issuesFound + ' issue(s) found - See above for details');
    console.log('='.repeat(50) + '\n');
    process.exit(0);
}

// Load data
let data;
try {
    data = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
} catch (e) {
    console.log('\n⚠️  Issue: Failed to parse history file');
    console.log('   Fix: Delete ' + historyFile + ' and run `glm-monitor collect`');
    issuesFound++;
    process.exit(0);
}

// Issue 3: Stale data
if (data.lastUpdated) {
    const lastUpdated = new Date(data.lastUpdated);
    const staleHours = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
    if (staleHours > 24) {
        console.log('⚠️  Issue: Data is very old (' + Math.round(staleHours) + ' hours)');
        console.log('   Fix: Run `glm-monitor collect` or set up automation');
        issuesFound++;
    }
}

// Issue 4: Too few entries
if (!data.entries || data.entries.length < 10) {
    console.log('\n⚠️  Issue: Insufficient data for analytics (' + (data.entries?.length || 0) + ' entries)');
    console.log('   Fix: Run collector multiple times or wait for more data');
    issuesFound++;
}

// Issue 5: High quota usage
if (data.entries && data.entries.length > 0) {
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
console.log('   Active profile: ' + activeProfile);

try {
    const historyStats = fs.statSync(historyFile);
    console.log('   History size: ' + historyStats.size + ' bytes');
} catch (e) {
    console.log('   History size: N/A');
}

console.log('   Entries: ' + (data.entries?.length || 0));

if (data.lastUpdated) {
    console.log('   Last updated: ' + new Date(data.lastUpdated).toLocaleString());
}

// Summary
console.log('\n' + '='.repeat(50));
if (issuesFound === 0) {
    console.log('✓ No issues found!');
} else {
    console.log('⚠️  ' + issuesFound + ' issue(s) found - See above for details');
}
console.log('='.repeat(50) + '\n');
