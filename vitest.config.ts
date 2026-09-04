import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// Pin the test timezone so date-only renders (toLocaleDateString of an early-UTC
// timestamp like '2025-11-28T09:10:00+00:00') produce the same calendar day on
// every machine and in CI, instead of rolling back a day in US zones.
process.env.TZ = 'UTC'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
