# ClipForge

Research what is trending, turn it into a plot for an **original 30–60 second
animated short**, generate the clips with **Higgsfield**, put them together with
**narration and on-screen text**, and publish to **TikTok, Instagram Reels and
YouTube Shorts** — all in one app.

Everything it makes is original: your own recurring cartoon host, your own
house style, fictional stories and accurate explainers. No one else’s footage is
used anywhere.

## The loop

| Step | Screen | What happens |
|---|---|---|
| 1. Trend | **Trends** | Find topics people care about right now: **AI research** (Claude searches the web for your niche and cites sources), **Google Trends** (today’s top searches), **Wikipedia** (yesterday’s most-read), **YouTube** (most popular, as topic signals only), or **Evergreen** topics. A filter hides real people, deaths, crime and disasters. Each AI result comes with original video angles. |
| 2. Plot | **Studio** | Pick a format — *Story time*, *How-to*, *Explain it simply*, *Myth vs fact*, *What if…*, *Top 3* — a style, a tone and a length. Claude writes a **plot package**: hook, beats, a narration script sized to the length (~2.5 words/s), 5–9 timed scenes, on-screen text for each, post caption and hashtags, and fact notes. Every field is editable. |
| 3. Generate | **Studio** | The plot becomes **Higgsfield prompts**, split to the clip length your model makes (5–30 s). Each prompt repeats the full style and character description so separately generated clips match, and asks for no text in frame (text is added in step 4). Copy them into Higgsfield and upload the results — or, with the backend set up, generate all clips through the **Higgsfield API** in one tap. |
| 4. Assemble | **Assemble** | Clips join in order (trim each), **record the narration** with a teleprompter or upload a voiceover, and the on-screen text and a title card are **burned in** in your style’s caption design. Exports a 1080×1920 video with sound. |
| 5. Publish | **Publish** | One dialog posts to TikTok, Instagram and YouTube — now or scheduled — through the backend, or by hand with the phone’s share sheet / download. |

**Styles** holds the channel identity: art style, palette, motion, a recurring
host character, narrator voice, music and caption design. Five originals are
built in (Doodle Notebook, Bold Flat, Paper Cutout, Clay Miniature, Chalkboard
Lab); edit them or make your own. No studio, franchise or artist names — the
editor warns if one slips in.

## What needs what

| Feature | Works with no setup | Needs |
|---|---|---|
| Evergreen & Wikipedia trends | ✓ | — |
| AI trend research, Claude-written plots | — | an Anthropic API key: paste your own in **Accounts** (works on the GitHub Pages site), or put one on the backend |
| Offline plot writer (generic templates) | ✓ | — |
| Higgsfield prompts (copy & paste) | ✓ | a Higgsfield account |
| Generate clips via the Higgsfield API | — | the backend with `HIGGSFIELD_KEY_ID` / `HIGGSFIELD_KEY_SECRET` |
| Assemble, record narration, export | ✓ | — |
| Post by hand (share sheet, download) | ✓ | — |
| Automatic & scheduled posting, Google Trends | — | the backend plus each platform’s developer app — see [BACKEND.md](./BACKEND.md) |

Videos, trends, styles and clip files are stored in your browser (IndexedDB +
localStorage) and survive reloads.

## Run it

Requires Node 22.9+ and, for the backend’s video conversion, [ffmpeg](https://ffmpeg.org/download.html).

```bash
npm install
npm run app      # web app + backend on http://localhost:8787
```

Keys go in `server/.env` (copy `server/.env.example`): `ANTHROPIC_API_KEY`,
`HIGGSFIELD_KEY_ID` / `HIGGSFIELD_KEY_SECRET`, and the platform apps. Docker,
one-click Render, and step-by-step setup for every service are in
**[BACKEND.md](./BACKEND.md)**.

```bash
npm run dev      # UI only (Vite)
npm run build    # type-check and build to dist/
npm test         # backend end-to-end tests against stand-ins for Claude, Higgsfield and the platforms
```

## Staying monetizable

- **Label AI content** where platforms ask (TikTok’s AI-generated label,
  Instagram’s AI info). Publishing reminds you.
- **Avoid “mass-produced”**: YouTube does not monetize repetitive, low-effort
  videos. Your own narration, accurate facts and varied formats matter.
- **Check commercial use** on your Higgsfield plan.

The in-app **Playbook** covers this in more detail.

## Tech

- **React 18 + TypeScript**, Vite; canvas + Web Audio + MediaRecorder for assembly
- **Claude** (`claude-opus-5-5`) via the Anthropic SDK, with server-side web search,
  strict tool output and refusal fallbacks — the same request code runs on the
  backend and in the browser (`shared/studio.mjs`)
- **Backend**: Node 22 + Express + built-in SQLite + ffmpeg (`server/`)

```
shared/studio.mjs   formats, house styles, Claude requests, plot validation, Higgsfield prompt composer, offline writer
server/             API: accounts, Claude, Google Trends, Higgsfield render jobs, video storage, publishing
src/
  components/       Trends, Studio (PlotView, HiggsfieldPanel), Assemble, Library (Videos), Styles, Publish, Accounts
  render.ts         assembly engine: clips in order, captions, title card, voiceover mix, recording
  trends.ts  ai/    trend sources and the Claude engine selection (backend / own key / offline)
  store.tsx  media.ts  publish.ts  backend/
```
