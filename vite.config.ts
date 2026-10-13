import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const pkg = JSON.parse(read('./package.json')) as { version: string };

// Libraries that are in the files of the application. The About screen lists them, and the file licenses.txt
// has their license texts.
const LIBRARY_NAMES = ['react', 'react-dom', 'scheduler', 'three', 'zustand'];
const libraries = LIBRARY_NAMES.map((name) => {
  const p = JSON.parse(read(`./node_modules/${name}/package.json`)) as { version: string; license: string };
  return { name, version: p.version, license: p.license };
});
const licenseText = (): string =>
  libraries.map((l) => `${l.name} ${l.version}\n${'-'.repeat(`${l.name} ${l.version}`.length)}\n\n${read(`./node_modules/${l.name}/LICENSE`).trim()}\n`).join('\n\n');

/** Puts licenses.txt next to index.html (build) and serves it from the development server. */
function licenseFile(): Plugin {
  return {
    name: 'apsis-licenses',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0].endsWith('/licenses.txt')) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(licenseText());
        } else next();
      });
    },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'licenses.txt', source: licenseText() }); },
  };
}

// Relative base: the build output works in any directory of a static host.
export default defineConfig({
  base: './',
  plugins: [react(), licenseFile()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __LIBRARIES__: JSON.stringify(libraries) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
});
