/**
 * The wording of spaces, memories and deletion (UI-CONV-028..043) and of tools (UI-CONV-045..051, UI-APPR-006) in the
 * four languages: every key in each file, no em-dash in any text the person reads, and the English wording the Ayni
 * app starts from (`SPACES_COPY` and `TOOLS_COPY` in the core).
 */
import { SPACES_COPY, TOOLS_COPY } from '@ayni.org/ayni-ui-core'
import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import es from '../src/i18n/es.json'
import fr from '../src/i18n/fr.json'
import pt from '../src/i18n/pt.json'

type Tree = { [key: string]: string | Tree }

/** Every text of a translation file by its path, the plural forms of one key read as that key. */
function texts(tree: Tree, prefix = ''): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key.replace(/_(zero|one|two|few|many|other)$/, '')}`
    if (typeof value === 'string') out.set(path, [...(out.get(path) ?? []), value])
    else for (const [k, v] of texts(value, `${path}.`)) out.set(k, [...(out.get(k) ?? []), ...v])
  }
  return out
}

const at = (tree: Tree, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree)

describe('the translation files', () => {
  const files = { en, es, fr, pt } as Record<string, Tree>

  it('hold the same keys in the four languages', () => {
    const english = [...texts(files.en).keys()].sort()
    for (const lang of ['es', 'fr', 'pt']) expect([...texts(files[lang]).keys()].sort(), lang).toEqual(english)
  })

  it('give every new section in the four languages', () => {
    for (const lang of Object.keys(files))
      for (const section of ['spaces', 'memories', 'keeps', 'admin', 'tools'])
        expect(files[lang][section], `${lang}.${section}`).toBeTruthy()
  })

  it('hold no em-dash in any text', () => {
    for (const [lang, tree] of Object.entries(files))
      for (const [path, values] of texts(tree))
        for (const v of values) expect(v.includes('—'), `${lang}.${path}`).toBe(false)
  })

  it('say in English what the core gives the app', () => {
    for (const [path, text] of Object.entries(SPACES_COPY)) expect(at(files.en, path), path).toBe(text)
  })

  it('say the words of tools as the spec writes them, and as the core gives them to the app (UI-CONV-049)', () => {
    for (const [path, text] of Object.entries(TOOLS_COPY)) expect(at(files.en, path), path).toBe(text)
    expect(TOOLS_COPY['tools.account.space']).toBe("Uses the space's account")
    expect(TOOLS_COPY['tools.effect.external']).toBe('Sends outside your organization')
    expect(TOOLS_COPY['tools.ownerRule.confirm']).toBe('Asks the person first')
    expect(TOOLS_COPY['tools.stepUp.document']).toBe(', then a passport check')
    expect(TOOLS_COPY['tools.card.untrusted']).toBe(
      'This reply read content from outside your organization: {{sources}}. Check the action before you allow it.'
    )
    // every new text is in the four languages, with what the screen puts in it
    for (const path of Object.keys(TOOLS_COPY))
      for (const lang of ['es', 'fr', 'pt']) {
        const english = at(files.en, path) as string
        const other = at(files[lang], path) as string
        expect(other, `${lang}.${path}`).toBeTruthy()
        const names = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
        expect(names(other), `${lang}.${path}`).toEqual(names(english))
      }
  })
})
