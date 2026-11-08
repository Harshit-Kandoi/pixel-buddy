import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Dev server for the store screenshot scenes (see scripts/store-screenshots.mjs).
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { host: '127.0.0.1', port: 4191, strictPort: true, fs: { allow: [resolve(__dirname, '../../../..')] } },
});
