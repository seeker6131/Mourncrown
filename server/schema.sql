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
-- player names (one per account, unique ignoring case); ALTERs fail harmlessly once applied (deploy skips 'duplicate column')
ALTER TABLE accounts ADD COLUMN name TEXT;
ALTER TABLE accounts ADD COLUMN name_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_name ON accounts (name_key);
-- suspicious saves for the admin (anti-cheat log)
CREATE TABLE IF NOT EXISTS flags (id TEXT NOT NULL, at INTEGER NOT NULL, what TEXT NOT NULL, detail TEXT);
CREATE INDEX IF NOT EXISTS flags_id ON flags (id, at);
-- the players' market: listings (open / sold / cancel / expired) and what sellers are owed
CREATE TABLE IF NOT EXISTS market (id TEXT PRIMARY KEY, seller TEXT NOT NULL, seller_name TEXT, item TEXT NOT NULL, type TEXT NOT NULL, rar INTEGER NOT NULL, price INTEGER NOT NULL, until INTEGER NOT NULL, status TEXT NOT NULL, buyer TEXT, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS market_open ON market (status, type, price);
CREATE INDEX IF NOT EXISTS market_seller ON market (seller, status);
CREATE TABLE IF NOT EXISTS market_pay (listing TEXT PRIMARY KEY, seller TEXT NOT NULL, gold INTEGER NOT NULL, at INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS market_pay_seller ON market_pay (seller, done);
-- real guilds: a directory for finding / joining (the guild itself lives in its own Durable Object)
CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, leader TEXT, members INTEGER NOT NULL, hall INTEGER NOT NULL, at INTEGER NOT NULL);
-- banned accounts (the admin sets 1): they cannot sign in, play or join rooms
ALTER TABLE accounts ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
