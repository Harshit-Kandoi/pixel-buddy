import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const root = resolve(__dirname, 'extension/src');
const outDir = resolve(__dirname, 'out/extension');

// Two passes into out/extension: the default mode builds the pages and service worker;
// `--mode content` builds the content script as one classic script, because Chrome
// cannot load content scripts as ES modules.
export default defineConfig(({ mode }) =>
  mode === 'content'
    ? {
        root,
        publicDir: false,
        build: {
          outDir,
          emptyOutDir: false,
          lib: { entry: resolve(root, 'content.ts'), formats: ['iife'], name: 'pixelBuddyContent', fileName: () => 'content.js' },
        },
      }
    : {
        root,
        base: './',
        publicDir: resolve(__dirname, 'extension/public'),
        plugins: [react()],
        resolve: {
          // The extension plays reminder chimes once from the service worker, not in every tab.
          alias: [{ find: /^\.\.\/\.\.\/utils\/sounds$/, replacement: resolve(root, 'pageSounds.ts') }],
        },
        build: {
          outDir,
          emptyOutDir: true,
          modulePreload: { polyfill: false },
          rollupOptions: {
            input: {
              page: resolve(root, 'page.html'),
              popup: resolve(root, 'popup.html'),
              offscreen: resolve(root, 'offscreen.html'),
              background: resolve(root, 'background.ts'),
            },
            output: { entryFileNames: chunk => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js') },
          },
        },
      },
);
