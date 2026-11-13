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
-- guild war between real guilds: the shield (no raids until then) and the weekly season points (this week + last week)
ALTER TABLE guilds ADD COLUMN shield INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guilds ADD COLUMN week INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guilds ADD COLUMN score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guilds ADD COLUMN pweek INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guilds ADD COLUMN pscore INTEGER NOT NULL DEFAULT 0;
-- chat reports (players flag a chat line); an account reported by 3 different players in a day cannot chat for a day
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, by_id TEXT NOT NULL, target TEXT NOT NULL, room TEXT, text TEXT);
CREATE INDEX IF NOT EXISTS reports_target ON reports (target, at);
ALTER TABLE accounts ADD COLUMN muted_until INTEGER NOT NULL DEFAULT 0;

-- more devices of one account: each Google sign-in on another device adds its token here (the 5 newest kept), so the other devices stay signed in
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, id TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_id ON sessions (id, at);
-- letters to everyone from the back office (each player's game puts the new ones in its mailbox once)
CREATE TABLE IF NOT EXISTS mail_all (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, title TEXT NOT NULL, text TEXT, gift TEXT, until INTEGER NOT NULL DEFAULT 0, by_id TEXT);
