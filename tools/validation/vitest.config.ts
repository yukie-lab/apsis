// Configuration of "npm run report": vitest runs the script that writes docs/VALIDATION.md.
// The script uses the modules of the application (texts, measured values), thus it needs the Vite loader.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: new URL('../..', import.meta.url).pathname,
  test: { include: ['tools/validation/report.spec.ts'], testTimeout: 60000 },
});
