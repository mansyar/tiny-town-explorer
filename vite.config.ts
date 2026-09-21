import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Vite configuration for Tiny Town Explorers.
 *
 * The PWA plugin owns the service worker: `registerType: 'autoUpdate'` plus
 * the default auto-injection registers the precached worker on load, which
 * is what makes the offline-first pillar work after the first visit.
 */
export default defineConfig({
  build: {
    target: 'es2022',
    // Inline nothing: GLB/texture/audio assets stay as discrete files so
    // the service worker can precache them individually.
    assetsInlineLimit: 0,
  },
  // `host: true` lets a real tablet on the LAN load the dev server for
  // touch testing without extra setup.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Tiny Town Explorers',
        short_name: 'Tiny Town',
        description: 'Offline-first 3D toy-car sandbox for ages 3-5.',
        theme_color: '#87CEEB',
        background_color: '#87CEEB',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Kenney GLBs, textures, and audio join this glob as later phases
        // land; the size cap covers a full kit model.
        globPatterns: ['**/*.{js,css,html,json,png,svg,ico,glb,gltf,bin,mp3,ogg,wav}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
});
