/**
 * Thin Firecrawl v2 API client for the agent's web_search / read_page tools.
 * Plain fetch, no SDK. Returns model-facing strings: the tools' contract is
 * "return a compact, source-attributed digest", never raw API payloads.
 *
 * Result shapes are parsed defensively (the search response has changed
 * across Firecrawl versions); anything unrecognized degrades to a plain
 * "no results" answer instead of throwing into the tool loop.
 */
import { withToolTelemetry } from '@/lib/mcp/telemetry'

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v2'
const REQUEST_TIMEOUT_MS = 20_000
/** Per-page content cap: grounding, not archiving. */
const PAGE_CONTENT_MAX_CHARS = 6_000
const SEARCH_RESULT_MAX = 5

function apiKey(): string | undefined {
  const key = process.env.FIRECRAWL_API_KEY
  return key && key.trim() !== '' ? key : undefined
}

export function firecrawlConfigured(): boolean {
  return apiKey() !== undefined
}

async function firecrawlPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const key = apiKey()
  if (!key) throw new Error('FIRECRAWL_API_KEY is not configured')
  const response = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Firecrawl ${path} failed: HTTP ${response.status}${text ? ` -- ${text.slice(0, 200)}` : ''}`)
  }
  return response.json()
}

interface SearchHit {
  url: string
  title?: string
  description?: string
  markdown?: string
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function collectHits(value: unknown, out: SearchHit[]): void {
  if (!Array.isArray(value)) return
  for (const item of value) {
    const record = asRecord(item)
    if (!record || typeof record.url !== 'string') continue
    out.push({
      url: record.url,
      title: typeof record.title === 'string' ? record.title : undefined,
      description: typeof record.description === 'string' ? record.description : undefined,
      markdown: typeof record.markdown === 'string' ? record.markdown : undefined,
    })
  }
}

/** Runs a web search, returning a compact source-attributed digest. */
export const searchWeb = withToolTelemetry('web_search', searchWebImpl, { timeoutMs: 30_000 })

async function searchWebImpl(query: string): Promise<string> {
  const payload = await firecrawlPost('/search', {
    query,
    limit: SEARCH_RESULT_MAX,
    // Ask for page content so one search both finds and reads -- snippets
    // alone re-create the "headline says X, article says Y" trap.
    scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
  })
  const root = asRecord(payload)
  const data = root?.data
  const hits: SearchHit[] = []
  // v2 nests results per source ({data: {web: [...], news: [...]}}); older
  // shapes return a flat array ({data: [...]}). Accept both.
  const dataRecord = asRecord(data)
  if (dataRecord) {
    for (const key of ['web', 'news']) collectHits(dataRecord[key], hits)
  }
  collectHits(data, hits)

  if (hits.length === 0) return `No web results for "${query}".`

  const perHitBudget = Math.floor(PAGE_CONTENT_MAX_CHARS / Math.min(hits.length, SEARCH_RESULT_MAX))
  const sections = hits.slice(0, SEARCH_RESULT_MAX).map(hit => {
    const lines = [`SOURCE: ${hit.url}`, hit.title ? `TITLE: ${hit.title}` : undefined]
    const body = hit.markdown?.trim() || hit.description?.trim()
    if (body) lines.push(body.length > perHitBudget ? `${body.slice(0, perHitBudget)}\n[truncated]` : body)
    return lines.filter(Boolean).join('\n')
  })
  return sections.join('\n\n---\n\n')
}

/** Reads one page as markdown, capped at PAGE_CONTENT_MAX_CHARS. */
export const readPage = withToolTelemetry('read_page', readPageImpl, { timeoutMs: 30_000 })

async function readPageImpl(url: string): Promise<string> {
  const payload = await firecrawlPost('/scrape', { url, formats: ['markdown'], onlyMainContent: true })
  const root = asRecord(payload)
  const data = asRecord(root?.data)
  const markdown = typeof data?.markdown === 'string' ? data.markdown.trim() : ''
  if (!markdown) return `No readable content at ${url}.`
  const body = markdown.length > PAGE_CONTENT_MAX_CHARS ? `${markdown.slice(0, PAGE_CONTENT_MAX_CHARS)}\n[truncated]` : markdown
  return `SOURCE: ${url}\n${body}`
}
