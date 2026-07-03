import type { TwoPartConcept } from '../types'

/**
 * Calls the Claude proxy server (see /server) to generate a two-part concept.
 *
 * The proxy holds the ANTHROPIC_API_KEY server-side and calls the Claude API —
 * the browser never sees the key. If the proxy is down or misconfigured, this
 * throws and the caller falls back to the local generator.
 */
export async function analyzeClaude(
  proxyUrl: string,
  video: { title: string; creator: string; niche: string },
): Promise<TwoPartConcept> {
  const base = proxyUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(video),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Proxy responded ${res.status}: ${detail.slice(0, 200)}`)
  }

  const data = (await res.json()) as TwoPartConcept
  return { ...data, provider: 'claude' }
}
