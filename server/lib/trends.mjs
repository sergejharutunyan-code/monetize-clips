// Free trend signals the backend can fetch for the app (no API key needed).

const GOOGLE_RSS = () => process.env.GOOGLE_TRENDS_RSS || 'https://trends.google.com/trending/rss'

const decode = (s) =>
  String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim()

const tag = (xml, name) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml)
  return m ? decode(m[1]) : ''
}
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g'))].map((m) => m[1])

/** Parse Google Trends' "trending now" RSS feed into trend objects. */
export function parseGoogleTrends(xml, geo) {
  const now = new Date().toISOString()
  return tags(xml, 'item')
    .map((item, i) => {
      const title = tag(item, 'title')
      const news = tags(item, 'ht:news_item').map((n) => ({
        title: tag(n, 'ht:news_item_title'),
        url: tag(n, 'ht:news_item_url'),
        source: tag(n, 'ht:news_item_source'),
      })).filter((n) => /^https?:\/\//.test(n.url))
      const traffic = tag(item, 'ht:approx_traffic')
      return {
        id: `google_${Date.now().toString(36)}_${i}`,
        source: 'google',
        title,
        summary: news[0]?.title || `Trending search in ${geo}.`,
        whyNow: traffic ? `${traffic} searches in ${geo} in the last day.` : `Trending in ${geo} today.`,
        traffic: traffic ? `${traffic} searches` : undefined,
        thumb: tag(item, 'ht:picture') || undefined,
        sources: news.slice(0, 3).map((n) => ({ title: n.source ? `${n.title} (${n.source})` : n.title, url: n.url })),
        url: news[0]?.url,
        freshness: 'today',
        fetchedAt: now,
      }
    })
    .filter((t) => t.title)
}

export async function googleTrends(geo = 'US') {
  const g = String(geo || 'US').toUpperCase().replace(/[^A-Z-]/g, '').slice(0, 5) || 'US'
  let res
  try {
    res = await fetch(`${GOOGLE_RSS()}?geo=${g}`, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'ClipForge/1.0' } })
  } catch (e) {
    throw Object.assign(new Error(`Could not reach Google Trends: ${e?.cause?.code || e.message}`), { status: 502 })
  }
  if (!res.ok) throw Object.assign(new Error(`Google Trends answered ${res.status}.`), { status: 502 })
  return parseGoogleTrends(await res.text(), g)
}
