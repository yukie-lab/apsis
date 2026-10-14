// Configuration of "npm run manual:data": vitest runs the script that writes the data of the manual
// (tools/manual/data/manual-data.spec.ts). The script uses the engine of the application.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: new URL('../..', import.meta.url).pathname,
  test: { include: ['tools/manual/data/manual-data.spec.ts'], testTimeout: 600000 },
});
