import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base: the build output works in any directory of a static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts', 'scratch/**/*.test.ts'], testTimeout: 120000 },
});
