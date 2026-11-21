import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** The version a package file declares: Settings shows the UI's and the core's (UI-PLAT-008). */
const versionOf = (file: string): string =>
  (JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8')) as { version: string }).version

// Installable PWA with an offline shell; no web push (UI-PLAT-001/002, D17); a new version waits (UI-PLAT-007).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/config\.json$/, /^\/brand\//],
        runtimeCaching: [
          {
            urlPattern: /\/(config\.json|brand\/.*)$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'ayni-ui-config' },
          },
        ],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(versionOf('./package.json')),
    __CORE_VERSION__: JSON.stringify(versionOf('./packages/core/package.json')),
  },
  build: { target: 'es2022', sourcemap: true, modulePreload: { polyfill: false } },
  server: { port: 5173 },
})
