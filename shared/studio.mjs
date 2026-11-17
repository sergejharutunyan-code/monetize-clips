// The studio core, shared by the web app and the backend (plain ES module, no
// dependencies): video formats, house styles, the requests that ask Claude to
// research trends and write plot packages, validation of what comes back, an
// offline writer, and the composer that turns a plot into Higgsfield prompts.

export const CLAUDE_MODEL = 'claude-opus-5-5'

/** Spoken narration pace used to size scripts (words per second). */
export const WORDS_PER_SECOND = 2.5

// ---------------------------------------------------------------- formats

export const FORMATS = [
  {
    id: 'story',
    label: 'Story time',
    blurb: 'A narrator tells a short, relatable story about an original character: setup, it goes sideways, twist, punchline.',
    beats: ['Hook: open on the moment it goes wrong', 'Setup: who, where, what they wanted', 'Escalation: it gets worse, twice', 'Twist: the turn nobody saw coming', 'Punchline, ideally a callback to the hook'],
  },
  {
    id: 'howto',
    label: 'How-to',
    blurb: 'The host shows how to do something in three clear steps, starting from the problem or the satisfying result.',
    beats: ['Hook: the problem, or the end result first', 'Step 1', 'Step 2', 'Step 3', 'Result plus one pro tip'],
  },
  {
    id: 'explainer',
    label: 'Explain it simply',
    blurb: 'Why or how something in the news works, made obvious with one visual comparison.',
    beats: ['Hook: the surprising question', 'The everyday comparison', 'How it actually works', 'Why it matters right now', 'One-line takeaway'],
  },
  {
    id: 'myth',
    label: 'Myth vs fact',
    blurb: 'A common belief, acted out, then busted with the real fact and why people got it wrong.',
    beats: ['Hook: state the myth like it is true', 'Act out the myth', 'Record-scratch: the real fact', 'Why people believe it', 'What to do instead'],
  },
  {
    id: 'whatif',
    label: 'What if…',
    blurb: 'A playful hypothetical about the trend, played out step by step to an absurd but logical end.',
    beats: ['Hook: the what-if question', 'The first thing that happens', 'The chain reaction', 'The absurd peak', 'The grounded real-world answer'],
  },
  {
    id: 'top3',
    label: 'Top 3',
    blurb: 'Three quick, surprising items about the trend, counting down to the best one.',
    beats: ['Hook: promise the payoff', 'Number 3', 'Number 2', 'Number 1 (the best)', 'Quick wrap-up and a question for comments'],
  },
]

export const FORMAT_IDS = FORMATS.map((f) => f.id)

export const TONES = ['funny', 'wholesome', 'deadpan', 'dramatic', 'curious']

export const formatById = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0]

// ---------------------------------------------------------------- house styles
// No studio, artist or franchise names on purpose: the look is described in
// plain visual terms, so it is the channel's own and safe to prompt with.

export const STYLE_PRESETS = [
  {
    id: 'doodle',
    name: 'Doodle Notebook',
    look: 'hand-drawn black ink doodle animation on warm cream notebook paper with faint blue ruled lines, wobbly hand-drawn outlines that gently boil, flat marker-color fills',
    palette: 'black ink, tomato red, sunny yellow and sky blue on cream paper',
    motion: 'snappy, slightly jittery hand-drawn motion at 12 frames per second with simple squash and stretch',
    character: 'Pip, a round-headed doodle person with dot eyes, one curly cowlick, a red striped scarf and noodle arms',
    voice: 'warm, quick, conspiratorial storyteller',
    music: 'plucky ukulele with finger snaps',
    caption: { font: 'marker', fill: '#1b1b1b', stroke: '#fffdf5', box: 'paper', accent: '#e2483d', uppercase: false },
    builtIn: true,
  },
  {
    id: 'flat',
    name: 'Bold Flat',
    look: '2D flat vector cartoon with thick uniform dark-navy outlines, bold saturated colors, simple geometric shapes and clean uncluttered backgrounds',
    palette: 'tangerine orange, teal, sunflower yellow and navy',
    motion: 'bouncy squash-and-stretch animation with snappy timing and smear frames on fast moves',
    character: 'Mo, a chunky tangerine-orange blob with stubby arms, huge expressive eyebrows and tiny white sneakers',
    voice: 'energetic, punchy host with comic timing',
    music: 'upbeat bass and bongo groove',
    caption: { font: 'block', fill: '#ffffff', stroke: '#14213d', box: 'none', accent: '#ffb703', uppercase: true },
    builtIn: true,
  },
  {
    id: 'paper',
    name: 'Paper Cutout',
    look: 'layered construction-paper cutout animation with visible paper fibers, torn edges and soft drop shadows between layers, like a handmade diorama',
    palette: 'mustard, brick red, sage green and kraft brown',
    motion: 'stop-motion jitter at 12 frames per second, pieces slide, flip and pop into place',
    character: 'Tess, a paper-cutout fox with a mustard cardigan and round black glasses',
    voice: 'calm, dry, deadpan narrator',
    music: 'lo-fi xylophone and soft claps',
    caption: { font: 'rounded', fill: '#2b2118', stroke: '#f3e9d2', box: 'pill', accent: '#c8553d', uppercase: false },
    builtIn: true,
  },
  {
    id: 'clay',
    name: 'Clay Miniature',
    look: 'claymation-style miniature world made of plasticine with visible fingerprints, warm soft key light and shallow depth of field',
    palette: 'warm pastels with coral, mint and butter yellow',
    motion: 'charming stop-motion with a slight frame stutter',
    character: 'Bo, a small round clay robot with a dented antenna and one oversized blinking eye',
    voice: 'gentle, wonder-filled narrator',
    music: 'music-box melody with light percussion',
    caption: { font: 'rounded', fill: '#ffffff', stroke: '#3a2e39', box: 'pill', accent: '#ff7f6e', uppercase: false },
    builtIn: true,
  },
  {
    id: 'chalk',
    name: 'Chalkboard Lab',
    look: 'white and pastel chalk drawings on a dark green chalkboard with chalk dust, lines that draw themselves on',
    palette: 'chalk white, pastel pink, pastel blue and lemon on deep green',
    motion: 'draw-on reveals, erase wipes and quick chalk-line transitions',
    character: 'Professor Dot, a tiny chalk-drawn owl in a lab coat with oversized round spectacles',
    voice: 'friendly teacher with a dramatic streak',
    music: 'light pizzicato strings',
    caption: { font: 'marker', fill: '#ffffff', stroke: '#1f3d2b', box: 'none', accent: '#ffd166', uppercase: false },
    builtIn: true,
  },
]

// ---------------------------------------------------------------- sizing

/** Narration words and scene count that fit a target length. */
export function durationPlan(seconds) {
  const sec = clampInt(seconds, 15, 90, 45)
  return {
    seconds: sec,
    words: Math.round(sec * WORDS_PER_SECOND),
    scenes: sec <= 30 ? 5 : sec <= 45 ? 7 : 9,
  }
}

// ---------------------------------------------------------------- helpers

function clampInt(n, lo, hi, fallback) {
  const v = Math.round(Number(n))
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback
}

const str = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

const words = (s) => (String(s || '').trim().match(/\S+/g) || []).length

const today = () => new Date().toISOString().slice(0, 10)

/** Ensure text ends like a sentence so joined prompt parts read cleanly. */
const sentence = (t) => {
  const v = String(t || '').trim()
  return !v || /[.!?…"')]$/.test(v) ? v : `${v}.`
}

/** Find the input of the first call to `toolName` in a Messages API response. */
export function toolInput(message, toolName) {
  for (const block of message?.content || []) {
    if (block.type === 'tool_use' && block.name === toolName) return block.input
  }
  return null
}

/** Web-search citations collected from a response (for showing sources). */
export function searchSources(message) {
  const out = []
  const seen = new Set()
  for (const block of message?.content || []) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue
    for (const r of block.content) {
      if (r?.url && !seen.has(r.url)) {
        seen.add(r.url)
        out.push({ title: str(r.title, 200) || r.url, url: r.url })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------- trend research

const SOURCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { title: { type: 'string' }, url: { type: 'string' } },
  required: ['title', 'url'],
}

export const TREND_TOOL = {
  name: 'report_trends',
  description: 'Report the researched trending topics. Call this exactly once, after researching, with every topic you found.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      trends: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', description: 'Short topic name, max 8 words.' },
            summary: { type: 'string', description: 'What it is, in one or two plain sentences.' },
            why_now: { type: 'string', description: 'Why it is trending this week, with the concrete event or number.' },
            niche: { type: 'string' },
            freshness: { type: 'string', enum: ['today', 'this_week', 'this_month', 'evergreen'] },
            angles: {
              type: 'array',
              description: 'Two or three original video ideas for this topic.',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  format: { type: 'string', enum: FORMAT_IDS },
                  idea: { type: 'string', description: 'One sentence describing an original video.' },
                },
                required: ['format', 'idea'],
              },
            },
            sources: { type: 'array', items: SOURCE_SCHEMA },
            caution: { type: 'string', description: 'Anything to be careful about, or an empty string.' },
          },
          required: ['title', 'summary', 'why_now', 'niche', 'freshness', 'angles', 'sources', 'caution'],
        },
      },
    },
    required: ['trends'],
  },
}

const TREND_SYSTEM = `You research trends for a channel that makes original 30 to 60 second animated shorts for TikTok, Instagram Reels and YouTube Shorts: animated stories, how-tos, explainers and myth-busters with a narrator and on-screen text.

Use web search to find what people are actually talking about, searching for and asking about right now. Favor topics with evidence from the last seven days (news, search interest, viral discussions) and cite where you found them.

Pick topics an original cartoon can cover well without real footage: a question people are asking, a habit or hack people are trying, a new thing people want explained, a relatable situation everyone is joking about.

Leave out topics built on tragedy, crime, disasters or real victims; elections and partisan politics; medical, legal or money advice that could hurt someone if simplified; and anything centered on a private person. Public figures can be context for a topic, but never suggest a video that is about or mocks a real person. Never suggest retelling a specific person's post, story or video: every angle must be an original idea.

When you have the topics, call report_trends once with all of them.`

/**
 * Messages API parameters for trend research. Works with the SDK's
 * beta.messages.create (fallbacks need the beta endpoint).
 */
export function buildTrendRequest({ niche = '', region = 'US', count = 8, focus = '', model = CLAUDE_MODEL } = {}) {
  const n = clampInt(count, 3, 12, 8)
  const lines = [
    `Today is ${today()}. Find ${n} trending topics for our channel.`,
    `Audience region: ${str(region, 40) || 'US'}.`,
    niche ? `Niche to focus on: ${str(niche, 120)}.` : 'Any niche is fine; mix a few different ones.',
    focus ? `Extra direction: ${str(focus, 400)}` : '',
    `Formats we make: ${FORMATS.map((f) => `${f.id} (${f.label})`).join(', ')}.`,
  ]
  return {
    model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: TREND_SYSTEM,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }, TREND_TOOL],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: lines.filter(Boolean).join('\n') }],
  }
}

let trendSeq = 0
const trendId = (prefix) => `${prefix}_${Date.now().toString(36)}_${(trendSeq++).toString(36)}`

/** Validate and normalize what report_trends returned. */
export function normalizeTrends(input, extraSources = []) {
  const list = Array.isArray(input?.trends) ? input.trends : []
  const now = new Date().toISOString()
  return list
    .filter((t) => t && str(t.title))
    .slice(0, 12)
    .map((t) => {
      const sources = (Array.isArray(t.sources) ? t.sources : [])
        .filter((s) => s && /^https?:\/\//.test(s.url || ''))
        .map((s) => ({ title: str(s.title, 200) || s.url, url: s.url }))
      return {
        id: trendId('ai'),
        source: 'ai',
        title: str(t.title, 120),
        summary: str(t.summary, 600),
        whyNow: str(t.why_now, 600),
        niche: str(t.niche, 60),
        freshness: ['today', 'this_week', 'this_month', 'evergreen'].includes(t.freshness) ? t.freshness : 'this_week',
        angles: (Array.isArray(t.angles) ? t.angles : [])
          .filter((a) => a && FORMAT_IDS.includes(a.format) && str(a.idea))
          .map((a) => ({ format: a.format, idea: str(a.idea, 300) })),
        sources: sources.length ? sources : extraSources.slice(0, 3),
        url: sources[0]?.url,
        caution: str(t.caution, 300) || undefined,
        fetchedAt: now,
      }
    })
}

// ---------------------------------------------------------------- plot packages

export const PLOT_TOOL = {
  name: 'submit_plot',
  description: 'Submit the finished plot package. Call this exactly once.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', description: 'Video title, max 60 characters, no clickbait lies.' },
      hook: { type: 'string', description: 'The first spoken line: it must create curiosity within 2 seconds.' },
      logline: { type: 'string', description: 'The whole video in one sentence.' },
      beats: { type: 'array', items: { type: 'string' } },
      characters: {
        type: 'array',
        description: 'Every character that appears, the host included, with a precise visual description to repeat in every prompt.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { name: { type: 'string' }, look: { type: 'string' } },
          required: ['name', 'look'],
        },
      },
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            duration_sec: { type: 'integer' },
            visual: { type: 'string', description: 'What happens on screen: subject, one main action, setting. No style words, no text in frame.' },
            camera: { type: 'string', description: 'Shot size and camera move, e.g. "close-up, slow push in".' },
            narration: { type: 'string', description: 'The narrator lines spoken during this scene.' },
            on_screen_text: { type: 'string', description: 'Caption added in editing, max 6 words, adds to the narration rather than repeating it.' },
            sfx: { type: 'string', description: 'Sound effects for this scene.' },
          },
          required: ['duration_sec', 'visual', 'camera', 'narration', 'on_screen_text', 'sfx'],
        },
      },
      caption: { type: 'string', description: 'Post caption, 1 to 3 short sentences ending with a question or call to follow.' },
      hashtags: { type: 'array', items: { type: 'string' } },
      fact_notes: { type: 'string', description: 'Facts the video states and how sure you are, or an empty string.' },
    },
    required: ['title', 'hook', 'logline', 'beats', 'characters', 'scenes', 'caption', 'hashtags', 'fact_notes'],
  },
}

function plotSystem(style) {
  return `You write plot packages for original animated shorts made with an AI video generator (Higgsfield) and published on TikTok, Instagram Reels and YouTube Shorts. Each package becomes video prompts, a narration script and on-screen captions.

The channel's look is fixed and added to every prompt automatically, so scene visuals describe only what happens and the camera:
- Look: ${style.look}
- Palette: ${style.palette}
- Motion: ${style.motion}
- Host character: ${style.character}
- Narrator voice: ${style.voice}

What makes these videos work:
- The first spoken line and first image create a question the viewer needs answered, within 2 seconds.
- Every scene changes something: a new action, reveal or escalation. One clear action per scene, simple readable staging, expressive characters.
- Narration is spoken English: short sentences, contractions, rhythm, a payoff at the end. It carries the story; visuals act it out.
- On-screen text is a punchy caption (max 6 words) that adds a beat, a number or a joke rather than repeating the narration.

Rules that are never broken:
- Characters are original. The host appears in most scenes. Give every character a fixed visual description and keep it identical across scenes.
- No real people (names or likenesses), no brands, logos or trademarks, no copyrighted or franchise characters, and no "in the style of" any studio, show or artist.
- Stories are fictional, built from common experiences, never a retelling of a specific person's post or video.
- Scene visuals never ask for words, letters, signs, screens with text, logos or watermarks: captions are added in editing.
- Facts are accurate. How-to steps are safe and correct. If a claim is uncertain, say less rather than guess, and note it in fact_notes.

When the package is ready, call submit_plot once.`
}

/**
 * Messages API parameters for writing a plot package.
 * @param {{trend: {title: string, summary?: string, whyNow?: string, url?: string, sources?: {title:string,url:string}[]}, angle?: string, format: string, style: object, seconds: number, tone?: string, factCheck?: boolean, model?: string}} p
 */
export function buildPlotRequest({ trend, angle = '', format, style, seconds, tone = 'funny', factCheck = true, model = CLAUDE_MODEL }) {
  const plan = durationPlan(seconds)
  const f = formatById(format)
  const src = (trend.sources || []).slice(0, 4).map((s) => `- ${s.title}: ${s.url}`).join('\n')
  const lines = [
    `Topic: ${str(trend.title, 200)}`,
    trend.summary ? `What it is: ${str(trend.summary, 800)}` : '',
    trend.whyNow ? `Why it is trending: ${str(trend.whyNow, 800)}` : '',
    src ? `Sources:\n${src}` : '',
    angle ? `Angle to develop: ${str(angle, 400)}` : '',
    '',
    `Format: ${f.label}: ${f.blurb}`,
    `Beat shape: ${f.beats.join(' → ')}`,
    `Tone: ${str(tone, 40) || 'funny'}.`,
    `Length: exactly ${plan.seconds} seconds, in ${plan.scenes} scenes of 4 to 10 seconds whose durations add up to ${plan.seconds}.`,
    `Narration: about ${plan.words} words in total (${WORDS_PER_SECOND} words per second), split across the scenes so each scene's lines fit its duration.`,
    'Hashtags: 4 to 6, specific to the topic, no generic ones like #fyp or #viral.',
    factCheck ? 'Check the facts you state with web search before writing.' : '',
  ]
  const tools = [PLOT_TOOL]
  if (factCheck) tools.unshift({ type: 'web_search_20260209', name: 'web_search', max_uses: 4 })
  return {
    model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: plotSystem(style),
    tools,
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n') }],
  }
}

/** The follow-up turn when Claude answered without calling the report tool. */
export const nudgeFor = (toolName) => ({
  role: 'user',
  content: `Now call ${toolName} with the result.`,
})

/**
 * Validate a plot package and fill in timing. Scene durations are rescaled to
 * add up to the target length.
 */
export function normalizePlot(input, ctx) {
  const plan = durationPlan(ctx.seconds)
  const rawScenes = (Array.isArray(input?.scenes) ? input.scenes : []).filter((s) => s && (str(s.visual) || str(s.narration)))
  if (!rawScenes.length) throw new Error('The plot came back without any scenes.')
  const durations = rawScenes.map((s) => Math.max(2, Number(s.duration_sec) || plan.seconds / rawScenes.length))
  const sum = durations.reduce((a, b) => a + b, 0)
  const scale = plan.seconds / sum
  let t = 0
  const scenes = rawScenes.slice(0, 14).map((s, i) => {
    const d = Math.max(2, Math.round(durations[i] * scale * 10) / 10)
    const scene = {
      n: i + 1,
      start: Math.round(t * 10) / 10,
      duration: d,
      visual: str(s.visual, 1200),
      camera: str(s.camera, 200),
      narration: str(s.narration, 1200),
      onScreenText: str(s.on_screen_text, 80),
      sfx: str(s.sfx, 300),
    }
    t += d
    return scene
  })
  const characters = (Array.isArray(input?.characters) ? input.characters : [])
    .filter((c) => c && str(c.name) && str(c.look))
    .slice(0, 6)
    .map((c) => ({ name: str(c.name, 60), look: str(c.look, 400) }))
  const narration = scenes.map((s) => s.narration).filter(Boolean).join(' ')
  return {
    title: str(input?.title, 100) || str(ctx.trend?.title, 100) || 'Untitled short',
    hook: str(input?.hook, 300) || scenes[0].narration,
    logline: str(input?.logline, 400),
    format: formatById(ctx.format).id,
    tone: str(ctx.tone, 40) || 'funny',
    seconds: Math.round(t),
    beats: (Array.isArray(input?.beats) ? input.beats : []).map((b) => str(b, 300)).filter(Boolean).slice(0, 10),
    characters,
    scenes,
    narration,
    narrationWords: words(narration),
    caption: str(input?.caption, 2000),
    hashtags: (Array.isArray(input?.hashtags) ? input.hashtags : [])
      .map((h) => `#${str(h, 40).replace(/^#+/, '').replace(/\s+/g, '')}`)
      .filter((h) => h.length > 1)
      .slice(0, 8),
    factNotes: str(input?.fact_notes, 1500),
    provider: ctx.provider || 'claude',
    createdAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------- Higgsfield prompts

const characterLine = (plot, style) => {
  const list = plot.characters?.length ? plot.characters : [{ name: 'Host', look: style.character }]
  return list.map((c) => `${c.name}: ${c.look}`).join('; ')
}

/**
 * Group scenes into generations no longer than `maxSeconds` each and write one
 * Higgsfield prompt per generation. Each prompt repeats the full style and
 * character description so separate generations match.
 *
 * @param {object} plot      a normalized plot
 * @param {object} style     a style preset
 * @param {{maxSeconds?: number, narration?: 'voiceover'|'model', aspect?: string}} opts
 *   narration 'voiceover': the video gets sound effects and music only and the
 *   narration is recorded over it; 'model': the narrator lines go in the prompt.
 */
export function composeHiggsfieldPrompts(plot, style, { maxSeconds = 10, narration = 'voiceover', aspect = '9:16' } = {}) {
  const cap = clampInt(maxSeconds, 3, 60, 10)
  const groups = []
  let cur = []
  let len = 0
  for (const s of plot.scenes) {
    if (cur.length && len + s.duration > cap + 0.25) {
      groups.push(cur)
      cur = []
      len = 0
    }
    cur.push(s)
    len += s.duration
  }
  if (cur.length) groups.push(cur)

  const orientation = aspect === '16:9' ? 'Horizontal 16:9 frame.' : aspect === '1:1' ? 'Square 1:1 frame.' : 'Vertical 9:16 frame, subject centered with headroom.'
  return groups.map((scenes, i) => {
    const total = scenes.reduce((a, s) => a + s.duration, 0)
    const duration = Math.min(cap, Math.max(3, Math.ceil(total)))
    let t = 0
    const shots = scenes.map((s, k) => {
      const from = Math.round(t)
      t += s.duration
      const label = scenes.length > 1 ? `Shot ${k + 1} (${from}-${Math.round(t)}s): ` : ''
      return `${label}${sentence(s.visual)}${s.camera ? ` Camera: ${sentence(s.camera)}` : ''}`
    })
    const sfx = scenes.map((s) => s.sfx).filter(Boolean).join('; ')
    const lines = scenes.map((s) => s.narration).filter(Boolean).join(' ')
    const audio =
      narration === 'model' && lines
        ? `Audio: narrator voice-over (${style.voice}) says: "${lines}" Sound effects: ${sfx || 'light cartoon foley'}. Quiet background music: ${style.music}.`
        : `Audio: cartoon sound effects (${sfx || 'light foley'}) and quiet background music (${style.music}). No voices, no speech.`
    const prompt = [
      `Animated short, ${style.look}. Palette: ${style.palette}. Motion: ${style.motion}. ${orientation}`,
      `Characters (keep exactly as described): ${characterLine(plot, style)}.`,
      shots.join(' '),
      audio,
      'No on-screen text, captions, letters, numbers, logos or watermarks.',
    ].join('\n')
    return {
      index: i,
      scenes: scenes.map((s) => s.n),
      start: scenes[0].start,
      seconds: Math.round(total * 10) / 10,
      duration,
      prompt,
    }
  })
}

/** A prompt for a character reference image (for image or reference-to-video models). */
export function characterSheetPrompt(plot, style) {
  return [
    `Character reference sheet, ${style.look}. Palette: ${style.palette}.`,
    `${characterLine(plot, style)}.`,
    'Each character shown front, three-quarter and side view with three expressions (happy, surprised, worried), evenly spaced on a plain light background.',
    'No text, labels, letters or logos.',
  ].join('\n')
}

/** Plain-text export of a whole package (for notes, docs or another tool). */
export function plotToText(plot, style, parts) {
  const out = [
    `# ${plot.title}`,
    '',
    `Format: ${formatById(plot.format).label} · ${plot.seconds}s · ${style.name} · tone: ${plot.tone}`,
    plot.logline ? `Logline: ${plot.logline}` : '',
    `Hook: ${plot.hook}`,
    '',
    '## Scenes',
    ...plot.scenes.map(
      (s) =>
        `${s.n}. [${s.start}-${Math.round((s.start + s.duration) * 10) / 10}s] ${s.visual}${s.camera ? ` (${s.camera})` : ''}\n   Narration: ${s.narration}\n   On screen: ${s.onScreenText}${s.sfx ? `\n   SFX: ${s.sfx}` : ''}`,
    ),
    '',
    '## Narration script',
    plot.narration,
    '',
    '## Higgsfield prompts',
    ...parts.map((p) => `### Generation ${p.index + 1} (${p.duration}s, scenes ${p.scenes.join(', ')})\n${p.prompt}`),
    '',
    '## Character reference',
    characterSheetPrompt(plot, style),
    '',
    '## Post',
    plot.caption,
    plot.hashtags.join(' '),
    plot.factNotes ? `\n## Fact notes\n${plot.factNotes}` : '',
  ]
  return out.filter((l) => l !== '').join('\n').replace(/\n(#+ )/g, '\n\n$1')
}

// ---------------------------------------------------------------- offline writer
// A template writer so the studio works with no AI connected. It is generic by
// design; connect Claude for scripts written for the actual topic.

const pick = (arr, seed) => arr[Math.abs(seed) % arr.length]
const hash = (s) => Array.from(String(s)).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)

export function localPlot({ trend, format, style, seconds, tone = 'funny' }) {
  const plan = durationPlan(seconds)
  const topic = str(trend.title, 120) || 'this'
  const host = (style.character.split(',')[0] || 'The host').trim()
  const h = hash(topic + format)
  const f = formatById(format)

  const scriptByFormat = {
    story: [
      [`${host} thought ${topic} would be easy. It was not.`, `${host} freezes mid-step as everything around them goes wrong at once`, 'IT WAS NOT EASY'],
      [`It started like any normal morning.`, `${host} strolls into a cozy kitchen, humming, coffee in hand`, 'a normal morning…'],
      [`Then someone mentioned ${topic}.`, `a friend leans in and whispers; ${host}'s eyes go huge`, 'uh oh'],
      [`So ${host} tried it. Immediately.`, `${host} rolls up their sleeves and dives in with total confidence`, 'zero planning'],
      [`Step one went fine. Step two did not.`, `a small mishap snowballs into a comic chain reaction`, 'step two…'],
      [`By lunch, the whole street was involved.`, `neighbors peek over fences as the chaos spreads`, 'the whole street'],
      [`And that's when it actually worked.`, `everything clicks into place by accident; ${host} stares in disbelief`, 'wait, WHAT'],
      [`Turns out the trick was doing less.`, `${host} sits down calmly as things fix themselves`, 'do less'],
      [`Would you have tried it? Be honest.`, `${host} turns to camera with a guilty shrug`, 'be honest 👀'],
    ],
    howto: [
      [`You're doing ${topic} the hard way.`, `${host} watches someone struggle comically, then shakes their head`, 'the hard way'],
      [`Here's the version that actually works.`, `${host} snaps fingers and the scene resets to a clean workspace`, '3 steps'],
      [`Step one: start small.`, `${host} sets up the first simple piece, carefully`, 'step 1'],
      [`Step two: do it in order. Don't skip.`, `${host} lines things up neatly, wagging a finger at a shortcut`, 'step 2'],
      [`Step three: check your work.`, `${host} inspects the result with a magnifying glass`, 'step 3'],
      [`And that's it. Look at that.`, `the finished result glows; ${host} beams proudly`, 'done ✨'],
      [`Pro tip: the second time is twice as fast.`, `${host} repeats it at double speed, smug`, 'pro tip'],
      [`Save this for later.`, `${host} tucks a notebook into a pocket and winks`, 'save it'],
      [`What should I explain next?`, `${host} points at the viewer with a curious look`, 'next?'],
    ],
    explainer: [
      [`Everyone's talking about ${topic}. Here's what's actually going on.`, `${host} stands in front of a swirl of chatter bubbles (no words in them)`, "what's going on"],
      [`Think of it like a crowded kitchen.`, `the scene morphs into a busy kitchen with cooks bumping into each other`, 'like a kitchen'],
      [`Each cook is one piece of the puzzle.`, `${host} points to each cook in turn as they light up`, 'one piece each'],
      [`When they work together, things move fast.`, `the cooks fall into rhythm and dishes fly out`, 'teamwork'],
      [`When they don't, everything jams.`, `a pile-up at the door; ${host} facepalms`, 'jammed'],
      [`That's basically why it's in the news right now.`, `${host} zooms out to show the whole picture`, 'why now'],
      [`So next time you hear about ${topic}…`, `${host} cups an ear dramatically`, 'next time…'],
      [`…you'll know what's really happening.`, `a lightbulb pops above ${host}'s head`, 'now you know'],
      [`Follow for more things made simple.`, `${host} waves goodbye`, 'follow'],
    ],
    myth: [
      [`Everyone believes this about ${topic}.`, `${host} nods along with a crowd, totally convinced`, 'everyone believes…'],
      [`So ${host} tried it the "right" way.`, `${host} follows the myth step by step, very seriously`, 'the "right" way'],
      [`It did not go as planned.`, `the attempt fizzles in a comic puff of smoke`, 'nope'],
      [`Here's the real story.`, `record-scratch freeze; ${host} turns to camera`, 'the real story'],
      [`The truth is simpler than the myth.`, `${host} draws a simple, clear diagram with gestures`, 'simpler'],
      [`People believe it because it sounds right.`, `a whisper spreads from person to person`, 'sounds right'],
      [`Here's what to do instead.`, `${host} demonstrates the better way confidently`, 'do this'],
      [`Which myth should I bust next?`, `${host} holds up a giant question mark shape`, 'next myth?'],
      [`Tell me in the comments.`, `${host} points down, grinning`, 'comments 👇'],
    ],
    whatif: [
      [`What if ${topic} happened everywhere at once?`, `${host} looks up as the sky fills with the idea`, 'what if…'],
      [`At first, nobody would notice.`, `a quiet street, one tiny change`, 'at first…'],
      [`Then things would get weird.`, `small changes multiply around ${host}`, 'getting weird'],
      [`By day three, everyone's adapting.`, `people improvise silly workarounds`, 'day 3'],
      [`By day ten? Total chaos.`, `a comic montage of chaos peaking`, 'day 10'],
      [`But here's the real answer.`, `everything freezes; ${host} steps forward`, 'real answer'],
      [`In reality, it balances out.`, `the scene calmly settles back to normal`, 'it balances'],
      [`Science is wilder than fiction.`, `${host} winks as stars twinkle`, 'wild'],
      [`What should I imagine next?`, `${host} points to the viewer`, 'next?'],
    ],
    top3: [
      [`Three things about ${topic} you didn't know. Number one is wild.`, `${host} holds up three fingers excitedly`, '3 things'],
      [`Number three.`, `a big bold 3-shaped prop drops in (no written text), ${host} jumps`, '#3'],
      [`It's older than you'd think.`, `${host} flips through a dusty old book`, 'older than you think'],
      [`Number two.`, `a 2-shaped balloon floats in`, '#2'],
      [`It changes how people plan their day.`, `${host} rearranges a calendar wall with gusto`, 'changes plans'],
      [`And number one.`, `drumroll; spotlight on ${host}`, '#1'],
      [`It's the reason it's everywhere right now.`, `confetti burst as ${host} gasps`, 'everywhere'],
      [`Which one surprised you?`, `${host} looks at the viewer, eyebrows raised`, 'which one?'],
      [`Follow for part two.`, `${host} waves`, 'part 2'],
    ],
  }
  const rows = (scriptByFormat[f.id] || scriptByFormat.story).slice(0, plan.scenes - 1).concat([(scriptByFormat[f.id] || scriptByFormat.story).at(-1)])
  const per = plan.seconds / rows.length
  const cams = ['medium shot, gentle push in', 'wide shot, static', 'close-up, quick zoom', 'medium shot, slight pan', 'over-the-shoulder, static', 'wide shot, slow pull out']
  const input = {
    title: `${f.label}: ${topic}`.slice(0, 60),
    hook: rows[0][0],
    logline: `${f.label} about ${topic}, told by ${host}.`,
    beats: f.beats,
    characters: [{ name: host, look: style.character.replace(/^[^,]+,\s*/, '') }],
    scenes: rows.map(([narration, visual, text], i) => ({
      duration_sec: per,
      visual,
      camera: pick(cams, h + i),
      narration,
      on_screen_text: text,
      sfx: pick(['whoosh', 'pop', 'boing', 'record scratch', 'ding', 'soft thud'], h + i * 3),
    })),
    caption: `${rows[0][0]} ${pick(['Would you try it?', 'Did you know this?', 'Tag someone who needs this.'], h)}`,
    hashtags: [topic.replace(/[^a-z0-9]/gi, '').slice(0, 24) || 'trending', 'animation', 'learnontiktok', 'shorts'],
    fact_notes: 'Written by the offline template writer: check every claim before publishing.',
  }
  return normalizePlot(input, { seconds: plan.seconds, format: f.id, tone, trend, provider: 'local' })
}

// ---------------------------------------------------------------- running a request

const fail = (message, status) => Object.assign(new Error(message), { status })

/**
 * Run a request that ends with Claude calling `toolName`. Resumes paused
 * server-tool turns (long web research) and asks once more if Claude answered
 * in prose instead. `create(params)` is the SDK's beta.messages.create.
 */
export async function runForTool(create, params, toolName) {
  const messages = [...params.messages]
  const sources = []
  let nudged = false
  for (let round = 0; round < 6; round++) {
    const res = await create({ ...params, messages })
    sources.push(...searchSources(res))
    if (res.stop_reason === 'refusal') throw fail('Claude declined this request. Try a different topic or angle.', 422)
    if (res.stop_reason === 'max_tokens') throw fail('Claude ran out of room before finishing. Try a shorter video.', 502)
    const input = toolInput(res, toolName)
    if (input) return { input, sources }
    if (res.stop_reason === 'pause_turn') {
      // The server resumes where it stopped when the paused turn is sent back.
      messages.push({ role: 'assistant', content: res.content })
      continue
    }
    if (nudged) break
    nudged = true
    messages.push({ role: 'assistant', content: res.content }, nudgeFor(toolName))
  }
  throw fail('Claude did not return a result. Try again.', 502)
}

export async function researchTrendsWith(create, opts) {
  const { input, sources } = await runForTool(create, buildTrendRequest(opts), TREND_TOOL.name)
  const trends = normalizeTrends(input, sources)
  if (!trends.length) throw fail('No trends came back. Try a broader niche.', 502)
  return trends
}

export async function writePlotWith(create, opts) {
  const { input } = await runForTool(create, buildPlotRequest(opts), PLOT_TOOL.name)
  return normalizePlot(input, { seconds: opts.seconds, format: opts.format, tone: opts.tone, trend: opts.trend, provider: 'claude' })
}
