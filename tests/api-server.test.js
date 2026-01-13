/**
 * API Server Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';

// We'll test the API by importing the Express app directly
// This avoids needing to start/stop the server for each test

describe('API Server', () => {
    let app;
    let server;
    const port = 8099; // Test port

    beforeAll(async () => {
        // Import the app (not starting the full server)
        const module = await import('../scripts/api-server.mjs');
        app = module.app;

        // Start server on test port
        server = app.listen(port, '127.0.0.1');
    });

    afterAll(() => {
        if (server) {
            server.close();
        }
    });

    /**
     * Helper to make HTTP requests
     */
    function fetch(path) {
        return new Promise((resolve, reject) => {
            http.get(`http://localhost:${port}${path}`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({
                            status: res.statusCode,
                            data: JSON.parse(data)
                        });
                    } catch {
                        resolve({
                            status: res.statusCode,
                            data: data
                        });
                    }
                });
            }).on('error', reject);
        });
    }

    describe('GET /api/health', () => {
        it('should return health status', async () => {
            const res = await fetch('/api/health');

            expect(res.status).toBe(200);
            expect(res.data.status).toBe('ok');
            expect(res.data.version).toBe('1.0.0');
            expect(res.data).toHaveProperty('dataAvailable');
            expect(res.data).toHaveProperty('entriesCount');
            expect(res.data).toHaveProperty('activeProfile');
        });
    });

    describe('GET /api/current', () => {
        it('should return 404 when no data available', async () => {
            const res = await fetch('/api/current');

            // Without real data, should return 404
            expect(res.status).toBe(404);
            expect(res.data.error).toBe('No data available');
        });
    });

    describe('GET /api/history', () => {
        it('should return 404 when no data available', async () => {
            const res = await fetch('/api/history');

            expect(res.status).toBe(404);
        });

        it('should accept range parameter', async () => {
            const res = await fetch('/api/history?range=24h');

            expect(res.status).toBe(404); // No data
        });
    });

    describe('GET /api/predict', () => {
        it('should return 404 with insufficient data', async () => {
            const res = await fetch('/api/predict');

            expect(res.status).toBe(404);
            expect(res.data.error).toContain('Insufficient data');
        });
    });

    describe('GET /api/settings', () => {
        it('should return current settings', async () => {
            const res = await fetch('/api/settings');

            expect(res.status).toBe(200);
            expect(res.data).toHaveProperty('retention');
            expect(res.data).toHaveProperty('activeProfile');
            expect(res.data).toHaveProperty('profiles');
            expect(Array.isArray(res.data.profiles)).toBe(true);
        });
    });

    describe('GET /api/rates', () => {
        it('should return 404 with insufficient data', async () => {
            const res = await fetch('/api/rates');

            expect(res.status).toBe(404);
        });
    });

    describe('404 handler', () => {
        it('should return 404 for unknown endpoints', async () => {
            const res = await fetch('/api/unknown');

            expect(res.status).toBe(404);
            expect(res.data.error).toBe('Not found');
            expect(res.data).toHaveProperty('availableEndpoints');
        });
    });
});
