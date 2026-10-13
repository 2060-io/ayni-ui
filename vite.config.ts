import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Installable PWA with an offline shell; no web push (UI-PLAT-001/002, D17).
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
            options: { cacheName: 'hologram-ui-config' },
          },
        ],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') },
  build: { target: 'es2022', sourcemap: true, modulePreload: { polyfill: false } },
  server: { port: 5173 },
})
