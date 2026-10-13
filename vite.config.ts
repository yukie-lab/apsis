import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Relative base: the build output works in any directory of a static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts', 'scratch/**/*.test.ts'], testTimeout: 120000 },
});
