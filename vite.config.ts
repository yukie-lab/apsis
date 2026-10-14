import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/**
 * Puts the user manual (the directory manual/, made by tools/manual) next to index.html in the build: the About
 * screen opens manual/index.html. The development server serves the directory from the project directory.
 */
function manualFiles(): Plugin {
  const from = fileURLToPath(new URL('./manual', import.meta.url));
  let outDir = '';
  return {
    name: 'apsis-manual',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir); },
    buildStart() { if (!existsSync(join(from, 'index.html'))) this.error('manual/index.html is missing. The About screen opens this file (npm run manual:build).'); },
    closeBundle() { cpSync(from, join(outDir, 'manual'), { recursive: true }); },
  };
}

// Relative base: the build output works in any directory of a static host.
export default defineConfig({
  base: './',
  plugins: [react(), licenseFile(), manualFiles()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __LIBRARIES__: JSON.stringify(libraries) },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
});
