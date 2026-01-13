import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateQuotaPrediction, collectUsage } from '../scripts/usage-collector.mjs';
import https from 'https';
import fs from 'fs';
import { EventEmitter } from 'events';

vi.mock('https');
vi.mock('fs');
vi.mock('conf', () => {
    return {
        default: class {
            get(key) {
                if (key === 'baseUrl') return 'https://api.example.com';
                if (key === 'authToken') return 'fake-token';
                if (key === 'retention') return '24h';
                return null;
            }
        }
    };
});

describe('Usage Collector Script', () => {
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

    describe('calculateQuotaPrediction', () => {
        it('should predict exhaustion correctly', () => {
            const now = Date.now();
            const history = [
                { timestamp: new Date(now - 4 * 60 * 60 * 1000).toISOString(), tokenQuotaPercent: 50 },
                { timestamp: new Date(now).toISOString(), tokenQuotaPercent: 60 }
            ];
            // 4 hours elapsed, 10% change. Rate = 2.5% per hour.
            // Remaining 40%. 40 / 2.5 = 16 hours.

            const prediction = calculateQuotaPrediction(60, history);
            expect(prediction).toEqual({
                hoursUntilExhausted: 16,
                rate: '2.50'
            });
        });

        it('should return null if not consuming quota', () => {
            const now = Date.now();
            const history = [
                { timestamp: new Date(now - 4 * 60 * 60 * 1000).toISOString(), tokenQuotaPercent: 50 },
                { timestamp: new Date(now).toISOString(), tokenQuotaPercent: 50 }
            ];
            const prediction = calculateQuotaPrediction(50, history);
            expect(prediction).toBeNull();
        });
    });

    describe('collectUsage', () => {
        it('should collect data and save history', async () => {
            // Mock fs.existsSync to return true for history file check (or false to start fresh)
            // Let's mock loadHistory to return empty
            vi.spyOn(fs, 'existsSync').mockReturnValue(false);
            vi.spyOn(fs, 'mkdirSync').mockImplementation(() => { });
            vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { });

            // Mock HTTPS request
            const mockRequest = vi.fn((opts, cb) => {
                const res = new EventEmitter();
                res.statusCode = 200;
                cb(res);

                const data = opts.path.includes('model-usage') ? { data: { totalUsage: { totalModelCallCount: 10, totalTokensUsage: 1000 } } } :
                    opts.path.includes('tool-usage') ? { data: { totalUsage: { totalSearchMcpCount: 5 } } } :
                        opts.path.includes('quota/limit') ? { data: { limits: [{ type: 'TOKENS_LIMIT', percentage: 10 }, { type: 'TIME_LIMIT', percentage: 5 }] } } :
                            {};

                res.emit('data', JSON.stringify(data));
                res.emit('end');
                return { on: vi.fn(), end: vi.fn() };
            });
            https.request.mockImplementation(mockRequest);

            await collectUsage();

            // Verify https called 3 times
            expect(https.request).toHaveBeenCalledTimes(3);

            // Verify fs.writeFileSync called with new entry
            expect(fs.writeFileSync).toHaveBeenCalled();
            const writeCall = fs.writeFileSync.mock.calls[0];
            const savedData = JSON.parse(writeCall[1]);

            expect(savedData.entries).toHaveLength(1);
            expect(savedData.entries[0].modelCalls).toBe(10);
            expect(savedData.entries[0].tokensUsed).toBe(1000);
        });

        it('should handle collection failure gracefully', async () => {
            const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
            vi.spyOn(fs, 'mkdirSync').mockImplementation(() => { });

            // Mock HTTPS request failure
            const mockRequest = vi.fn((opts, cb) => {
                const req = new EventEmitter();
                req.end = vi.fn();
                setTimeout(() => { req.emit('error', new Error('Network error')); }, 1);
                return req;
            });
            https.request.mockImplementation(mockRequest);

            try { await collectUsage(); } catch (e) { }

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Collection failed'));
            expect(exitSpy).toHaveBeenCalledWith(1);
        });
    });
});
