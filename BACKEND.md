# ClipForge backend

One Node service that holds the keys and does the heavy lifting:

- **Claude**: trend research with web search and plot writing, with the API key
  kept on the server.
- **Higgsfield**: generates each clip of a plot through the Higgsfield API,
  follows it to completion and saves the result (Higgsfield’s links expire).
- **Trend signals**: Google Trends’ daily searches and YouTube’s most popular.
- **Stores videos** and converts each one with ffmpeg to the format every
  platform accepts (MP4, H.264 + AAC, 30 fps, index up front).
- **Publishes** to **YouTube** (Shorts), **Instagram** (Reels) and **TikTok** —
  immediately or at a scheduled time — and reports back the live link or the
  platform's reason if it fails.
- **Serves the web app** itself, so one process (or one container) is the whole
  product. Accounts and cloud sync of your video list are included.

Everything except publishing, Higgsfield-by-API and Google Trends also works
without the backend (the GitHub Pages site can call Claude with your own key).

It uses Node 22's built-in SQLite — no database to install, no native build.

## Run it

**On your computer** (needs Node 22.9+ and [ffmpeg](https://ffmpeg.org/download.html) on your PATH):

```bash
npm install
npm run app              # builds the web app, then serves everything on http://localhost:8787
```

Settings go in `server/.env` (copy `server/.env.example`). Everything is optional
to boot; each block of settings switches one feature on. On start the server
prints what it found — including the exact redirect URI to register for each
platform, and whether ffmpeg is available.

**With Docker** (ffmpeg included — build from the repository root):

```bash
docker build -f server/Dockerfile -t clipforge .
docker run -p 8787:8787 --env-file server/.env -v clipforge-data:/app/data clipforge
```

**On Render** (from a browser, no terminal): the repo ships a
[`render.yaml`](./render.yaml) blueprint. Render → **New → Blueprint** → pick this
repo → paste the secrets you have → deploy. Your app is at
`https://clipforge-backend-XXXX.onrender.com`. If you deployed an earlier version
of this blueprint, sync it again — the image is now built from the repo root.

> **Free-plan caveat.** Render's free plan has no persistent disk and sleeps after
> ~15 idle minutes. Every sleep or deploy wipes accounts, platform connections and
> stored clips, and scheduled posts cannot fire while it sleeps. It is fine for
> trying things out; for real posting use a plan with a disk (uncomment `disk:` in
> `render.yaml`), any Docker host with a volume at `/app/data`, or your own machine.

Open the app, go to **Accounts**, create an account, and connect your platforms.
When the app is opened from the backend's own address it finds the backend by
itself; the GitHub Pages copy asks for the backend URL once.

## Claude (research and writing)

1. [console.anthropic.com](https://console.anthropic.com/) → API keys → create a key.
   Set a monthly spend limit there.
2. Set `ANTHROPIC_API_KEY` on the backend. The model is `claude-opus-5-5`
   (`CLIPFORGE_MODEL` overrides it).

Trend research runs web searches (billed per search, up to 8 per research run);
plot writing runs up to 4 to fact-check. Both send `fallbacks: "default"`, so a
request Claude declines is retried on a fallback model automatically. The AI
routes need a signed-in account, so the server key is never open to the internet.

## Higgsfield (video generation)

1. [console.higgsfield.ai](https://console.higgsfield.ai/) → API keys → create a
   key. It has a **key ID** and a **secret**; the account needs a funded balance.
2. Set `HIGGSFIELD_KEY_ID` and `HIGGSFIELD_KEY_SECRET` (or `HIGGSFIELD_KEY` as
   `id:secret`). Optional: `HIGGSFIELD_MODEL` for the default model path.

The Studio offers Seedance 2.5 (4–30 s clips, with sound) and Seedance 2.0
(4–15 s); any other Higgsfield model path can be set as the default. Each
generation is `POST https://api.higgsfield.ai/<model path>` with `prompt`,
`duration`, `resolution`, `aspect_ratio` and `generate_audio`, then polled at
`/requests/<id>/status` until it is `completed`; the video is downloaded into
storage. A generation rejected by Higgsfield’s moderation (`nsfw`) is reported
in plain words and its credits are refunded by Higgsfield.

> The Higgsfield integration is built from Higgsfield’s published API docs and
> tested against a stand-in. Model fields can differ by model: check the model’s
> page on open.higgsfield.ai if a request is refused.

## Connecting the platforms

Each platform only lets an app post if **you** have registered a developer app
with it. That registration is the one thing this project cannot do for you; the
code for all three is complete. The **Accounts** page shows the exact redirect
URI to paste into each console.

`<BACKEND>` below is the backend's public address (`CLIPFORGE_PUBLIC_URL`; Render
sets it automatically). YouTube sign-in also works on `http://localhost:8787`.
**Instagram and TikTok only redirect to public `https://` addresses**, so for
those run the backend on a host or behind a tunnel.

Developer consoles change their wording often; the steps below describe what you
are looking for rather than exact button labels.

### YouTube

1. [Google Cloud Console](https://console.cloud.google.com/) → create a project →
   enable **YouTube Data API v3**.
2. Configure the **OAuth consent screen** (External). Add your Google account as
   a **test user**. The only scope needed is `…/auth/youtube.upload`.
3. **Credentials → Create OAuth client ID → Web application**. Authorized
   redirect URI: `<BACKEND>/api/oauth/youtube/callback`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, restart, then **Connect
   YouTube** in Accounts.

What to expect: until Google has verified/audited the project, videos uploaded
through the API are **locked to private** — flip them to public in YouTube
Studio. While the consent screen is in "Testing", Google expires the connection
after about a week (just reconnect). The default API quota only covers a handful
of uploads per day. Vertical or square clips up to 3 minutes are listed as Shorts.

### Instagram (Reels)

1. Your Instagram account must be a **professional account** (Business or
   Creator — a free switch in the Instagram app).
2. [developers.facebook.com](https://developers.facebook.com/) → create an app →
   add the **Instagram** product → **API setup with Instagram login**.
3. Use the **Instagram app ID** and **Instagram app secret** shown on that page
   (not the Meta app ID at the top of the dashboard).
4. In the business-login settings add the OAuth redirect URI
   `<BACKEND>/api/oauth/instagram/callback`.
5. While the app is in development mode, add your Instagram account under
   **App roles** as an Instagram tester and accept the invitation in Instagram
   (Settings → Apps and websites).
6. Set `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`, restart, then **Connect
   Instagram**.

What to expect: in development mode it posts for tester accounts only; posting
for anyone else needs Meta's app review of `instagram_business_content_publish`.
Reels must be MP4, 3 seconds to 15 minutes — the backend's conversion takes care
of the format. When the backend is on public HTTPS Instagram fetches the clip
from it by URL; otherwise the bytes are uploaded directly
(`INSTAGRAM_UPLOAD_MODE=url|resumable` forces one or the other).

### TikTok

1. [developers.tiktok.com](https://developers.tiktok.com/) → **Manage apps** →
   create an app.
2. Add **Login Kit** and the **Content Posting API** (turn on Direct Post).
   Scopes: `user.info.basic`, `video.publish`, `video.upload`.
3. Login Kit → Web → redirect URI `<BACKEND>/api/oauth/tiktok/callback`.
4. While unaudited, use the app's **sandbox** and add your TikTok account as a
   target user.
5. Set `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET`, restart, then **Connect
   TikTok**. (If your app was granted only some scopes, set `TIKTOK_SCOPES` to
   exactly those.)

What to expect: until TikTok has **audited** the app, direct posts can only be
private ("Only me") — the app says so in plain words if you try otherwise.
**Send to TikTok drafts** works before the audit: the clip lands in your TikTok
inbox and you finish the post in the TikTok app.

### No developer apps yet?

You can still post from the same screen. Every clip's **Publish** dialog has
**Post it yourself**: on a phone, *Share to an app…* hands the clip straight to
the Instagram / TikTok / YouTube app; on a computer, download it and use the
upload links. Mark it posted and it is tracked like any other post.

## Settings

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (default 8787). |
| `CLIPFORGE_PUBLIC_URL` | The backend's public address (redirect URIs, Instagram's clip download). Auto-detected on Render. |
| `CLIPFORGE_DB` | SQLite file. Clip videos live in a `media/` folder beside it (`CLIPFORGE_MEDIA_DIR` to move them). |
| `CLIPFORGE_ALLOW_ORIGIN` | Other origins allowed to call the API, comma-separated (e.g. the GitHub Pages site). `*` for local development. |
| `CLIPFORGE_APP_URL` | Where to return the browser after a platform sign-in when the app did not say. |
| `CLIPFORGE_SECRET` | Signs OAuth state. If unset, a random one is generated and kept in the database. |
| `CLIPFORGE_MAX_UPLOAD_MB` | Largest clip accepted (default 1024). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | YouTube publishing. |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Instagram publishing. |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | TikTok publishing. |
| `ANTHROPIC_API_KEY`, `CLIPFORGE_MODEL` | Claude trend research and plot writing. |
| `HIGGSFIELD_KEY_ID` / `HIGGSFIELD_KEY_SECRET`, `HIGGSFIELD_MODEL` | Higgsfield video generation. |
| `YOUTUBE_API_KEY` | YouTube most-popular as a trend source. |

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | What is configured (ffmpeg, platforms, AI) |
| POST | `/api/auth/register` · `/login` · `/logout` | – / token | Accounts (email + password; scrypt) |
| GET / PUT | `/api/clips` | token | Pull / push the clip list |
| POST | `/api/media` | token | Upload a clip (raw `video/*` body, streamed to disk) → converted in the background |
| GET / DELETE | `/api/media/:id` | token | Conversion status / remove |
| GET | `/media/:token/clip.mp4` | link | The clip file (range requests; the long random token is the access control) |
| GET | `/api/connections` | token | Platform status and redirect URIs |
| GET | `/api/connections/:platform/start` | token | Begin a platform sign-in |
| DELETE | `/api/connections/:platform` | token | Disconnect |
| GET | `/api/oauth/:platform/callback` | – | OAuth redirect target |
| POST | `/api/publish` | token | Publish a clip to one or more platforms, now or at `scheduledAt` |
| GET | `/api/jobs` | token | Status of posts (progress, live link, or error) |
| POST | `/api/jobs/:id/cancel` · `/retry` | token | Cancel a scheduled post / retry a failed one |
| POST | `/api/ai/trends` | token | Claude trend research with web search |
| POST | `/api/ai/plot` | token | Claude plot package for a trend, format, style and length |
| GET | `/api/trends/google` | token | Google Trends daily searches (`?geo=US`) |
| GET | `/api/trending` | token | YouTube "most popular" (server key) |
| GET | `/api/higgsfield` | token | Whether Higgsfield is set up, and the models offered |
| POST | `/api/higgsfield/renders` | token | Generate the parts of a plot |
| GET | `/api/higgsfield/renders` | token | Render status (`?ids=` or `?clipId=`), with the saved video when done |
| POST | `/api/higgsfield/renders/:id/cancel` · `/retry` | token | Cancel or retry one generation |

Auth is a **Bearer token** (`Authorization: Bearer <token>`) returned by
register/login — no cookies, so it works cross-origin. Platform tokens never
leave the server.

Scheduled posts are sent by a worker inside the server process, so the server
has to be running at the scheduled time. If it restarts in the middle of an
upload, that post is marked failed rather than re-sent blindly — check the
platform, then press Retry.

## Tests

```bash
npm test          # from the repo root (runs the server suite; needs ffmpeg)
```

The suite starts stand-ins for Claude, Higgsfield, Google Trends and the three
platforms' APIs (`server/test/mock-platforms.mjs`, written from their published
request and response formats) and drives the real server through trend research
(including a paused web-search turn), plot writing, Higgsfield generation and
download, upload and conversion, publishing to all three, scheduling, cancel,
retry and token refresh. It proves the app's side end to end; it cannot prove that each
service's live API accepts your particular keys — that only shows when you
connect real credentials.
