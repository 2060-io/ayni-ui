import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    clearMocks: true,
    include: ['tests/**/?(*.)+(spec|test).[tj]s?(x)', 'packages/*/tests/**/?(*.)+(spec|test).[tj]s?(x)'],
    root: './',
  },
})
