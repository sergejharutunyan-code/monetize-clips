# ClipForge — Roadmap to fully operational

Where the app is today and the ordered work to turn it from a working prototype
into a real, production product. Checked items are done; the rest is the plan
we follow.

Legend: `[x]` done · `[~]` in progress · `[ ]` planned

---

## Phase 0 — Prototype (done)

- [x] Clip pipeline model (idea → editing → ready → scheduled → published)
- [x] Clip Library (rights/clearance, hook, caption, hashtags, niche, ratio)
- [x] Scheduler (per-platform queue, stagger, mark live)
- [x] Caption Studio (hook formulas + platform-tuned captions/hashtags)
- [x] AI two-part workshop (local engine + Claude API via a proxy)
- [x] Native video player + Validate flow (upload/URL, checklist, mark validated)
- [x] Honest state only — no fabricated metrics
- [x] Hosted build on GitHub Pages, auto-deploy on push
- [x] Local-first persistence (localStorage)

## Phase 1 — Real content in, honest data (now)

- [~] **Real trending source** — YouTube Data API (bring-your-own key), maps
      live trending videos into the workshop. *(this change)*
- [ ] Additional sources: creator watchlists, channel/playlist pulls, RSS,
      keyword search; later TikTok/IG trend signals where APIs allow.
- [ ] Server-side trending fetch through the proxy (key stays server-side) as an
      alternative to the browser key.
- [ ] Caching + quota handling for API pulls.

## Phase 2 — Accounts & backend

- [x] Real backend (`server/`) with a DB + API — Node 22 built-in SQLite, no
      native build. Email + password accounts (scrypt), Bearer-token sessions.
- [x] Cloud **clip sync** (pull/push) per account; localStorage stays the offline
      default, connect a backend to sync across devices.
- [x] Claude + YouTube proxies folded into the service (server-side keys);
      Dockerfile + `.env.example` + `BACKEND.md` runbook. *(you deploy it)*
- [ ] Managed hosting + automatic (vs. manual pull/push) sync, per-clip conflict
      handling, rate limits, and dev/prod separation.

## Phase 3 — Real media pipeline

- [x] Source ingestion: load a long-form video file into the Clip Editor.
- [x] In-app **clip rendering**: trim to a window, reframe to 9:16 (focus + zoom),
      burn in the hook caption, and export a real playable clip file — all
      client-side (Canvas + MediaRecorder), no backend. Add straight to Library.
- [x] Exports carry their **audio** (they were silent), default to 1080p, and
      record MP4 (H.264 + AAC) where the browser can.
- [x] Exported clips **persist**: saved in the browser (IndexedDB) with a poster
      frame, and stored on the backend once published.
- [x] Backend **conversion** (ffmpeg) of any upload to the one format every
      platform accepts.
- [ ] Zoom/pan keyframes, multi-segment cuts, and beat/scene detection.
- [ ] Auto-transcription → suggest clip-worthy moments to feed the AI workshop.

## Phase 4 — Real publishing integrations

- [x] **One publish flow for all three platforms** — pick platforms and options,
      post now or schedule, watch progress, get the live link or a plain-language
      failure reason with Retry.
- [x] **YouTube** — OAuth 2.0 + resumable upload, token refresh.
- [x] **Instagram** — Instagram Login OAuth (long-lived tokens, refresh) + Reels
      publishing (container → processing → publish), by URL or direct upload.
- [x] **TikTok** — Login Kit OAuth + Content Posting API (direct post with
      privacy options, or inbox drafts), chunked upload, status polling.
- [x] Server-side **scheduler/worker** that posts at the scheduled time.
- [x] **Post-by-hand path** for platforms without API access yet: device share
      sheet, download, upload links, mark as posted.
- [x] End-to-end tests against stand-in platform APIs.
- [ ] Verify against each live platform with real developer apps (needs your
      credentials; each platform also gates new apps — see `BACKEND.md`).
- [ ] Multiple accounts per platform; automatic retries with backoff.

## Phase 5 — Real analytics (replacing the removed fakes)

- [ ] Pull genuine performance from platform APIs: views, watch time, retention,
      followers gained, and payout where exposed.
- [ ] Per-clip and per-account dashboards built on that real data.
- [ ] Attribution: which source/edit/hook drove results, to guide the next batch.

## Phase 6 — Compliance, scale & polish

- [ ] Rights/licensing records per source; originality/dedupe checks; required
      disclosures (sponsorship, AI-generated) surfaced before publish.
- [~] Publishing is blocked while a clip's rights are "unverified"; gating on
      `validated` as well is still open.
- [ ] Multi-brand/multi-account management and team roles.
- [ ] Quality: automated tests, typecheck/lint in CI, error monitoring,
      telemetry, custom domain.

---

### Doing now
Phase 4 → connect real developer apps for YouTube, Instagram and TikTok and run
the publish flow against the live platforms.
