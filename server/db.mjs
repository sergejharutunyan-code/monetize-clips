import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DB_PATH = process.env.CLIPFORGE_DB || './data/clipforge.db'
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
`)
