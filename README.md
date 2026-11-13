# ClipForge

Cut long videos into short clips and **publish them to TikTok, Instagram Reels and
YouTube Shorts from one app** — now or on a schedule.

1. **Cut** — load a video, trim it, reframe to vertical, burn in the hook, export
   (with sound) in the browser.
2. **Keep** — exported clips are saved on your device and survive reloads.
3. **Publish** — one dialog sends the clip to all three platforms and shows the
   live link (or the platform's reason, in plain words, if it fails).

It tracks only **real workflow state** — statuses, counts, scheduling, and
validation. There are no invented performance numbers (views, likes, revenue).

![stack: React + TypeScript + Vite](https://img.shields.io/badge/React-TypeScript-blue)

## What it does

| Area | What you get |
|------|--------------|
| **Dashboard** | Honest workflow overview: clip counts, how many are validated vs. need review, live/scheduled posts, a pipeline-by-stage breakdown, and per-platform posting counts. |
| **Discover + AI workshop** | **Live trending videos** from the YouTube Data API (bring your own key) or example sources. One click breaks a video into a **two-part clip series** — Part 1 (hook + cliffhanger) and Part 2 (payoff) — each with a short and broad-strokes premise, a native hook, caption, hashtags, and a suggested cut window. Save the pair into the Library as a linked series. Runs on a built-in **local engine** or the **Claude API**. |
| **Clip Editor** | Turn a source video into a real vertical clip — **trim**, **reframe to 9:16 / 1:1 / 16:9** (pan + zoom), optionally **burn in the hook caption**, and **export a 1080p file with sound**. Cutting happens in the browser (the long source is never uploaded). Exports MP4 where the browser can; otherwise the backend converts it. Save to the Library and publish from there. |
| **Clip Library** | Track every clip from idea → editing → ready → scheduled → published, with a **rights/clearance** field, niche, hook, caption, hashtags, duration and aspect ratio. Search and filter; play or publish any clip. Two-part series show a `P1/2` · `P2/2` badge. |
| **Validate** | A native HTML5 video player to review clips before they ship. Load the rendered clip (**upload a file** or **paste a URL**), watch it in the correct aspect-ratio frame with the **hook overlaid**, run a review checklist, and mark it **validated** — a real status that flows through the pipeline. |
| **Publish** | Send a clip to **YouTube, Instagram and TikTok** in one go — immediately or at a scheduled time — with per-platform options (visibility, TikTok drafts, Instagram feed). See what is uploading, scheduled, failed (with a Retry) and live (with links). |
| **Accounts** | Connect the backend and your YouTube / Instagram / TikTok accounts. Shows exactly what each platform still needs. |
| **Caption Studio** | Generate a hook (from proven formulas), caption, and platform-tuned hashtag set — copy-ready per platform. |
| **Playbook** | The operating model plus the **legal/compliance** rules that keep accounts alive. |

## Two ways to post — both from the same screen

| | What it needs | What it does |
|---|---|---|
| **Automatic** | The ClipForge backend plus your own developer app on each platform (one-time setup, see [BACKEND.md](./BACKEND.md)) | Uploads the clip to the platforms for you, now or on a schedule, and reports back the live link. |
| **By hand** | Nothing | *Share to an app…* (on phones — hands the clip to the Instagram / TikTok / YouTube app), or download + the platform's upload page. Mark it posted and it is tracked the same way. |

YouTube, Instagram and TikTok each require **you** to register a developer app
before any tool may post on your behalf, and each restricts new apps (YouTube:
uploads stay private until the project is verified; TikTok: private posts or
inbox drafts until the app is audited; Instagram: your own tester accounts until
app review). ClipForge implements all three fully and tells you plainly when a
platform says no — but it cannot skip those approvals.

Your clip list and exported clip files are stored **in your browser**. The app
ships with example clips you can reset or clear from the Playbook page.

## Responsible use

Reuploading other people's videos verbatim is copyright infringement and violates
platform terms — it leads to takedowns, demonetization, and bans. ClipForge is
built for content you **own**, have **licensed**, or have **written permission** to
use, and encourages **transforming** it (your edit, commentary, captions). Every
clip carries a rights field so that decision happens before you publish. See the
in-app **Playbook** for the full compliance checklist.

## Run it

Requires Node 22.9+ and, for automatic posting, [ffmpeg](https://ffmpeg.org/download.html).

```bash
npm install
npm run app      # the whole app (web UI + backend) on http://localhost:8787
```

That is everything: cut, save, connect accounts, publish. Platform keys go in
`server/.env` (copy `server/.env.example`). Docker and one-click Render deploys,
and the step-by-step for each platform's developer app, are in
**[BACKEND.md](./BACKEND.md)**.

Working on the UI only:

```bash
npm run dev      # Vite dev server (no backend: cutting and posting by hand still work)
npm run build    # type-check and build to dist/
npm test         # backend end-to-end tests against stand-in platform APIs
```

The static build also runs on its own (e.g. GitHub Pages): open **Accounts** and
paste your backend's URL to switch automatic posting on.

## Tech

- **React 18 + TypeScript**, built with **Vite**; clip list in `localStorage`,
  clip files in IndexedDB
- **Backend**: Node 22 + Express + built-in SQLite + ffmpeg (`server/`)
- Theme-aware (light/dark) with an accessible, colorblind-validated palette
- Zero runtime dependencies beyond React

## Project layout

```
server/
  index.mjs          # routes: accounts, clip storage, connections, publishing; serves the web app
  config.mjs         # environment-derived settings (public URL, redirect URIs)
  lib/media.mjs      # streamed uploads + ffmpeg conversion to platform-ready MP4
  lib/publisher.mjs  # publish jobs + the worker that sends scheduled posts
  lib/youtube.mjs  lib/instagram.mjs  lib/tiktok.mjs   # OAuth + upload for each platform
  lib/connections.mjs                                  # stored platform tokens, refresh
  test/              # end-to-end tests + stand-in platform APIs
src/
  App.tsx            # shell + navigation + theme
  store.tsx          # clip list (localStorage)
  media.ts           # exported clip files (IndexedDB)
  clipeditor.ts      # canvas + MediaRecorder rendering engine (video + audio)
  publish.ts         # publish flow, job → post state, share/download helpers
  backend/           # API client + hooks
  ai/  trending/     # AI workshop engines, trending sources
  components/
    ClipEditor.tsx  PublishModal.tsx  Scheduler.tsx (Publish page)  Accounts.tsx
    Library.tsx  Validate.tsx  ClipPlayer.tsx  Dashboard.tsx  Discover.tsx  …
```
