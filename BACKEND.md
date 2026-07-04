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

## Deploy (any Docker host — Render/Fly/Railway have free tiers)

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
