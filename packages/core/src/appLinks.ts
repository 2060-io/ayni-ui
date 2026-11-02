/**
 * App links (AG-UI profile 3.1 §10, UI-LINK-001..003, D38): HTTPS links on the network's app-link domain, which is
 * the web UI's own host. Parsing reads only the profile's parameters (`q`, a DID, a segment, `to`, `amount`, `memo`,
 * `oob`) and ignores every other one; the UI opens the matching web route in place when one exists and shows
 * "on your phone" with the destination named otherwise. Links navigate, never act.
 */

export type AppLinkDestination =
  | { path: 'home'; controller?: string }
  | { path: 'recent'; segment?: 'feed' }
  | { path: 'scan' }
  | { path: 'explore'; q?: string; create?: boolean }
  | { path: 'wallet'; segment?: 'documents' | 'history' | 'card' | 'send'; id?: string }
  | { path: 'service'; did: string }
  | { path: 'settings'; section?: 'backup' | 'devices' }
  | { path: 'connect'; oob?: string }
  | { path: 'unknown' }

/** Whether `href` is an app link of this UI's app-link domain (`origin` is the UI's own origin). */
export function isAppLink(href: string, origin: string): boolean {
  try {
    const url = new URL(href, origin)
    return url.origin === origin && (url.pathname === '/app' || url.pathname.startsWith('/app/'))
  } catch {
    return false
  }
}

/** The destination an app link names; `unknown` for a path outside §10. Stray parameters change nothing. */
export function parseAppLink(href: string, origin: string): AppLinkDestination {
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return { path: 'unknown' }
  }
  const parts = url.pathname
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p))
  if (parts[0] !== 'app') return { path: 'unknown' }
  const [, head, second, third] = parts
  const params = url.searchParams
  switch (head) {
    case 'home':
      return parts.length <= 3 ? { path: 'home', ...(second ? { controller: second } : {}) } : { path: 'unknown' }
    case 'recent':
      if (parts.length === 2) return { path: 'recent' }
      return parts.length === 3 && second === 'feed' ? { path: 'recent', segment: 'feed' } : { path: 'unknown' }
    case 'scan':
      return parts.length === 2 ? { path: 'scan' } : { path: 'unknown' }
    case 'explore': {
      if (parts.length === 3 && second === 'create') return { path: 'explore', create: true }
      if (parts.length !== 2) return { path: 'unknown' }
      const q = params.get('q')?.trim()
      return q ? { path: 'explore', q } : { path: 'explore' }
    }
    case 'wallet': {
      if (parts.length === 2) return { path: 'wallet' }
      if (parts.length === 3 && (second === 'documents' || second === 'history' || second === 'send'))
        return { path: 'wallet', segment: second }
      if (parts.length === 4 && second === 'card' && third) return { path: 'wallet', segment: 'card', id: third }
      return { path: 'unknown' }
    }
    case 'service':
      return parts.length === 3 && second?.startsWith('did:') ? { path: 'service', did: second } : { path: 'unknown' }
    case 'settings':
      if (parts.length === 2) return { path: 'settings' }
      return parts.length === 3 && (second === 'backup' || second === 'devices')
        ? { path: 'settings', section: second }
        : { path: 'unknown' }
    case 'connect': {
      if (parts.length !== 2) return { path: 'unknown' }
      const oob = params.get('oob')?.trim()
      return oob ? { path: 'connect', oob } : { path: 'connect' }
    }
    default:
      return { path: 'unknown' }
  }
}

/** The web routes of UI-LINK-001; every other destination is shown as "on your phone". */
export function hasWebRoute(destination: AppLinkDestination): boolean {
  switch (destination.path) {
    case 'home':
    case 'service':
    case 'connect':
      return true
    case 'explore':
      return !destination.create
    case 'settings':
      return destination.section !== 'backup'
    default:
      return false
  }
}

/** A stable key for the destination's label (`link.destination.<key>` in the UI's strings). */
export function destinationKey(destination: AppLinkDestination): string {
  switch (destination.path) {
    case 'recent':
      return destination.segment === 'feed' ? 'recentFeed' : 'recent'
    case 'wallet':
      return destination.segment === 'documents'
        ? 'walletDocuments'
        : destination.segment === 'history'
          ? 'walletHistory'
          : destination.segment === 'card'
            ? 'walletCard'
            : destination.segment === 'send'
              ? 'walletSend'
              : 'wallet'
    case 'explore':
      return destination.create ? 'exploreCreate' : 'explore'
    case 'settings':
      return destination.section === 'backup'
        ? 'settingsBackup'
        : destination.section === 'devices'
          ? 'settingsDevices'
          : 'settings'
    default:
      return destination.path
  }
}
