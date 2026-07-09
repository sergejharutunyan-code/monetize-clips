# ClipForge backend (Phase 2 + 4)

A self-contained Node service that adds **accounts**, **cloud clip sync**, the
**Claude** and **YouTube trending** proxies (server-side keys), and **publishing**.
It uses Node 22's built-in SQLite — **no database to install, no native build**.

The frontend stays a static site and works fully offline; when you connect it to
a running backend (Playbook → Account & Sync), your clips sync to your account.

## Run locally

```bash
cd server
cp .env.example .env      # fill in what you have (all optional to boot)
npm install
npm start                 # http://localhost:8787  (uses --experimental-sqlite)
```

`GET /health` reports what's configured.

## Deploy to Render (one click, no terminal — works from a phone)

The repo ships a **[`render.yaml`](./render.yaml) blueprint**, so you can deploy
the backend entirely from a browser:

1. Sign in at **[render.com](https://render.com)** with GitHub.
2. **New → Blueprint** → pick `sergejharutunyan-code/monetize-clips`. Render reads
   `render.yaml`, builds `server/Dockerfile`, and generates `CLIPFORGE_SECRET`.
3. When prompted, paste the secret env vars you have (all optional to boot —
   `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY`, and the three `GOOGLE_*` for
   publishing). You can add them later in the service's **Environment** tab.
4. Deploy. Your backend is at `https://clipforge-backend-XXXX.onrender.com` —
   open `/health` to confirm what's configured.
5. Set `GOOGLE_REDIRECT_URI` to `https://<that-host>/api/oauth/youtube/callback`
   (and add the same URL to your Google OAuth client — see below).
6. In the app: **Playbook → Account & Sync**, paste the backend URL, create an
   account. **Discover → Claude API** and **Clip Editor → Publish to YouTube**
   now use it.

> **Free plan caveats (honest):** the service spins down after ~15 min idle (first
> request after that is slow to wake), and there's **no persistent disk**, so the
> SQLite DB — accounts, synced clips, YouTube connection — resets on each deploy or
> spin-down. For durable data, switch `plan: free` → `starter` in `render.yaml` and
> uncomment the `disk:` block (a persistent disk needs a paid instance).

## Deploy anywhere else (any Docker host — Fly/Railway/a VPS)

```bash
docker build -t clipforge-server ./server
docker run -p 8787:8787 --env-file ./server/.env -v clipforge-data:/app/data clipforge-server
```

Set the env vars in your host's dashboard, mount a volume at `/app/data` so the
SQLite file persists, and set `CLIPFORGE_ALLOW_ORIGIN` to your frontend origin.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | Status of configured integrations |
| POST | `/api/auth/register` · `/login` · `/logout` | – / token | Accounts (email + password; scrypt) |
| GET | `/api/auth/me` | token | Current user |
| GET / PUT | `/api/clips` | token | Pull / push the full clip set |
| POST | `/api/analyze` | – | Claude two-part workshop (server key) |
| GET | `/api/trending` | – | YouTube "most popular" (server key) |
| GET | `/api/publish/youtube/status` · `/connect` | token | Publish status / start OAuth |
| GET | `/api/oauth/youtube/callback` | – | OAuth redirect target |
| POST | `/api/publish/youtube` | token | Upload a clip as a Short (raw `video/*` body) |
| POST | `/api/publish/{instagram,tiktok}` | token | Scaffolded — returns 501 until approved (below) |

Auth is a **Bearer token** (`Authorization: Bearer <token>`) returned by
register/login — no cookies, so it works cleanly cross-origin.

## YouTube publishing (real — needs your Google OAuth app)

1. Google Cloud Console → enable **YouTube Data API v3**.
2. **OAuth consent screen** (External) → add yourself as a test user; scope
   `.../auth/youtube.upload`.
3. **Credentials → OAuth client ID → Web application**; add
   `https://YOUR-BACKEND/api/oauth/youtube/callback` to *Authorized redirect URIs*.
4. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in `.env`.
5. In the app: connect YouTube, then publish an exported clip. The video is sent
   as the raw request body and uploaded via YouTube's resumable protocol as a
   `#Shorts` video (defaults to **private** — flip to public when you're ready).

> Note: while your OAuth app is in "testing", only added test users can publish,
> and uploads land as private/unlisted until Google verifies the app.

## Instagram / TikTok

These are **scaffolded but gated**: both require an **approved developer app**
(business account, app review that typically takes weeks) plus long-lived tokens.
The routes return `501` until you add credentials and wire each platform's
Content Publishing flow (Instagram Graph API `media` → `media_publish`; TikTok
Content Posting API). That approval is the real blocker — not the code.
