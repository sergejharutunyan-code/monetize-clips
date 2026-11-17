// Higgsfield API client: submit a generation to a model, poll its status.
// Auth is "Authorization: Key <key id>:<key secret>" (keys from console.higgsfield.ai).

import { call } from './http.mjs'

const BASE = () => (process.env.HIGGSFIELD_API_BASE || 'https://api.higgsfield.ai').replace(/\/+$/, '')

const credentials = () => {
  if (process.env.HIGGSFIELD_KEY) return process.env.HIGGSFIELD_KEY.trim()
  const id = process.env.HIGGSFIELD_KEY_ID?.trim()
  const secret = process.env.HIGGSFIELD_KEY_SECRET?.trim()
  return id && secret ? `${id}:${secret}` : ''
}

export const isConfigured = () => Boolean(credentials())

/** Text-to-video models known to work with the fields below. Others can be named by path. */
export const MODELS = [
  { path: 'bytedance/seedance-2.5/text-to-video', label: 'Seedance 2.5 · 4–30s · sound', minSeconds: 4, maxSeconds: 30, audio: true },
  { path: 'bytedance/seedance-2.0/text-to-video', label: 'Seedance 2.0 · 4–15s · sound', minSeconds: 4, maxSeconds: 15, audio: true },
]

export const DEFAULT_MODEL = process.env.HIGGSFIELD_MODEL || MODELS[0].path

export const validModelPath = (p) => typeof p === 'string' && /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*){1,4}$/i.test(p)

export class HiggsfieldError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message)
    this.status = status
    this.retryable = retryable
  }
}

function explain(r, what) {
  const j = r.json || {}
  const detail = j.detail || j.error || j.message
  const text = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((d) => d.msg || JSON.stringify(d)).join('; ') : r.text.slice(0, 200)
  if (r.status === 401 || r.status === 403) return new HiggsfieldError('Higgsfield rejected the API key. Check HIGGSFIELD_KEY_ID and HIGGSFIELD_KEY_SECRET.', { status: r.status })
  if (r.status === 402) return new HiggsfieldError('Your Higgsfield balance is too low for this generation. Top up at console.higgsfield.ai.', { status: r.status })
  if (r.status === 404) return new HiggsfieldError(`Higgsfield does not know that model path. ${text || ''}`.trim(), { status: r.status })
  if (r.status === 422 || r.status === 400) return new HiggsfieldError(`Higgsfield did not accept the request: ${text || 'invalid parameters'}.`, { status: r.status })
  if (r.status === 429) return new HiggsfieldError('Higgsfield is rate-limiting requests. It will be retried.', { status: r.status, retryable: true })
  return new HiggsfieldError(`${what} failed (HTTP ${r.status})${text ? `: ${text}` : ''}.`, { status: r.status, retryable: r.status >= 500 })
}

const headers = () => ({
  Authorization: `Key ${credentials()}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
})

/** Start a generation. Resolves to { requestId, cancelUrl }. */
export async function submit(modelPath, body) {
  if (!validModelPath(modelPath)) throw new HiggsfieldError('That model path does not look right (e.g. bytedance/seedance-2.5/text-to-video).')
  const r = await call(`${BASE()}/${modelPath}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  if (!r.ok) throw explain(r, 'Starting the Higgsfield generation')
  const requestId = r.json?.request_id || r.json?.id
  if (!requestId) throw new HiggsfieldError('Higgsfield did not return a request id.')
  return { requestId: String(requestId), cancelUrl: r.json?.cancel_url }
}

/** The first video URL in a status response (field names vary a little by model). */
export function videoUrlOf(j) {
  const candidates = [j?.video?.url, j?.video, j?.videos?.[0]?.url, j?.output?.video?.url, j?.output?.url, j?.result?.video?.url, j?.url]
  return candidates.find((u) => typeof u === 'string' && /^https?:\/\//.test(u))
}

/**
 * Check a generation. Resolves to
 * { status: 'queued'|'in_progress'|'completed'|'failed'|'nsfw'|'canceled', videoUrl?, error? }.
 */
export async function status(requestId) {
  const r = await call(`${BASE()}/requests/${encodeURIComponent(requestId)}/status`, { headers: headers() })
  if (!r.ok) throw explain(r, 'Checking the Higgsfield generation')
  const j = r.json || {}
  const s = String(j.status || '').toLowerCase()
  return {
    status: ['queued', 'in_progress', 'completed', 'failed', 'nsfw', 'canceled'].includes(s) ? s : 'in_progress',
    videoUrl: videoUrlOf(j),
    error: typeof j.error === 'string' ? j.error : j.error?.message,
  }
}

export async function cancel(requestId, cancelUrl) {
  const url = cancelUrl && /^https:\/\//.test(cancelUrl) ? cancelUrl : `${BASE()}/requests/${encodeURIComponent(requestId)}/cancel`
  const r = await call(url, { method: 'POST', headers: headers() })
  return r.ok
}
