import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Ship Tampermonkey script from repo `userscripts/` as a static download (`/userscripts/...`). */
function copyPartyIngestUserscript(): void {
  const destDir = path.resolve(__dirname, 'public/userscripts');
  const dest = path.join(destDir, 'ddb-party-ingest.user.js');
  // Only paths that stay inside the monorepo. Avoid `cwd + ../../userscripts`: from repo root that resolves to `/userscripts`.
  const candidates = [
    path.resolve(__dirname, '../../userscripts/ddb-party-ingest.user.js'),
    path.resolve(process.cwd(), 'userscripts/ddb-party-ingest.user.js'),
  ];
  const unique = [...new Set(candidates.map((p) => path.normalize(p)))];
  const src = unique.find((p) => fs.existsSync(p));
  if (!src) {
    console.warn(
      '[vite] userscripts/ddb-party-ingest.user.js not found (expected next to monorepo root: `userscripts/`). ' +
        'Add that folder to the image/build context or the Settings download link will 404.',
    );
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ddb-copy-party-ingest-userscript',
      buildStart() {
        copyPartyIngestUserscript();
      },
      configureServer() {
        copyPartyIngestUserscript();
      },
    },
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        ws: true,
      },
    },
  },
});
