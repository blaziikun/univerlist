-- Account & sync. The server keeps only what sign-in needs and a blob it can't read.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,            -- random, never shown, never taken from a request
  name TEXT NOT NULL,             -- what you called yourself
  created INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,   -- the stored library's version (each save is the next one)
  size INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL,
  keybox TEXT                      -- your data key, sealed by your passphrase (salt, iv, wrapped): useless without it
);
CREATE TABLE IF NOT EXISTS credentials (   -- passkeys: public keys only
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT, created INTEGER NOT NULL, last_used INTEGER NOT NULL, label TEXT
);
CREATE INDEX IF NOT EXISTS credentials_user ON credentials(user_id);
CREATE TABLE IF NOT EXISTS sessions (      -- the hash of each session token, never the token
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, last_seen INTEGER NOT NULL, label TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS challenges (    -- one-time WebAuthn challenges, five minutes each
  id TEXT PRIMARY KEY, challenge TEXT NOT NULL, user_id TEXT, kind TEXT NOT NULL, name TEXT, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (         -- your own list: sign-ins, passkeys, revokes (no addresses kept)
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL, detail TEXT
);
CREATE INDEX IF NOT EXISTS audit_user ON audit(user_id, at);
