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
        const useEnv = await question('Found token in environment variables. Use it? [Y/n]: ');
        if (useEnv.toLowerCase() !== 'n') {
            config.set('authToken', envToken);
            console.log('✓ Using token from environment\n');
        }
    }

    if (!config.get('authToken')) {
        console.log('Enter your GLM Auth Token:');
        console.log('(Get it from your API dashboard)\n');
        const token = await question('Token: ');
        if (token.trim()) {
            config.set('authToken', token.trim());
            console.log('✓ Token saved\n');
        } else {
            console.log('⚠️  No token provided. You can set it later with: glm-monitor init -t YOUR_TOKEN\n');
        }
    }

    // Step 2: Base URL
    console.log('Step 2: API Configuration');
    console.log('--------------------------\n');

    const defaultUrl = 'https://api.z.ai/api/anthropic';
    const currentUrl = config.get('baseUrl', defaultUrl);

    const useDefault = await question(`Base URL [${currentUrl}]: `);
    if (useDefault.trim()) {
        config.set('baseUrl', useDefault.trim());
    } else if (!config.get('baseUrl')) {
        config.set('baseUrl', defaultUrl);
    }
    console.log('✓ API URL configured\n');

    // Step 3: Test Connection
    console.log('Step 3: Test Connection');
    console.log('-----------------------\n');

    if (config.get('authToken')) {
        const testNow = await question('Test API connection now? [Y/n]: ');
        if (testNow.toLowerCase() !== 'n') {
            try {
                console.log('Testing...');
                execSync('npx glm-monitor collect', { stdio: 'pipe' });
                console.log('✓ Connection successful!\n');
            } catch (err) {
                console.log('✗ Connection failed. Please check your token and URL.\n');
            }
        }
    } else {
        console.log('Skipping connection test (no token configured)\n');
    }

    // Step 4: Data Retention
    console.log('Step 4: Data Retention');
    console.log('---------------------\n');

    const retention = await question('How long to keep data? [24h/7d/30d] (default: 24h): ');
    const validRetention = ['24h', '7d', '30d'].includes(retention) ? retention : '24h';
    config.set('retention', validRetention);
    console.log(`✓ Retention set to ${validRetention}\n`);

    // Step 5: Automation
    console.log('Step 5: Automation');
    console.log('------------------\n');

    const setupAuto = await question('Would you like automation setup instructions? [Y/n]: ');
    if (setupAuto.toLowerCase() !== 'n') {
        const platform = process.platform;

        if (platform === 'darwin') {
            console.log('\n📦 macOS Automation Setup:');
            console.log('1. Create ~/Library/LaunchAgents/com.user.glm-monitor.plist');
            console.log('2. Add the configuration from the README.md');
            console.log('3. Run: launchctl load ~/Library/LaunchAgents/com.user.glm-monitor.plist');
        } else if (platform === 'linux') {
            console.log('\n📦 Linux Automation Setup:');
            console.log('1. Run: crontab -e');
            console.log('2. Add: */5 * * * * npx glm-monitor collect');
        } else {
            console.log('\n📦 Windows Automation Setup:');
            console.log('1. Open Task Scheduler');
            console.log('2. Create a task to run "npx glm-monitor collect" every 5 minutes');
        }
        console.log('');
    }

    console.log('✨ Setup complete!\n');
    console.log('Quick commands:');
    console.log('  glm-monitor collect     - Collect usage data');
    console.log('  glm-monitor start       - Launch dashboard');
    console.log('  glm-monitor --help      - Show all commands');
    console.log('');

    rl.close();
}

runWizard().catch(err => {
    console.error('Setup failed:', err.message);
    rl.close();
    process.exit(1);
});
