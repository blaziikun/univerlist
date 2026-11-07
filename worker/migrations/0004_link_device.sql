-- Adding a device by QR code: a one-time link, made on a device you're signed in on, good for ten minutes. It holds your
-- sync key sealed by a secret that's only in the QR code (never sent here), so the link alone is useless to the server.
CREATE TABLE IF NOT EXISTS links (
  token_hash TEXT PRIMARY KEY,   -- the hash of the link's token, never the token
  user_id TEXT NOT NULL,
  box TEXT NOT NULL,             -- the sync key, sealed by the QR code's secret
  expires INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS links_user ON links(user_id);
