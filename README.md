# ClipForge

A workflow studio for the **clip-and-distribute** content strategy: turn long-form
moments into short clips and manage mass distribution across **TikTok, Instagram
Reels, and YouTube Shorts** from one place.

It is a planning and operations tool — a dashboard for the workflow — not an
auto-uploader or a scraper. You bring the footage and the accounts; ClipForge
helps you organize, validate, schedule, and caption.

It tracks only **real workflow state** — statuses, counts, scheduling, and
validation. There are no invented performance numbers (views, likes, revenue);
plug in a real analytics source when you have one.

![stack: React + TypeScript + Vite](https://img.shields.io/badge/React-TypeScript-blue)

## What it does

| Area | What you get |
|------|--------------|
| **Dashboard** | Honest workflow overview: clip counts, how many are validated vs. need review, live/scheduled posts, a pipeline-by-stage breakdown, and per-platform posting counts. |
| **Discover + AI workshop** | **Live trending videos** from the YouTube Data API (bring your own key) or example sources. One click breaks a video into a **two-part clip series** — Part 1 (hook + cliffhanger) and Part 2 (payoff) — each with a short and broad-strokes premise, a native hook, caption, hashtags, and a suggested cut window. Save the pair into the Library as a linked series. Runs on a built-in **local engine** or the **Claude API**. |
| **Clip Editor** | Turn a source video into a real vertical clip — **trim**, **reframe to 9:16** (focus + zoom), optionally **burn in the hook caption**, and **export a playable file**. Runs entirely in the browser (Canvas + MediaRecorder, no upload/backend). Download it or add it straight to the Library. |
| **Clip Library** | Track every clip from idea → editing → ready → scheduled → published, with a **rights/clearance** field, niche, hook, caption, hashtags, duration, aspect ratio, and a video URL. Search and filter; play any clip. Two-part series show a `P1/2` · `P2/2` badge. |
| **Validate** | A native HTML5 video player to review clips before they ship. Load the rendered clip (**upload a file** or **paste a URL**), watch it in the correct aspect-ratio frame with the **hook overlaid**, run a review checklist, and mark it **validated** — a real status that flows through the pipeline. |
| **Scheduler** | Queue a clip onto each platform at a chosen time, stagger releases, and mark posts live (optionally with the live post URL). |
| **Caption Studio** | Generate a hook (from proven formulas), caption, and platform-tuned hashtag set — copy-ready per platform. |
| **Playbook** | The operating model plus the **legal/compliance** rules that keep accounts alive. |

Data is stored **locally in your browser** (localStorage) — no account, no server,
no tracking. The app ships with example clips you can reset or clear from the
Playbook page. (Uploaded video files play in the current session; a saved video
URL persists with the clip.)

## Responsible use

Reuploading other people's videos verbatim is copyright infringement and violates
platform terms — it leads to takedowns, demonetization, and bans. ClipForge is
built for content you **own**, have **licensed**, or have **written permission** to
use, and encourages **transforming** it (your edit, commentary, captions). Every
clip carries a rights field so that decision happens before you publish. See the
in-app **Playbook** for the full compliance checklist.

## Run it

Requires Node 18+.

```bash
npm install
npm run dev      # start the dev server (Vite prints the local URL)
npm run build    # type-check and build to dist/
npm run preview  # preview the production build
```

## Powering the AI workshop with Claude

The Discover workshop has two engines, switchable in the UI (Discover → AI engine):

- **Local (offline)** — a deterministic template engine. Instant, no key, and the
  default. Great for workshopping the two-part format.
- **Claude API** — real model-generated concepts via a small proxy server.

The proxy (`server/index.mjs`) holds your `ANTHROPIC_API_KEY` **server-side** and
calls the Claude API — the browser never sees the key. It uses the official
`@anthropic-ai/sdk` with `claude-opus-4-8`, adaptive thinking, and structured
JSON output, so the response always matches the app's schema.

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run server   # starts the proxy on :8787
```

Then in the app, switch the AI engine to **Claude API** (proxy URL defaults to
`http://localhost:8787`). If the proxy is down or has no key, the workshop
**transparently falls back to the local engine** and tells you why — it never
dead-ends. Config via env: `PORT`, `CLIPFORGE_MODEL`, `CLIPFORGE_ALLOW_ORIGIN`.

> The proxy is optional. `npm run dev` alone gives you the full app on the local
> engine with no backend.

## Tech

- **React 18 + TypeScript**, built with **Vite**
- No backend — state persists to `localStorage`
- Self-contained SVG charts; theme-aware (light/dark) with an accessible,
  colorblind-validated palette
- Zero runtime dependencies beyond React

## Project layout

```
server/
  index.mjs          # optional Claude proxy (holds the API key, calls Claude)
src/
  App.tsx            # shell + navigation + theme
  store.tsx          # localStorage-backed state (+ save two-part concept)
  data.ts            # platforms, niches, hashtag banks, hook formulas, seed data
  discovery.ts       # example source videos to workshop
  metrics.ts         # honest workflow counts (statuses, validation, posting)
  types.ts           # domain model
  utils.ts           # formatting helpers
  ai/
    index.ts         # analyzeVideo() — provider dispatch + fallback
    local.ts         # offline template engine
    claude.ts        # calls the Claude proxy
    settings.ts      # AI provider/proxy settings (localStorage)
  clipeditor.ts      # canvas + MediaRecorder clip rendering engine
  trending/          # trending sources (YouTube Data API + dispatcher)
  components/
    Dashboard.tsx  Discover.tsx  ClipEditor.tsx  Library.tsx  ClipModal.tsx
    Scheduler.tsx  Validate.tsx  ClipPlayer.tsx  CaptionStudio.tsx  Playbook.tsx
```
