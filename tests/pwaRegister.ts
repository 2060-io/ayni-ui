/**
 * `virtual:pwa-register` exists only under vite-plugin-pwa, which the tests do not run: they resolve it here
 * (`vitest.config.ts`), and a test that registers the service worker mocks it (tests/newVersion.test.tsx).
 */
export function registerSW(): never {
  throw new Error('virtual:pwa-register is mocked by the tests that register the service worker')
}
