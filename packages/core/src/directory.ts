/** Directory through the Verana Graph search (D20, UI-AGENTS-004): every service declaring a AyniAgUI endpoint. */
import { DID_SERVICE_TYPE } from '@ayni.org/ayni-agui-profile'

export interface DirectoryHit {
  did: string
  descriptorUrl: string
  trusted: boolean
  service: { name: string; type?: string; description?: string; logoUri?: string } | null
  operator: { kind: string; name: string; countryCode?: string } | null
}

export interface DirectoryPage {
  hits: DirectoryHit[]
  cursor: string | null
  totalCount: number
}

interface SearchHit {
  id: string
  snippet: {
    didId: string
    type: string
    serviceEndpoint: unknown
    didCard: {
      did: string
      trusted: boolean
      service: DirectoryHit['service']
      operator: DirectoryHit['operator']
    } | null
  }
}

export async function searchDirectory(
  graphUrl: string,
  options: { freeText?: string; includeUntrusted?: boolean; cursor?: string | null; limit?: number } = {},
  fetchFn: typeof fetch = fetch
): Promise<DirectoryPage> {
  const response = await fetchFn(`${graphUrl.replace(/\/+$/, '')}/v4/graph/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      surface: 'ServiceEndpoint',
      filters: { type: DID_SERVICE_TYPE },
      freeText: options.freeText?.trim() || undefined,
      includeUntrusted: options.includeUntrusted ?? false,
      limit: options.limit ?? 30,
      cursor: options.cursor ?? null,
    }),
  })
  if (!response.ok) throw new Error(`directory search failed (${response.status})`)
  const json = (await response.json()) as { hits: SearchHit[]; cursor: string | null; totalCount: number }
  const seen = new Set<string>()
  const hits: DirectoryHit[] = []
  for (const h of json.hits) {
    const did = h.snippet.didId
    if (seen.has(did)) continue
    seen.add(did)
    const endpoint = h.snippet.serviceEndpoint
    const descriptorUrl =
      typeof endpoint === 'string' ? endpoint : ((endpoint as { uri?: string } | undefined)?.uri ?? '')
    const name = h.snippet.didCard?.service?.name
    if (!name && !options.includeUntrusted) continue
    hits.push({
      did,
      descriptorUrl,
      trusted: h.snippet.didCard?.trusted === true,
      service: h.snippet.didCard?.service ?? null,
      operator: h.snippet.didCard?.operator ?? null,
    })
  }
  const filter = options.freeText?.trim().toLowerCase()
  return {
    hits: filter
      ? hits.filter(
          (h) =>
            (h.service?.name ?? h.did).toLowerCase().includes(filter) ||
            (h.operator?.name ?? '').toLowerCase().includes(filter)
        )
      : hits,
    cursor: json.cursor,
    totalCount: json.totalCount,
  }
}
