import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import crypto from 'node:crypto'
import { DB_PATH } from './config.mjs'

if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    pass_hash  TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clips (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_clips_user ON clips(user_id);
  CREATE TABLE IF NOT EXISTS oauth (
    user_id  TEXT NOT NULL,
    provider TEXT NOT NULL,
    tokens   TEXT NOT NULL,
    PRIMARY KEY (user_id, provider)
  );
  CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  -- A rendered clip file stored on this server, ready to publish.
  CREATE TABLE IF NOT EXISTS media (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    token      TEXT NOT NULL,
    status     TEXT NOT NULL,          -- processing | ready | failed
    error      TEXT,
    src_file   TEXT,                   -- the upload, until it has been processed
    file       TEXT,                   -- the playable/publishable file
    mime       TEXT,
    size       INTEGER,
    duration   REAL,
    width      INTEGER,
    height     INTEGER,
    vcodec     TEXT,
    acodec     TEXT,
    normalized INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_media_user ON media(user_id);
  -- One publish of one clip to one platform, now or at a scheduled time.
  CREATE TABLE IF NOT EXISTS jobs (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    clip_id    TEXT,
    media_id   TEXT NOT NULL,
    platform   TEXT NOT NULL,
    status     TEXT NOT NULL,          -- queued | running | published | failed | canceled
    run_at     TEXT NOT NULL,
    options    TEXT NOT NULL,
    progress   TEXT,
    result     TEXT,
    error      TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_due ON jobs(status, run_at);
`)

/**
 * The secret that signs OAuth state. Uses CLIPFORGE_SECRET when set; otherwise a
 * random one is generated once and kept in the database, so an unset variable
 * never falls back to a guessable value.
 */
export function appSecret() {
  if (process.env.CLIPFORGE_SECRET) return process.env.CLIPFORGE_SECRET
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('secret')
  if (row) return row.value
  const value = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run('secret', value)
  return value
}
