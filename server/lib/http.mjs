// Small helpers shared by the platform integrations.

import { open, stat } from 'node:fs/promises'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** An error whose message is safe and useful to show to the person publishing. */
export class PlatformError extends Error {
  constructor(message, { code, status } = {}) {
    super(message)
    this.name = 'PlatformError'
    this.code = code
    this.status = status
  }
}

/** fetch() that always resolves to { ok, status, json, text, headers }. */
export async function call(url, opts = {}) {
  let res
  try {
    res = await fetch(url, { ...opts, signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 60_000) })
  } catch (e) {
    throw new PlatformError(`Network error reaching ${new URL(url).host}: ${e?.cause?.code || e?.message || e}`)
  }
  const text = await res.text().catch(() => '')
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // not JSON
  }
  return { ok: res.ok, status: res.status, json, text, headers: res.headers }
}

export const fileSize = async (path) => (await stat(path)).size

/** Read one byte range of a file into a Buffer. */
export async function readRange(path, start, length) {
  const fh = await open(path, 'r')
  try {
    const buf = Buffer.allocUnsafe(length)
    let got = 0
    while (got < length) {
      const { bytesRead } = await fh.read(buf, got, length - got, start + got)
      if (!bytesRead) break
      got += bytesRead
    }
    return got === length ? buf : buf.subarray(0, got)
  } finally {
    await fh.close()
  }
}

/** Poll `fn` until it returns a value (not undefined) or the time runs out. */
export async function pollUntil(fn, { everyMs = 5000, timeoutMs = 10 * 60 * 1000, what = 'the platform' } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const v = await fn()
    if (v !== undefined) return v
    if (Date.now() + everyMs > deadline) {
      throw new PlatformError(`Timed out waiting for ${what} to finish processing the video.`)
    }
    await sleep(everyMs)
  }
}

export const clip = (s, max) => {
  const chars = Array.from(String(s ?? ''))
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('')
}
