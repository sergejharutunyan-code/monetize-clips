import Anthropic from '@anthropic-ai/sdk'

const MODEL = process.env.CLIPFORGE_MODEL || 'claude-opus-4-8'
let client
const getClient = () => (client ??= new Anthropic()) // reads ANTHROPIC_API_KEY

const conceptPart = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string' },
    premiseShort: { type: 'string' },
    premiseBroad: { type: 'string' },
    hook: { type: 'string' },
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
    clipWindow: { type: 'string' },
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
    angle: { type: 'string' },
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

export async function analyzeVideo(video) {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
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
  if (message.stop_reason === 'refusal') throw new Error('Request was declined by safety classifiers.')
  const text = message.content.find((b) => b.type === 'text')?.text ?? '{}'
  return { ...JSON.parse(text), provider: 'claude' }
}

export { MODEL }
