/** Runtime configuration next to the bundle (UI-PLAT-004) and the brand configuration (UI-THEME-001). */
import type { BrandConfig, RuntimeConfig } from '@2060.io/ayni-ui-core'

export const DEFAULT_CONFIG: RuntimeConfig = {
  publicUrl: typeof location !== 'undefined' ? location.origin : 'http://localhost:5173',
  singleAgent: false,
  trustPolicy: 'refuse',
  trustRecheckIntervalSeconds: 900,
  veranaIndexerUrl: 'https://idx.devnet.verana.network',
  veranaGraphUrl: 'https://graph.devnet.verana.network',
  allowedAgentOrigins: [],
  locales: ['en', 'es', 'fr', 'pt'],
  soundsEnabled: true,
  installPromptEnabled: true,
}

export const DEFAULT_BRAND: BrandConfig = {
  appName: 'Ayni',
  logo: '/brand/logo.svg',
  mark: '/brand/mark.svg',
  colors: {
    light: {
      accent: '#0F766E',
      accentContrast: '#FFFFFF',
      bg: '#FFFFFF',
      surface: '#F9FAFB',
      text: '#111827',
      muted: '#6B7280',
      border: '#E5E7EB',
    },
    dark: {
      accent: '#2DD4BF',
      accentContrast: '#042F2E',
      bg: '#0B1220',
      surface: '#111827',
      text: '#F3F4F6',
      muted: '#9CA3AF',
      border: '#1F2937',
    },
  },
  links: { support: 'https://hologram.zone' },
}

export async function loadConfig(): Promise<{ config: RuntimeConfig; brand: BrandConfig }> {
  let config = DEFAULT_CONFIG
  try {
    const response = await fetch('/config.json', { cache: 'no-cache' })
    if (response.ok) config = { ...DEFAULT_CONFIG, ...(await response.json()) }
  } catch {
    // defaults
  }
  const params = new URLSearchParams(location.search)
  if (params.get('single') === '1' && params.get('agent'))
    config = { ...config, singleAgent: true, defaultAgent: params.get('agent') ?? config.defaultAgent }
  let brand = DEFAULT_BRAND
  try {
    const response = await fetch(config.brandConfigUrl ?? '/brand/config.json', { cache: 'no-cache' })
    if (response.ok) {
      const loaded = (await response.json()) as Partial<BrandConfig>
      brand = {
        ...DEFAULT_BRAND,
        ...loaded,
        colors: {
          light: { ...DEFAULT_BRAND.colors?.light, ...loaded.colors?.light },
          dark: { ...DEFAULT_BRAND.colors?.dark, ...loaded.colors?.dark },
        },
      }
    }
  } catch {
    // defaults
  }
  return { config, brand }
}

/** Brand colours become design tokens on :root (UI-THEME-001/003). */
export function applyBrand(brand: BrandConfig): void {
  const root = document.documentElement
  const set = (prefix: string, colors: Record<string, string> | undefined) => {
    for (const [k, v] of Object.entries(colors ?? {})) root.style.setProperty(`--${prefix}${k}`, v)
  }
  set('light-', brand.colors?.light)
  set('dark-', brand.colors?.dark)
  document.title = brand.appName
}
