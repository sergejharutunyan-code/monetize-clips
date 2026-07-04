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

- [ ] Replace localStorage with a real backend (DB + API) so data is durable and
      multi-device.
- [ ] Auth (email/OAuth) and per-user workspaces.
- [ ] Deploy the Claude proxy as a real service (env-managed key, rate limits,
      logging) instead of a local script.
- [ ] Secrets/config management; environment separation (dev/prod).

## Phase 3 — Real media pipeline

- [x] Source ingestion: load a long-form video file into the Clip Editor.
- [x] In-app **clip rendering**: trim to a window, reframe to 9:16 (focus + zoom),
      burn in the hook caption, and export a real playable clip file — all
      client-side (Canvas + MediaRecorder), no backend. Add straight to Library.
- [ ] Object storage for rendered clips (so added clips persist past a reload,
      not just as session object URLs) with thumbnails.
- [ ] Zoom/pan keyframes, multi-segment cuts, and beat/scene detection.
- [ ] Auto-transcription → suggest clip-worthy moments to feed the AI workshop.

## Phase 4 — Real publishing integrations

- [ ] YouTube Data API — upload Shorts, set title/description/tags.
- [ ] Instagram Graph API — publish Reels.
- [ ] TikTok Content Posting API — publish videos.
- [ ] OAuth connection manager for multiple accounts per platform.
- [ ] Server-side scheduler/worker that actually posts at the scheduled time,
      with retries and failure surfacing.

## Phase 5 — Real analytics (replacing the removed fakes)

- [ ] Pull genuine performance from platform APIs: views, watch time, retention,
      followers gained, and payout where exposed.
- [ ] Per-clip and per-account dashboards built on that real data.
- [ ] Attribution: which source/edit/hook drove results, to guide the next batch.

## Phase 6 — Compliance, scale & polish

- [ ] Rights/licensing records per source; originality/dedupe checks; required
      disclosures (sponsorship, AI-generated) surfaced before publish.
- [ ] Gate publishing on `validated` (can't schedule an unvalidated clip).
- [ ] Multi-brand/multi-account management and team roles.
- [ ] Quality: automated tests, typecheck/lint in CI, error monitoring,
      telemetry, custom domain.

---

### Doing now
Phase 1 → **Real trending source (YouTube Data API)**. Bring your own API key in
Discover; live trending videos flow straight into the AI workshop. Example
sources stay as the no-key fallback.
