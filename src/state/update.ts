/**
 * A new version of the UI (UI-PLAT-007). The service worker is registered in `prompt` mode: a new version installs and
 * waits, and nothing swaps it under the person. When one waits, the shell says so with Reload, which writes what the
 * message forms hold, lets the waiting worker take over and loads the page again. The worker is asked for a new
 * version when the tab comes back in front of the person and every hour while it stays open. The registration stays
 * explicit, so that no push subscription ever exists (UI-PLAT-002).
 */

import type { RegisterSWOptions } from 'virtual:pwa-register'
import { useSyncExternalStore } from 'react'

/** How often an open tab asks for a new version (UI-PLAT-007). */
export const UPDATE_CHECK_MS = 60 * 60 * 1000

type RegisterSW = (options?: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>

export class AppUpdate {
  private waiting = false
  private readonly listeners = new Set<() => void>()
  private updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null
  private registration: ServiceWorkerRegistration | undefined
  private beforeReload: () => Promise<void> = async () => undefined
  private reloaded = false
  private readonly stops: (() => void)[] = []

  public constructor(private readonly reloadPage: () => void = () => window.location.reload()) {}

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Whether a new version waits for the person's Reload. */
  public readonly isWaiting = (): boolean => this.waiting

  /** Registers the service worker; `beforeReload` writes what must survive the reload (the message forms' text). */
  public start(registerSW: RegisterSW, beforeReload: () => Promise<void>): void {
    this.beforeReload = beforeReload
    this.updateSW = registerSW({
      immediate: true,
      // a new version installed and waits: say so, and swap nothing before the person presses Reload
      onNeedRefresh: () => {
        this.waiting = true
        for (const l of this.listeners) l()
      },
      // the new version took control, after Reload in this tab or in another tab of the app: load the page again
      onNeedReload: () => void this.reloadOnce(),
      onRegisteredSW: (_url, registration) => {
        if (registration) this.watch(registration)
      },
      onRegisterError: (e) => warn('the service worker could not be registered', e),
    })
  }

  /** Reload: the forms' text written first, then the waiting worker takes over and the page loads again. */
  public async reload(): Promise<void> {
    try {
      await this.beforeReload()
    } catch (e) {
      // what the person typed could not be written: keep the page, and the banner, rather than lose it
      warn('the drafts could not be written; the page is not reloaded', e)
      return
    }
    const registration = this.registration
    const waiting = registration?.waiting
    // another tab already let the new version take over: this page only has to load again
    if (registration && !waiting) {
      this.reloadNow()
      return
    }
    // a page the old worker does not control (opened with a hard reload) sees no change of controller, so it loads
    // again once the new worker is active
    waiting?.addEventListener('statechange', () => {
      if (waiting.state === 'activated') this.reloadNow()
    })
    await this.updateSW?.(true)
  }

  /** Stops the checks (tests). */
  public stop(): void {
    for (const stop of this.stops.splice(0)) stop()
  }

  private watch(registration: ServiceWorkerRegistration): void {
    this.registration = registration
    const check = () => {
      if (navigator.onLine === false) return
      // the server unreachable or the registration gone: the next check tries again
      registration.update().catch(() => undefined)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const timer = setInterval(check, UPDATE_CHECK_MS)
    this.stops.push(() => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(timer)
    })
  }

  private async reloadOnce(): Promise<void> {
    await this.beforeReload().catch((e) => warn('the drafts could not be written', e))
    this.reloadNow()
  }

  private reloadNow(): void {
    if (this.reloaded) return
    this.reloaded = true
    this.reloadPage()
  }
}

/** The page's one. */
export const appUpdate = new AppUpdate()

/** Registers the service worker of the production build (UI-PLAT-001, UI-PLAT-002, UI-PLAT-007). */
export async function startUpdates(beforeReload: () => Promise<void>, update: AppUpdate = appUpdate): Promise<void> {
  const { registerSW } = await import('virtual:pwa-register')
  update.start(registerSW, beforeReload)
}

function warn(message: string, error: unknown): void {
  // biome-ignore lint/suspicious/noConsole: failures of the service worker the person is not shown
  console.warn(`[ayni-ui] ${message}`, error)
}

/** Whether a new version waits, for the shell. */
export function useNewVersion(update: AppUpdate = appUpdate): boolean {
  return useSyncExternalStore(update.subscribe, update.isWaiting)
}
