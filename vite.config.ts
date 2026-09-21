import { defineConfig } from 'vite';

/**
 * Vite configuration for Tiny Town Explorers. The PWA plugin is wired up
 * in the following scaffold task; this file deliberately starts minimal.
 */
export default defineConfig({
  build: {
    target: 'es2022',
    // Inline nothing: GLB/texture assets stay as discrete files so the
    // service worker can precache them individually.
    assetsInlineLimit: 0,
  },
  // `host: true` lets a real tablet on the LAN load the dev server for
  // touch testing without extra setup.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
