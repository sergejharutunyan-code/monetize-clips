// Claude proxy for ClipForge's Discover workshop.
//
// Holds ANTHROPIC_API_KEY server-side and calls the Claude API to turn a source
// video into a two-part clip concept. The browser talks to this proxy; it never
// sees the key. Run it with:
//
//   ANTHROPIC_API_KEY=sk-ant-... node server/index.mjs
//
// Then in the app: Discover → AI engine → Claude API (proxy URL defaults to
// http://localhost:8787).

import http from 'node:http'
import Anthropic from '@anthropic-ai/sdk'

const PORT = Number(process.env.PORT || 8787)
const MODEL = process.env.CLIPFORGE_MODEL || 'claude-opus-4-8'
// Allow the Vite dev origin by default; override for your deployment.
const ALLOW_ORIGIN = process.env.CLIPFORGE_ALLOW_ORIGIN || '*'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment

// JSON Schema the model must fill. Structured outputs guarantee a parseable shape.
const conceptPart = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string' },
    premiseShort: { type: 'string', description: 'The premise in broad strokes, one line.' },
    premiseBroad: { type: 'string', description: 'The premise expanded, 2-3 sentences.' },
    hook: { type: 'string', description: 'On-screen opening line for the first 1-3 seconds.' },
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
    clipWindow: { type: 'string', description: 'Suggested source segment, e.g. "0:00-0:18".' },
  },
  required: ['label', 'premiseShort', 'premiseBroad', 'hook', 'caption', 'hashtags', 'clipWindow'],
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sourceTitle: { type: 'string' },
    sourceCreator: { type: 'string' },
    niche: { type: 'string' },
    angle: { type: 'string', description: 'Why this moment travels — the viral angle.' },
    part1: conceptPart,
    part2: conceptPart,
  },
  required: ['sourceTitle', 'sourceCreator', 'niche', 'angle', 'part1', 'part2'],
}

const SYSTEM = `You are a short-form video strategist for a clip-and-distribute operation \
(TikTok, Instagram Reels, YouTube Shorts). Given a source video, design a TWO-PART clip series:

- Part 1 ("The Hook"): opens on the highest-tension moment, sets the stakes in under ~10s, \
and HARD-CUTS on a cliffhanger so viewers must follow for the resolution. No payoff in Part 1.
- Part 2 ("The Payoff"): picks up where Part 1 cut, delivers the resolution immediately, and \
ends with a reason to follow.

For each part describe the premise two ways: "premiseShort" (broad strokes, one line) and \
"premiseBroad" (2-3 sentences). Write native, scroll-stopping hooks and captions and 5-6 \
relevant hashtags per part. Keep it responsible: assume the clip is used with rights/permission \
and credited. Return only the structured object.`

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  })
  res.end(payload)
}

async function analyze(video) {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content:
          `Source video:\n` +
          `- Title/premise: ${video.title}\n` +
          `- Creator: ${video.creator || 'unknown'}\n` +
          `- Niche: ${video.niche || 'general'}\n\n` +
          `Design the two-part clip series.`,
      },
    ],
  })

  if (message.stop_reason === 'refusal') {
    throw new Error('Request was declined by safety classifiers.')
  }
  const text = message.content.find((b) => b.type === 'text')?.text ?? '{}'
  return JSON.parse(text)
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {})

  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { ok: true, model: MODEL, keyConfigured: Boolean(process.env.ANTHROPIC_API_KEY) })
  }

  if (req.method === 'POST' && req.url === '/api/analyze') {
    if (!process.env.ANTHROPIC_API_KEY) {
      return send(res, 501, { error: 'ANTHROPIC_API_KEY is not set on the server.' })
    }
    let body = ''
    req.on('data', (c) => {
      body += c
      if (body.length > 1_000_000) req.destroy()
    })
    req.on('end', async () => {
      try {
        const video = JSON.parse(body || '{}')
        if (!video.title) return send(res, 400, { error: 'Missing "title".' })
        const concept = await analyze(video)
        send(res, 200, { ...concept, provider: 'claude' })
      } catch (err) {
        console.error(err)
        send(res, 502, { error: err instanceof Error ? err.message : 'Analysis failed.' })
      }
    })
    return
  }

  send(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`ClipForge Claude proxy on http://localhost:${PORT}`)
  console.log(`  model: ${MODEL}`)
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING'}`)
})
