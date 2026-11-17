// End-to-end test of the studio backend against stand-ins for Claude,
// Higgsfield and Google Trends: research trends -> write a plot -> generate the
// parts with Higgsfield -> the finished videos land in clip storage.
//
// Run:  npm test   (needs ffmpeg on PATH)

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { startMockPlatforms } from './mock-platforms.mjs'
import { STYLE_PRESETS, composeHiggsfieldPrompts } from '../../shared/studio.mjs'

const dir = mkdtempSync(join(tmpdir(), 'clipforge-studio-'))
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
let mock, server, base, token, renders, plot

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function api(path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) })

before(async () => {
  mock = await startMockPlatforms()
  Object.assign(process.env, mock.env, {
    CLIPFORGE_DB: join(dir, 'studio.db'),
    CLIPFORGE_PUBLIC_URL: 'http://localhost:8787',
    CLIPFORGE_TICK_MS: '40',
    CLIPFORGE_RENDER_POLL_MS: '30',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    HIGGSFIELD_KEY_ID: 'hf-id',
    HIGGSFIELD_KEY_SECRET: 'hf-secret',
  })
  if (hasFfmpeg) {
    mock.state.hf.videoFile = join(dir, 'hf.mp4')
    const r = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=24:duration=3',
      '-f', 'lavfi', '-i', 'sine=frequency=300:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', mock.state.hf.videoFile,
    ])
    assert.equal(r.status, 0)
  }
  const { createApp } = await import('../index.mjs')
  renders = await import('../lib/renders.mjs')
  renders.startRenderWorker()
  server = await new Promise((resolve) => {
    const s = createApp().listen(0, '127.0.0.1', () => resolve(s))
  })
  base = `http://127.0.0.1:${server.address().port}`
  const reg = await post('/api/auth/register', { email: 'maker@example.com', password: 'correct horse' })
  token = reg.json.token
})

after(async () => {
  renders?.stopRenderWorker()
  await new Promise((r) => server?.close(r))
  await mock?.close()
  rmSync(dir, { recursive: true, force: true })
})

test('health reports Claude and Higgsfield', async () => {
  const { json } = await api('/health')
  assert.equal(json.anthropic, true)
  assert.equal(json.higgsfield, true)
  assert.equal(json.model, 'claude-opus-5-5')
})

test('AI routes need a signed-in account (the server key is not open to the internet)', async () => {
  const saved = token
  token = ''
  assert.equal((await post('/api/ai/trends', {})).status, 401)
  assert.equal((await post('/api/ai/plot', {})).status, 401)
  assert.equal((await post('/api/higgsfield/renders', {})).status, 401)
  token = saved
})

test('trend research: web search request, paused turn resumed, sources kept', async () => {
  const r = await post('/api/ai/trends', { niche: 'wellness', region: 'GB', count: 6 })
  assert.equal(r.status, 200, JSON.stringify(r.json))
  assert.equal(r.json.trends.length, 2)
  const [t] = r.json.trends
  assert.equal(t.title, 'Bedtime mocktails')
  assert.equal(t.source, 'ai')
  assert.deepEqual(t.angles.map((a) => a.format), ['myth', 'howto'])
  assert.equal(t.url, 'https://news.example.com/sleep')
  // A topic without its own sources gets the search results instead.
  assert.equal(r.json.trends[1].sources[0].url, 'https://news.example.com/sleep')

  const calls = mock.state.claude.calls
  assert.equal(calls.length, 2, 'pause_turn must be resumed with a second request')
  const first = calls[0]
  assert.equal(first.body.model, 'claude-opus-5-5')
  assert.equal(first.body.fallbacks, 'default')
  assert.match(first.betas, /server-side-fallback-2026-07-01/)
  assert.equal(first.body.output_config.effort, 'medium')
  assert.ok(first.body.tools.some((t) => t.type === 'web_search_20260209'))
  assert.equal(first.body.tools.find((t) => t.name === 'report_trends').strict, true)
  assert.match(first.body.messages[0].content, /Audience region: GB/)
  assert.match(first.body.messages[0].content, /wellness/)
  // The resumed request carries the paused assistant turn and adds no extra user message.
  assert.equal(calls[1].body.messages.length, 2)
  assert.equal(calls[1].body.messages[1].role, 'assistant')
})

test('plot writing: answer in prose gets one nudge, result is validated and timed', async () => {
  mock.state.claude.calls.length = 0
  const r = await post('/api/ai/plot', {
    trend: { title: 'Bedtime mocktails', summary: 'A drink before bed.', sources: [{ title: 'x', url: 'https://news.example.com/sleep' }] },
    format: 'myth',
    style: STYLE_PRESETS[1],
    seconds: 30,
    tone: 'funny',
  })
  assert.equal(r.status, 200, JSON.stringify(r.json))
  plot = r.json.plot
  assert.equal(plot.title, 'Does the bedtime mocktail work?')
  assert.equal(plot.scenes.length, 5)
  assert.equal(plot.seconds, 30)
  assert.equal(plot.scenes[4].start, 24)
  assert.deepEqual(plot.hashtags, ['#sleep', '#mocktail', '#bedtimeroutine'])
  assert.equal(plot.provider, 'claude')
  const calls = mock.state.claude.calls
  assert.equal(calls.length, 2)
  assert.equal(calls[1].body.messages.at(-1).content, 'Now call submit_plot with the result.')
  assert.match(calls[0].body.system, /tangerine-orange blob/, 'the house style goes to Claude')
  assert.match(calls[0].body.system, /No real people/)
  assert.ok(calls[0].body.tools.some((t) => t.type === 'web_search_20260209'), 'fact-check search is on by default')
})

test('plot validation: bad format or missing style is refused', async () => {
  assert.equal((await post('/api/ai/plot', { trend: { title: 'x' }, format: 'nope', style: STYLE_PRESETS[0] })).status, 400)
  assert.equal((await post('/api/ai/plot', { trend: { title: 'x' }, format: 'story', style: {} })).status, 400)
})

test('Google Trends RSS is parsed', async () => {
  const r = await api('/api/trends/google?geo=us')
  assert.equal(r.status, 200, JSON.stringify(r.json))
  const [a, b] = r.json.trends
  assert.equal(a.title, 'northern lights tonight')
  assert.equal(a.traffic, '500K+ searches')
  assert.equal(a.sources[0].url, 'https://news.example.com/aurora')
  assert.match(a.sources[0].title, /Example News/)
  assert.equal(b.title, 'daylight saving & you')
  assert.equal(b.source, 'google')
})

test('Higgsfield: each part is generated, polled, downloaded and converted', { skip: !hasFfmpeg }, async () => {
  const parts = composeHiggsfieldPrompts(plot, STYLE_PRESETS[1], { maxSeconds: 15 })
  assert.equal(parts.length, 3)
  const r = await post('/api/higgsfield/renders', {
    clipId: 'clip_42', model: 'bytedance/seedance-2.5/text-to-video', resolution: '1080p', aspectRatio: '9:16', generateAudio: true,
    parts: parts.map((p) => ({ index: p.index, prompt: p.prompt, duration: p.duration })),
  })
  assert.equal(r.status, 200, JSON.stringify(r.json))
  assert.equal(r.json.renders.length, 3)
  const ids = r.json.renders.map((x) => x.id)

  let done
  for (let i = 0; i < 200 && !done; i++) {
    await sleep(60)
    const s = await api(`/api/higgsfield/renders?ids=${ids.join(',')}`)
    if (s.json.renders.every((x) => ['completed', 'failed'].includes(x.status))) done = s.json.renders
  }
  assert.ok(done, 'renders did not finish')
  for (const x of done) {
    assert.equal(x.status, 'completed', x.error)
    assert.equal(x.clipId, 'clip_42')
    assert.equal(x.media.status, 'ready')
    assert.equal(x.media.mime, 'video/mp4')
    const file = await fetch(`${base}${x.media.url}`)
    assert.equal(file.status, 200)
  }
  const sent = mock.state.hf.submits.at(-1).body
  assert.equal(sent.aspect_ratio, '9:16')
  assert.equal(sent.resolution, '1080p')
  assert.equal(sent.generate_audio, true)
  assert.ok(Number.isInteger(sent.duration))
  assert.match(sent.prompt, /No on-screen text/)
  // Listing by video works too.
  const byClip = await api('/api/higgsfield/renders?clipId=clip_42')
  assert.equal(byClip.json.renders.length, 3)
})

test('Higgsfield: moderation rejection is explained, retry and cancel follow the rules', { skip: !hasFfmpeg }, async () => {
  const r = await post('/api/higgsfield/renders', { parts: [{ index: 0, prompt: 'NSFWTEST scene', duration: 5 }] })
  const id = r.json.renders[0].id
  let row
  for (let i = 0; i < 100; i++) {
    await sleep(40)
    row = (await api(`/api/higgsfield/renders?ids=${id}`)).json.renders[0]
    if (row.status === 'failed') break
  }
  assert.equal(row.status, 'failed')
  assert.match(row.error, /moderation/)
  assert.equal((await post(`/api/higgsfield/renders/${id}/cancel`, {})).status, 409)
  const retry = await post(`/api/higgsfield/renders/${id}/retry`, {})
  assert.equal(retry.json.render.status, 'queued')
  const cancel = await post(`/api/higgsfield/renders/${id}/cancel`, {})
  assert.equal(cancel.json.render.status, 'canceled')
})

test('Higgsfield: length limits per model and bad model paths are refused', async () => {
  const tooLong = await post('/api/higgsfield/renders', { model: 'bytedance/seedance-2.0/text-to-video', parts: [{ index: 0, prompt: 'x', duration: 20 }] })
  assert.equal(tooLong.status, 400)
  assert.match(tooLong.json.error, /4–15s/)
  const bad = await post('/api/higgsfield/renders', { model: '../../etc/passwd', parts: [{ index: 0, prompt: 'x', duration: 5 }] })
  assert.equal(bad.status, 400)
})
