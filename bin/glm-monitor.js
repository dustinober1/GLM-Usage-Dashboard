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

const config = new Conf({ projectName: 'glm-monitor' });
const program = new Command();

program
    .name('glm-monitor')
    .description('GLM Usage monitoring and dashboard CLI')
    .version('1.0.0');

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

/**
 * START Command
 */
program
    .command('start')
    .description('Launch the monitoring dashboard')
    .option('-p, --port <port>', 'Port to run the dashboard on', '8080')
    .action(async (options) => {
        const port = parseInt(options.port);
        const dataPath = path.join(os.homedir(), '.glm-monitor/usage-history.json');

        if (!fs.existsSync(dataPath)) {
            console.warn('\x1b[33mWarning: No usage data found. Running initial collection...\x1b[0m');
            try {
                const collectorPath = path.join(packageRoot, 'scripts/usage-collector.mjs');
                execSync(`node ${collectorPath}`, { stdio: 'inherit' });
            } catch (err) {
                console.error('Initial collection failed. Dashboard may be empty.');
            }
        }

        console.log(`Launching GLM Neural Dashboard on http://localhost:${port}...`);

        // Use Vite to serve for now if in dev project, or serve static dist if installed
        const distPath = path.join(packageRoot, 'dist');
        const isInstalled = fs.existsSync(distPath);

        if (isInstalled) {
            // Simple server to serve dist and proxy data
            const server = http.createServer((req, res) => {
                if (req.url.startsWith('/data/usage-history.json')) {
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

                // Serve static files from dist
                let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url);
                fs.readFile(filePath, (err, data) => {
                    if (err) {
                        res.statusCode = 404;
                        res.end('Not found');
                    } else {
                        const ext = path.extname(filePath);
                        const mimeTypes = {
                            '.html': 'text/html',
                            '.js': 'text/javascript',
                            '.css': 'text/css',
                            '.json': 'application/json',
                            '.png': 'image/png',
                            '.jpg': 'image/jpg',
                            '.svg': 'image/svg+xml'
                        };
                        res.setHeader('Content-Type', mimeTypes[ext] || 'text/plain');
                        res.end(data);
                    }
                });
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

program.parse();
