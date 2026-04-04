import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', '.next', 'dist', '**/*.test.tsx', '**/*.test.ts'],
    },
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@queenbee/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
    deps: {
      inline: [/@queenbee\/core/],
    }
  },
})
