import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { program } from '../bin/glm-monitor.js';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

vi.mock('fs');
vi.mock('child_process', () => ({
    execSync: vi.fn(),
    spawn: vi.fn()
}));

// We need to mock conf locally or it uses the real one if singleton.
// The real file imports Conf and creates `const config = new Conf(...)`.
// We should mock 'conf' factory.
vi.mock('conf', () => {
    return {
        default: class {
            constructor() {
                this.store = {};
            }
            get(key) { return this.store[key]; }
            set(key, val) { this.store[key] = val; }
        }
    };
});

describe('CLI Commands', () => {
    let consoleLogSpy;
    let consoleErrorSpy;

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should define init command', () => {
        const cmd = program.commands.find(c => c.name() === 'init');
        expect(cmd).toBeDefined();
    });

    it('should run collect command', () => {
        program.exitOverride();

        try {
            program.parse(['node', 'glm-monitor', 'collect']);
        } catch (e) {
            // ignore exit
        }

        expect(execSync).toHaveBeenCalledWith(expect.stringContaining('usage-collector.mjs'), expect.anything());
    });

    it('should run analytics command', () => {
        program.exitOverride();
        try {
            program.parse(['node', 'glm-monitor', 'analytics', '--report', 'summary']);
        } catch (e) { }

        expect(execSync).toHaveBeenCalledWith(expect.stringContaining('analytics.mjs --report summary'), expect.anything());
    });

    it('should run config command', () => {
        program.exitOverride();
        try {
            program.parse(['node', 'glm-monitor', 'config', '--retention', '7d']);
        } catch (e) { }

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Retention set to 7d'));
    });

    it('should handle invalid config retention', () => {
        program.exitOverride();
        try {
            program.parse(['node', 'glm-monitor', 'config', '--retention', 'invalid']);
        } catch (e) { }
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid retention period'));
    });

    it('should run predict command', () => {
        program.exitOverride();
        // Need to mock fs for usage history
        const mockFs = {
            existsSync: vi.fn().mockReturnValue(true),
            readFileSync: vi.fn().mockReturnValue(JSON.stringify({
                entries: [
                    { timestamp: '2023-01-01T10:00:00Z', tokenQuotaPercent: 50 },
                    { timestamp: '2023-01-01T14:00:00Z', tokenQuotaPercent: 60 }
                ]
            }))
        };

        // usage:
        const now = Date.now();
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
            entries: [
                { timestamp: new Date(now - 4 * 3600000).toISOString(), tokenQuotaPercent: 50 },
                { timestamp: new Date(now).toISOString(), tokenQuotaPercent: 60 }
            ]
        }));

        program.parse(['node', 'glm-monitor', 'predict']);
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Quota Prediction'));
    });

    it('should run start command', () => {
        program.exitOverride();
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);

        // Start command spawns server or execs vite.
        // It also checks port.
        try {
            program.parse(['node', 'glm-monitor', 'start', '--port', '9090', '--no-collect']);
        } catch (e) { }

        // Check if it logged launching message
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Launching GLM Neural Dashboard'));
    });

    it('should run monitor command', () => {
        program.exitOverride();

        // Monitor calls collect then start
        // We can mock program.parse recursively? Or just check if it calls execSync then triggers start logic.
        // Actually monitor calls program.parse(['... start']).
        // We can spy on program.parse? No it's the instance method.
        // We can check if it calls execSync for collector.

        try {
            program.parse(['node', 'glm-monitor', 'monitor']);
        } catch (e) { }

        expect(execSync).toHaveBeenCalledWith(expect.stringContaining('usage-collector.mjs'), expect.anything());
        // And it should trigger start command logic which logs launching
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Launching GLM Neural Dashboard'));
    });
});
