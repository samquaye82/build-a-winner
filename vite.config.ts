/**
 * Vite configuration for the Sporting Director Game.
 *
 * Vitest is configured inline here (Vitest reads the Vite config), so there
 * is a single source of truth for build and test settings.
 */
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Engine tests are pure TypeScript with no DOM requirement; keep the
    // default node environment until UI component tests need otherwise.
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
