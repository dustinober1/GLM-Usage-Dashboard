// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';

// Mock styles import - this needs to be before dynamic import too? 
// Vite handles css imports by usually ignoring them or processing. 
// We can use vi.mock for it.
vi.mock('../src/styles.css', () => ({}));

describe('Frontend Logic', () => {
    let main;

    beforeAll(async () => {
        // Shim localStorage just in case jsdom is being weird or lazily loaded
        const localStorageMock = (() => {
            let store = {};
            return {
                getItem: vi.fn((key) => store[key] || null),
                setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
                clear: vi.fn(() => { store = {}; }),
                removeItem: vi.fn((key) => { delete store[key]; }),
            };
        })();

        vi.stubGlobal('localStorage', localStorageMock);

        // Mock fetch
        global.fetch = vi.fn();

        // Mock Chart.js before import
        vi.mock('chart.js/auto', () => ({
            default: class {
                constructor() {
                    this.data = { datasets: [], labels: [] };
                }
                update() { }
                destroy() { }
            }
        }));

        // Dynamically import main.js
        main = await import('../src/main.js');
    });

    describe('formatNumber', () => { // id: 1
        it('should format millions', () => { // id: 2
            expect(main.formatNumber(1500000)).toBe('1.50M');
        });
        it('should format thousands', () => { // id: 3
            expect(main.formatNumber(1500)).toBe('1.5K');
        });
        it('should format small numbers', () => { // id: 4
            expect(main.formatNumber(500)).toBe('500');
        });
    });

    describe('calculateRates', () => { // id: 5
        it('should calculate valid rates', () => { // id: 6
            const now = Date.now();
            const entries = [
                { timestamp: new Date(now - 1800000).toISOString(), tokensUsed: 1000, modelCalls: 10 }, // 30 mins ago
                { timestamp: new Date(now).toISOString(), tokensUsed: 2000, modelCalls: 20 }
            ];

            const rates = main.calculateRates(entries);
            // 30 mins diff. tokens change 1000. Logic returns raw delta for the window.
            expect(rates.tokensPerHour).toBe(1000);
            expect(rates.callsPerHour).toBe(10);
            expect(rates.avgTokensPerCall).toBe(100);
        });

        it('should return null for insufficient data', () => { // id: 7
            expect(main.calculateRates([])).toBeNull();
        });
    });

    describe('DOM Rendering', () => { // id: 8
        beforeEach(() => { // id: 9
            // Setup DOM elements expected by fetchData
            document.body.innerHTML = `
                <div id="app"></div>
                <div id="test-card"></div>
                <div id="test-quota"></div>
                <div id="dashboard-content"></div>
                <div id="error-message"></div>
                <div id="last-updated"></div>
                <div id="refresh-btn"></div>
                <div id="rates-grid"></div>
                <div id="token-quota-card"></div>
                <div id="time-quota-card"></div>
                <div id="model-usage-card"></div>
                <div id="token-usage-card"></div>
                <div id="mcp-usage-card"></div>
                <div id="usage-chart"></div>
                <div id="quota-chart"></div>
                <div id="loading-indicator"></div>
            `;
            // Reset fetch mock
            global.fetch.mockReset();
        });

        it('should render metric card', () => { // id: 10
            main.renderMetricCard('test-card', 'Test Label', '100', 'units');
            const el = document.getElementById('test-card');
            expect(el.innerHTML).toContain('Test Label');
            expect(el.innerHTML).toContain('100');
            expect(el.innerHTML).toContain('units');
        });

        it('should render quota card with prediction', () => { // id: 11
            main.renderQuotaCard('test-quota', 'Quota', { current: 50, max: 100, percentage: 50 }, { hoursUntilExhausted: 5 });
            const el = document.getElementById('test-quota');
            expect(el.innerHTML).toContain('Quota');
            expect(el.innerHTML).toContain('50%');
            expect(el.innerHTML).toContain('Exhaustion in 5h');
        });

        it('should fetch data and render', async () => {
            const mockData = {
                entries: [
                    { timestamp: new Date().toISOString(), modelCalls: 100, tokensUsed: 1000, mcpCalls: 5, tokenQuotaPercent: 10, timeQuotaPercent: 10 }
                ],
                quotaLimits: {
                    tokenQuota: { percentage: 10, current: 100, max: 1000 },
                    timeQuota: { percentage: 10, current: 100, max: 1000 }
                },
                lastUpdated: new Date().toISOString(),
                quotaPrediction: { hoursUntilExhausted: 24 }
            };

            global.fetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockData)
            });

            await main.fetchData();

            // Check that app container has content
            const app = document.getElementById('app');
            expect(app.innerHTML).toContain('GLM Intelligence'); // Header title
            expect(app.innerHTML).toContain('1.0K'); // Formatted token count
        });

        it('should handle fetch error', async () => {
            global.fetch.mockResolvedValue({
                ok: false,
                statusText: 'Not Found'
            });

            await main.fetchData();

            const app = document.getElementById('app');
            // App should show error message
            expect(app.innerHTML).toContain('Data not available');
        });
    });
});
