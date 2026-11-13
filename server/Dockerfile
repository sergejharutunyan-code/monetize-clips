# ClipForge — the whole app in one image: web UI + backend + ffmpeg.
# Build from the REPOSITORY ROOT (the web app is built from ../src):
#   docker build -f server/Dockerfile -t clipforge .

# ---- 1. build the web app ----
FROM node:22-slim AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

# ---- 2. the server (Node 22: built-in SQLite, no native build) ----
FROM node:22-slim
# ffmpeg converts every uploaded clip to the MP4 (H.264 + AAC) the platforms require.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY --from=web /web/dist ./public

ENV PORT=8787
EXPOSE 8787

# Accounts, platform connections and clip videos live here: mount a volume to keep them.
VOLUME ["/app/data"]

CMD ["npm", "start"]
