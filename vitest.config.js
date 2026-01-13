/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node', // Default to node for scripts/backend
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['bin/**/*.js', 'scripts/**/*.mjs', 'src/**/*.js'],
            exclude: ['src/styles.css', 'dist/**', 'coverage/**', 'capture-screenshots.js', 'vitest.config.js'],
            all: true
        },
        include: ['tests/**/*.{test,spec}.{js,mjs,jsx,tsx}'],
    },
});
