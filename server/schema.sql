-- Mourncrown online server (Cloudflare D1). Applied by tools/deploy_server.mjs (idempotent).
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,               -- account id (random)
  token_hash TEXT NOT NULL UNIQUE,   -- sha256 of the device session token (the token itself is never stored)
  google_sub TEXT UNIQUE,            -- Google account id once linked (login on any device)
  ip_hash TEXT,                      -- sha256 of the creating IP (rate limit for new accounts; not the IP itself)
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS accounts_ip ON accounts (ip_hash, created);
CREATE TABLE IF NOT EXISTS saves (
  id TEXT PRIMARY KEY,               -- account id
  rev INTEGER NOT NULL,              -- bumps on every write (two devices cannot silently overwrite each other)
  at INTEGER NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL                 -- the game state JSON
);
