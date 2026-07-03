# ClipForge

A workflow studio for the **clip-and-distribute** content strategy: turn long-form
moments into short clips and manage mass distribution across **TikTok, Instagram
Reels, and YouTube Shorts** from one place.

It is a planning and operations tool — a dashboard for the workflow — not an
auto-uploader or a scraper. You bring the footage and the accounts; ClipForge
helps you organize, schedule, caption, and measure.

![stack: React + TypeScript + Vite](https://img.shields.io/badge/React-TypeScript-blue)

## What it does

| Area | What you get |
|------|--------------|
| **Dashboard** | Estimated revenue, total views, engagement, and pipeline at a glance, with a 14-day revenue trend and per-platform breakdown. |
| **Clip Library** | Track every clip from idea → editing → ready → scheduled → published, with a **rights/clearance** field, niche, hook, caption, hashtags, duration, and aspect ratio. Search and filter. |
| **Scheduler** | Queue a clip onto each platform at a chosen time, stagger releases, and mark posts live. |
| **Analytics** | View-share donut, revenue trend, per-clip performance, and a full platform table (with tunable RPM). |
| **Caption Studio** | Generate a hook (from proven formulas), caption, and platform-tuned hashtag set — copy-ready per platform. |
| **Playbook** | The operating model plus the **legal/compliance** rules that keep accounts alive. |

Data is stored **locally in your browser** (localStorage) — no account, no server,
no tracking. The app ships with a demo dataset you can reset or clear from the
Playbook page.

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

## Tech

- **React 18 + TypeScript**, built with **Vite**
- No backend — state persists to `localStorage`
- Self-contained SVG charts; theme-aware (light/dark) with an accessible,
  colorblind-validated palette
- Zero runtime dependencies beyond React

## Project layout

```
src/
  App.tsx            # shell + navigation + theme
  store.tsx          # localStorage-backed state
  data.ts            # platforms, niches, hashtag banks, hook formulas, seed data
  metrics.ts         # aggregations (totals, per-platform, trends)
  types.ts           # domain model
  utils.ts           # formatting helpers
  components/
    Dashboard.tsx  Library.tsx  ClipModal.tsx  Scheduler.tsx
    Analytics.tsx  CaptionStudio.tsx  Playbook.tsx  charts.tsx
```
