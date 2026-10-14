// Development server of the video frames of the manual (tools/manual/video). The capture script starts it.
// /__tex converts a TeX formula to SVG paths with MathJax (in Node). /data/ serves the data of the manual.
import { defineConfig, type Plugin } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { texToSvg } from './video/tex.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT = new URL('./.out/', import.meta.url).pathname;

function manualServer(): Plugin {
  return {
    name: 'apsis-manual',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x');
        if (url.pathname === '/__tex') {
          try {
            const svg = await texToSvg(url.searchParams.get('src') ?? '', url.searchParams.get('display') !== '0');
            res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
            res.end(svg);
          } catch (e) { res.statusCode = 400; res.end(String(e)); }
          return;
        }
        if (url.pathname.startsWith('/out/')) {
          // Data, narration timing and pictures that the other steps wrote to tools/manual/.out/.
          const file = OUT + decodeURIComponent(url.pathname.slice(5));
          // ?optional=1: a missing file is not an error (status 204, no console message in the page).
          if (!file.startsWith(OUT) || !existsSync(file)) { res.statusCode = url.searchParams.has('optional') ? 204 : 404; res.end(); return; }
          const type = file.endsWith('.json') ? 'application/json' : file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
          res.setHeader('Content-Type', type);
          res.end(readFileSync(file));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: new URL('./video', import.meta.url).pathname,
  plugins: [manualServer()],
  server: { port: 5330, strictPort: true, fs: { allow: [ROOT] } },
  logLevel: 'warn',
});
