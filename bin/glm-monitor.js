#!/usr/bin/env node

import { Command } from 'commander';
import Conf from 'conf';
import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import opn from 'opn';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.join(__dirname, '..');

let packageJson = {};
try {
    packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf-8'));
} catch {
    packageJson = {};
}

export const config = new Conf({ projectName: 'glm-monitor' });
export const program = new Command();

program
    .name('glm-monitor')
    .description('GLM Usage monitoring and dashboard CLI')
    .version(packageJson.version || '1.0.0');

/**
 * INIT Command
 */
program
    .command('init')
    .description('Initialize GLM Dashboard configuration')
    .option('-t, --token <token>', 'GLM Auth Token')
    .option('-u, --url <url>', 'GLM Base URL', 'https://api.z.ai/api/anthropic')
    .action((options) => {
        if (options.token) {
            config.set('authToken', options.token);
        }
        config.set('baseUrl', options.url);

        console.log('\x1b[32m✓ Configuration updated successfully.\x1b[0m');
        console.log(`  Base URL: ${config.get('baseUrl')}`);
        console.log(`  Token: ${options.token ? '********' : 'unchanged'}`);

        // Create data directory if missing
        const dataDir = path.join(os.homedir(), '.glm-monitor');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log(`  Created data directory: ${dataDir}`);
        }
    });

/**
 * CONFIG Command
 */
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

/**
 * COLLECT Command
 */
program
    .command('collect')
    .description('Collect current usage data')
    .action(() => {
        console.log('Starting usage collection...');
        try {
            const collectorPath = path.join(packageRoot, 'scripts/usage-collector.mjs');
            execSync(`node ${collectorPath}`, { stdio: 'inherit' });
        } catch (err) {
            console.error('Failed to collect data.');
        }
    });



program
    .command('predict')
    .description('Predict when quota will be exhausted')
    .action(async () => {
        // We need to load history. Since this script doesn't usually load it, we'll implement a simple loader here or reuse if extracted.
        // For simplicity and avoiding massive refactor, I'll duplicate the simple load logic or assume we can move loadHistory to a shared module later.
        // But for now, I'll just read the file directly as done in `start` command logic.

        const dataPath = path.join(os.homedir(), '.glm-monitor/usage-history.json');
        if (!fs.existsSync(dataPath)) {
            console.error('No usage data available. Run collect first.');
            return;
        }
        const history = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

        if (!history.entries || history.entries.length === 0) {
            console.error('No usage data available. Run collect first.');
            return;
        }

        const latest = history.entries[history.entries.length - 1];

        // Re-implement calculation logic here or import. 
        // Ideally should be shared. For now, inline to minimize file churn.

        function calculateQuotaPrediction(quotaPercent, usageHistory) {
            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
            const recentEntries = usageHistory.filter(e => new Date(e.timestamp) >= sixHoursAgo);

            if (recentEntries.length < 2) return null;

            const oldest = recentEntries[0];
            const latest = recentEntries[recentEntries.length - 1];
            const hoursElapsed = (new Date(latest.timestamp) - new Date(oldest.timestamp)) / (1000 * 60 * 60);
            const percentChange = latest.tokenQuotaPercent - oldest.tokenQuotaPercent;
            const percentPerHour = percentChange / hoursElapsed;

            if (percentPerHour <= 0) return null;

            const remainingPercent = 100 - quotaPercent;
            const hoursUntilExhausted = remainingPercent / percentPerHour;

            return {
                hoursUntilExhausted: Math.round(hoursUntilExhausted),
                rate: percentPerHour.toFixed(2)
            };
        }

        const prediction = calculateQuotaPrediction(latest.tokenQuotaPercent, history.entries);

        if (prediction) {
            console.log(`\n📊 Quota Prediction:`);
            console.log(`   Current usage: ${latest.tokenQuotaPercent}%`);
            console.log(`   Time until exhausted: ${prediction.hoursUntilExhausted} hours`);
            console.log(`   Consumption rate: ${prediction.rate}%/hour\n`);
        } else {
            console.log('\nInsufficient data for prediction or quota not increasing.\n');
        }
    });

program
    .command('analytics')
    .description('Generate analytics reports')
    .option('--report <type>', 'Report type: summary, rates, peak', 'summary')
    .option('--period <range>', 'Time range: 1h, 6h, 12h, 24h, 7d, 30d', '24h')
    .action((options) => {
        const analyticsPath = path.join(packageRoot, 'scripts/analytics.mjs');
        try {
            execSync(`node ${analyticsPath} --report ${options.report} --period ${options.period}`, {
                stdio: 'inherit'
            });
        } catch (e) {
            // execSync throws if the command fails, but the script handles its own error printing mostly.
            // We just catch here to prevent ugly stack trace from the runner.
        }
    });

program
    .command('test-alert')
    .description('Test quota alert notifications')
    .action(async () => {
        try {
            const notifier = (await import('node-notifier')).default;
            notifier.notify({
                title: 'GLM Monitor Alert',
                message: '⚠️ Token quota at 85% - Approaching limit!',
                sound: true,
                wait: false
            });
            console.log('✓ Test notification sent');
        } catch (err) {
            console.error('Failed to send notification:', err.message);
        }
    });

/**
 * CLEANUP Command - Archive and clean up old data
 */
program
    .command('cleanup')
    .description('Archive and clean up old data')
    .option('--stats', 'Show storage statistics only')
    .action(async (options) => {
        try {
            const dataManagerPath = path.join(packageRoot, 'scripts/data-manager.mjs');
            if (options.stats) {
                const { getStorageStats } = await import(dataManagerPath);
                const stats = getStorageStats();
                console.log('\n📊 Storage Statistics:');
                console.log(`   Raw entries: ${stats.historyFile.entries}`);
                console.log(`   Hourly summaries: ${stats.summaryFile.entries}`);
                console.log(`   Total size: ${(stats.totalSize / 1024).toFixed(1)} KB\n`);
            } else {
                execSync(`node ${dataManagerPath}`, { stdio: 'inherit' });
            }
        } catch (err) {
            console.error('Cleanup failed:', err.message);
        }
    });

/**
 * BACKUP Command - Backup usage data
 */
program
    .command('backup')
    .description('Backup usage data')
    .option('--to <path>', 'Backup directory path')
    .action((options) => {
        const activeProfile = config.get('activeProfile', 'default');
        const dataDir = path.join(os.homedir(), '.glm-monitor');
        const backupPath = options.to || path.join(os.homedir(), 'glm-monitor-backups');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupFile = path.join(backupPath, `backup-${activeProfile}-${timestamp}.json`);

        // Create backup directory
        fs.mkdirSync(backupPath, { recursive: true });

        // Determine history file path based on profile
        const historyFileName = activeProfile === 'default'
            ? 'usage-history.json'
            : `${activeProfile}-usage-history.json`;
        const summaryFileName = activeProfile === 'default'
            ? 'usage-summary.json'
            : `${activeProfile}-usage-summary.json`;

        const historyPath = path.join(dataDir, historyFileName);
        const summaryPath = path.join(dataDir, summaryFileName);

        if (!fs.existsSync(historyPath)) {
            console.error('No usage data found. Run collect first.');
            return;
        }

        const historyData = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        const summaryData = fs.existsSync(summaryPath)
            ? JSON.parse(fs.readFileSync(summaryPath, 'utf-8'))
            : { summaries: [] };

        const backup = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            profile: activeProfile,
            config: {
                retention: config.get('retention', '24h'),
                baseUrl: config.get('baseUrl', 'https://api.z.ai/api/anthropic')
            },
            history: historyData,
            summaries: summaryData
        };

        fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
        const fileSize = fs.statSync(backupFile).size;

        console.log(`\n✓ Backup created successfully`);
        console.log(`  Profile: ${activeProfile}`);
        console.log(`  File: ${backupFile}`);
        console.log(`  Size: ${(fileSize / 1024).toFixed(1)} KB`);
        console.log(`  History entries: ${historyData.entries?.length || 0}`);
        console.log(`  Summary entries: ${summaryData.summaries?.length || 0}\n`);
    });

/**
 * RESTORE Command - Restore usage data from backup
 */
program
    .command('restore')
    .description('Restore usage data from backup')
    .option('--from <path>', 'Backup file path')
    .option('--force', 'Skip confirmation prompt')
    .action(async (options) => {
        const backupPath = options.from;

        if (!backupPath || !fs.existsSync(backupPath)) {
            // List available backups
            const defaultBackupDir = path.join(os.homedir(), 'glm-monitor-backups');
            if (fs.existsSync(defaultBackupDir)) {
                const backups = fs.readdirSync(defaultBackupDir)
                    .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
                    .sort()
                    .reverse()
                    .slice(0, 10);

                if (backups.length > 0) {
                    console.log('\nAvailable backups:');
                    backups.forEach(b => console.log(`  ${path.join(defaultBackupDir, b)}`));
                    console.log('\nUse: glm-monitor restore --from <path>\n');
                    return;
                }
            }
            console.error('Backup file not found. Specify with --from <path>');
            return;
        }

        let backup;
        try {
            backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
        } catch (e) {
            console.error('Failed to parse backup file:', e.message);
            return;
        }

        console.log(`\n📦 Backup Information:`);
        console.log(`   Created: ${new Date(backup.timestamp).toLocaleString()}`);
        console.log(`   Profile: ${backup.profile || 'default'}`);
        console.log(`   History entries: ${backup.history?.entries?.length || 0}`);
        console.log(`   Summary entries: ${backup.summaries?.summaries?.length || 0}`);

        if (!options.force) {
            const readline = (await import('readline')).default.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const answer = await new Promise(resolve => {
                readline.question('\nRestore this backup? This will overwrite current data. [y/N]: ', resolve);
            });
            readline.close();

            if (answer.toLowerCase() !== 'y') {
                console.log('Restore cancelled.\n');
                return;
            }
        }

        const dataDir = path.join(os.homedir(), '.glm-monitor');
        fs.mkdirSync(dataDir, { recursive: true });

        const profile = backup.profile || 'default';
        const historyFileName = profile === 'default'
            ? 'usage-history.json'
            : `${profile}-usage-history.json`;
        const summaryFileName = profile === 'default'
            ? 'usage-summary.json'
            : `${profile}-usage-summary.json`;

        fs.writeFileSync(
            path.join(dataDir, historyFileName),
            JSON.stringify(backup.history, null, 2)
        );

        if (backup.summaries && backup.summaries.summaries) {
            fs.writeFileSync(
                path.join(dataDir, summaryFileName),
                JSON.stringify(backup.summaries, null, 2)
            );
        }

        console.log(`\n✓ Restored from: ${backupPath}`);
        console.log(`  Profile: ${profile}`);
        console.log(`  History entries: ${backup.history?.entries?.length || 0}`);
        console.log(`  Summary entries: ${backup.summaries?.summaries?.length || 0}\n`);
    });

/**
 * PROFILE Command - Manage multiple GLM account profiles
 */
program
    .command('profile')
    .description('Manage multiple GLM account profiles')
    .option('--create <name>', 'Create a new profile')
    .option('--switch <name>', 'Switch to a profile')
    .option('--list', 'List all profiles')
    .option('--delete <name>', 'Delete a profile')
    .option('--token <token>', 'Auth token for new profile (use with --create)')
    .action(async (options) => {
        if (options.list || (!options.create && !options.switch && !options.delete)) {
            const profiles = config.get('profiles', {});
            const active = config.get('activeProfile', 'default');

            console.log('\n📋 Profiles:');

            // Always show default profile
            const defaultMarker = active === 'default' || !active ? '✓ ' : '  ';
            const defaultToken = config.get('authToken');
            console.log(`${defaultMarker}default ${defaultToken ? '(token set)' : '(no token)'}`);

            Object.entries(profiles).forEach(([name, profile]) => {
                const marker = name === active ? '✓ ' : '  ';
                const created = profile.createdAt
                    ? ` (created: ${new Date(profile.createdAt).toLocaleDateString()})`
                    : '';
                console.log(`${marker}${name}${created}`);
            });

            console.log(`\nActive profile: ${active || 'default'}\n`);
            return;
        }

        if (options.create) {
            const profileName = options.create;
            const profiles = config.get('profiles', {});

            if (profileName === 'default') {
                console.error('Cannot create a profile named "default". Use glm-monitor init instead.');
                return;
            }

            if (profiles[profileName]) {
                console.error(`Profile "${profileName}" already exists.`);
                return;
            }

            let token = options.token;

            if (!token) {
                const readline = (await import('readline')).default.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                token = await new Promise(resolve => {
                    readline.question(`Enter GLM auth token for "${profileName}": `, resolve);
                });
                readline.close();
            }

            if (!token || token.trim() === '') {
                console.error('Auth token is required.');
                return;
            }

            profiles[profileName] = {
                authToken: token.trim(),
                baseUrl: config.get('baseUrl', 'https://api.z.ai/api/anthropic'),
                createdAt: new Date().toISOString()
            };

            config.set('profiles', profiles);
            console.log(`✓ Profile "${profileName}" created`);

            // Offer to switch if this is the first custom profile
            if (Object.keys(profiles).length === 1) {
                config.set('activeProfile', profileName);
                console.log(`✓ Switched to profile "${profileName}"`);
            }
            return;
        }

        if (options.switch) {
            const profileName = options.switch;
            const profiles = config.get('profiles', {});

            if (profileName !== 'default' && !profiles[profileName]) {
                console.error(`Profile "${profileName}" not found.`);
                const available = ['default', ...Object.keys(profiles)];
                console.log(`Available profiles: ${available.join(', ')}`);
                return;
            }

            config.set('activeProfile', profileName);
            console.log(`✓ Switched to profile "${profileName}"`);
            return;
        }

        if (options.delete) {
            const profileName = options.delete;
            const profiles = config.get('profiles', {});

            if (profileName === 'default') {
                console.error('Cannot delete the default profile.');
                return;
            }

            if (!profiles[profileName]) {
                console.error(`Profile "${profileName}" not found.`);
                return;
            }

            if (profileName === config.get('activeProfile')) {
                console.error('Cannot delete the active profile. Switch to another profile first.');
                console.log('Use: glm-monitor profile --switch default');
                return;
            }

            delete profiles[profileName];
            config.set('profiles', profiles);

            // Also delete profile-specific data files
            const dataDir = path.join(os.homedir(), '.glm-monitor');
            const filesToDelete = [
                `${profileName}-usage-history.json`,
                `${profileName}-usage-summary.json`
            ];

            filesToDelete.forEach(f => {
                const filePath = path.join(dataDir, f);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`  Deleted: ${f}`);
                }
            });

            console.log(`✓ Deleted profile "${profileName}"`);
            return;
        }
    });

/**
 * START Command
 */
program
    .command('start')
    .description('Launch the monitoring dashboard')
    .option('-p, --port <port>', 'Port to run the dashboard on', '8080')
    .option('--no-collect', 'Skip data collection on start')
    .action(async (options) => {
        const port = parseInt(options.port, 10);
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
            console.error(`Invalid port: ${options.port}`);
            process.exitCode = 1;
            return;
        }
        const dataPath = path.join(os.homedir(), '.glm-monitor/usage-history.json');

        // Always collect fresh data on start (unless --no-collect flag)
        if (options.collect !== false) {
            console.log('\x1b[36mCollecting fresh usage data...\x1b[0m');
            try {
                const collectorPath = path.join(packageRoot, 'scripts/usage-collector.mjs');
                execSync(`node ${collectorPath}`, { stdio: 'inherit' });
            } catch (err) {
                console.error('Collection failed. Dashboard may show stale data.');
            }
        }

        console.log(`Launching GLM Neural Dashboard on http://localhost:${port}...`);

        // Use Vite to serve for now if in dev project, or serve static dist if installed
        const distPath = path.join(packageRoot, 'dist');
        const isInstalled = fs.existsSync(distPath);

        if (isInstalled) {
            // Simple server to serve dist and proxy data
            const server = http.createServer((req, res) => {
                const method = req.method || 'GET';
                if (method !== 'GET' && method !== 'HEAD') {
                    res.statusCode = 405;
                    res.end('Method Not Allowed');
                    return;
                }

                const url = new URL(req.url || '/', `http://localhost:${port}`);
                if (url.pathname === '/data/usage-history.json') {
                    fs.readFile(dataPath, (err, data) => {
                        if (err) {
                            res.statusCode = 404;
                            res.end('Data not found');
                        } else {
                            res.setHeader('Content-Type', 'application/json');
                            res.end(data);
                        }
                    });
                    return;
                }

                const getMimeType = (ext) => {
                    const mimeTypes = {
                        '.html': 'text/html; charset=utf-8',
                        '.js': 'text/javascript; charset=utf-8',
                        '.css': 'text/css; charset=utf-8',
                        '.json': 'application/json; charset=utf-8',
                        '.map': 'application/json; charset=utf-8',
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.svg': 'image/svg+xml; charset=utf-8',
                        '.ico': 'image/x-icon'
                    };
                    return mimeTypes[ext] || 'application/octet-stream';
                };

                const serveFile = (filePath) => {
                    fs.readFile(filePath, (err, data) => {
                        if (err) {
                            res.statusCode = 404;
                            res.end('Not found');
                            return;
                        }
                        res.setHeader('Content-Type', getMimeType(path.extname(filePath)));
                        res.end(data);
                    });
                };

                let pathname = url.pathname || '/';
                try {
                    pathname = decodeURIComponent(pathname);
                } catch {
                    res.statusCode = 400;
                    res.end('Bad Request');
                    return;
                }

                const requestedPath = pathname === '/' ? '/index.html' : pathname;
                const candidate = path.resolve(distPath, `.${requestedPath}`);
                const relative = path.relative(distPath, candidate);
                if (relative.startsWith('..') || path.isAbsolute(relative)) {
                    res.statusCode = 403;
                    res.end('Forbidden');
                    return;
                }

                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    serveFile(candidate);
                    return;
                }

                if (!path.extname(requestedPath)) {
                    serveFile(path.join(distPath, 'index.html'));
                    return;
                }

                res.statusCode = 404;
                res.end('Not found');
            });

            server.listen(port, () => {
                opn(`http://localhost:${port}`);
            });
        } else {
            console.log('Running in development mode via Vite...');
            // In dev, we use Vite but we need to serve the data from the home dir
            // We'll create a symlink or just tell the user to run npm run dev
            console.log('\x1b[36mNote: In project dev mode, run `npm run dev` and data will be read from your home directory if configured.\x1b[0m');
            opn(`http://localhost:5173`);
        }
    });

/**
 * API Command - Start REST API server for integrations
 */
program
    .command('api')
    .description('Start REST API server for local integrations')
    .option('-p, --port <port>', 'Port to listen on', '8081')
    .action((options) => {
        const port = parseInt(options.port, 10);
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
            console.error(`Invalid port: ${options.port}`);
            return;
        }

        console.log('\n🔌 Starting GLM Monitor API server...');

        const apiPath = path.join(packageRoot, 'scripts/api-server.mjs');
        const apiServer = spawn('node', [apiPath], {
            env: { ...process.env, PORT: port.toString() },
            stdio: 'inherit'
        });

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

/**
 * HEALTH-CHECK Command - Run system health diagnostics
 */
program
    .command('health-check')
    .description('Run system health diagnostics')
    .action(async () => {
        console.log('\n🏥 GLM Monitor Health Check\n');

        let allPassed = true;

        // Check 1: Configuration
        console.log('Checking configuration...');
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
        const activeProfile = config.get('activeProfile', 'default');
        const historyFileName = activeProfile === 'default'
            ? 'usage-history.json'
            : `${activeProfile}-usage-history.json`;
        const historyFile = path.join(dataDir, historyFileName);

        if (fs.existsSync(historyFile)) {
            const stats = fs.statSync(historyFile);
            console.log(`  ✓ History file exists (${stats.size} bytes)`);

            try {
                const data = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
                console.log(`  ✓ ${data.entries?.length || 0} entries`);

                // Check for stale data
                if (data.lastUpdated) {
                    const lastUpdated = new Date(data.lastUpdated);
                    const staleMinutes = (Date.now() - lastUpdated.getTime()) / (1000 * 60);
                    if (staleMinutes > 30) {
                        console.log(`  ⚠️  Data is ${Math.round(staleMinutes)} minutes old`);
                    } else {
                        console.log(`  ✓ Data is recent (${Math.round(staleMinutes)} minutes old)`);
                    }
                }
            } catch (e) {
                console.log('  ✗ Failed to parse history file');
                allPassed = false;
            }
        } else {
            console.log('  ✗ No history file - Run: glm-monitor collect');
            allPassed = false;
        }

        // Check 3: API credentials
        console.log('\nChecking GLM API configuration...');
        const baseUrl = config.get('baseUrl') || process.env.ANTHROPIC_BASE_URL;
        const authToken = config.get('authToken') || process.env.ANTHROPIC_AUTH_TOKEN;

        if (baseUrl && authToken) {
            console.log('  ✓ API credentials configured');
            console.log(`     URL: ${baseUrl}`);
        } else {
            if (!baseUrl) console.log('  ✗ Base URL not set');
            if (!authToken) console.log('  ✗ Auth token not set');
            allPassed = false;
        }

        // Check 4: Data directory
        console.log('\nChecking data directory...');
        if (fs.existsSync(dataDir)) {
            console.log(`  ✓ Data directory accessible: ${dataDir}`);
        } else {
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

/**
 * DIAGNOSE Command - Run diagnostics and report issues
 */
program
    .command('diagnose')
    .description('Run diagnostics and report issues')
    .action(() => {
        const diagnosticsPath = path.join(packageRoot, 'scripts/diagnostics.mjs');
        try {
            execSync(`node ${diagnosticsPath}`, { stdio: 'inherit' });
        } catch (e) {
            // Script handles its own error output
        }
    });

/**
 * INSIGHTS Command - Generate usage insights and patterns
 */
program
    .command('insights')
    .description('Generate usage insights and patterns')
    .option('--period <range>', 'Time range: 1h, 6h, 12h, 24h, 7d, 30d', '24h')
    .action((options) => {
        const analyticsPath = path.join(packageRoot, 'scripts/analytics.mjs');
        try {
            execSync(`node ${analyticsPath} --report insights --period ${options.period}`, {
                stdio: 'inherit'
            });
        } catch (e) {
            // Script handles its own error output
        }
    });

/**
 * SETUP Command - Interactive setup wizard
 */
program
    .command('setup')
    .description('Interactive setup wizard for first-time configuration')
    .action(() => {
        const wizardPath = path.join(packageRoot, 'scripts/setup-wizard.mjs');
        try {
            execSync(`node ${wizardPath}`, { stdio: 'inherit' });
        } catch (e) {
            // Script handles its own errors
        }
    });

/**
 * MONITOR Command (Collect then Start)
 */
program
    .command('monitor')
    .description('Collect data and then launch dashboard')

    .action(async () => {
        try {
            const collectorPath = path.join(packageRoot, 'scripts/usage-collector.mjs');
            execSync(`node ${collectorPath}`, { stdio: 'inherit' });
        } catch (err) {
            console.error('Collection failed.');
        }
        program.parse(['node', 'bin/glm-monitor.js', 'start']);
    });

// Only parse if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    program.parse();
}
