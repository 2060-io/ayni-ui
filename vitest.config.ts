import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** The versions Settings shows, injected as the build does (`vite.config.ts`, UI-PLAT-008). */
const versionOf = (file: string): string =>
  (JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8')) as { version: string }).version

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(versionOf('./package.json')),
    __CORE_VERSION__: JSON.stringify(versionOf('./packages/core/package.json')),
  },
  // the service worker's registration is a module of vite-plugin-pwa, which only the build runs (UI-PLAT-007)
  resolve: { alias: { 'virtual:pwa-register': fileURLToPath(new URL('./tests/pwaRegister.ts', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    clearMocks: true,
    include: ['tests/**/?(*.)+(spec|test).[tj]s?(x)', 'packages/*/tests/**/?(*.)+(spec|test).[tj]s?(x)'],
    root: './',
  },
})
