/**
 * The About page's illustrations (UI-SHELL-017, D35). Bundled under a hashed name, so the browser
 * caches them for good, and fetched once at start, so the page paints at once when the mark is pressed.
 */
import pathUrl from './about/path.svg'
import reciprocityUrl from './about/reciprocity.svg'
import sealUrl from './about/seal.svg'

export const ABOUT_ART = { seal: sealUrl, reciprocity: reciprocityUrl, path: pathUrl } as const

const held: HTMLImageElement[] = []

/** Fetches and decodes the illustrations once; the elements are kept so the images stay in the browser's cache. */
export function preloadAboutArt(urls: readonly string[] = Object.values(ABOUT_ART)): readonly HTMLImageElement[] {
  if (held.length) return held
  for (const url of urls) {
    const img = new Image()
    img.src = url
    if (typeof img.decode === 'function') void img.decode().catch(() => undefined)
    held.push(img)
  }
  return held
}
