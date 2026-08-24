export interface ChartResult {
  readonly url: string
  readonly alt: string
}

/**
 * Defensively parses a `render_chart` tool result. The tool's `output` is a
 * JSON string like `{"url": "...", "alt": "..."}`. Only an absolute https
 * URL whose pathname includes '/api/chart/' and ends in '.png' is accepted --
 * that route (src/app/api/chart/[chart]/route.ts) is the only legitimate
 * source for a chart image, so anything else (malformed JSON, a non-https
 * URL, a URL pointed somewhere else entirely) is treated as "no chart"
 * rather than rendered into an <img src>.
 */
export function parseChartResult(output: unknown): ChartResult | null {
  if (typeof output !== 'string') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null

  const url = (parsed as Record<string, unknown>).url
  const alt = (parsed as Record<string, unknown>).alt
  if (typeof url !== 'string') return null

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return null
  }

  if (parsedUrl.protocol !== 'https:') return null
  if (!parsedUrl.pathname.includes('/api/chart/')) return null
  if (!parsedUrl.pathname.endsWith('.png')) return null

  return {
    url,
    alt: typeof alt === 'string' && alt.trim().length > 0 ? alt : 'Chart',
  }
}
