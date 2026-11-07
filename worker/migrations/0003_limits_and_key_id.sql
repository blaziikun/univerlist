-- How much each account has used R2 today (reset each day), so nobody can run up the bill: see DAILY in worker/sync.js.
ALTER TABLE users ADD COLUMN day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN writes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN reads INTEGER NOT NULL DEFAULT 0;
-- Which sync key this account uses (a fingerprint of it, not the key): every box must seal that one, so two devices
-- setting up at once can't leave the account with two keys. Set once, at setup (older accounts: by their first new box).
ALTER TABLE users ADD COLUMN kid TEXT;
-- The stored versions, newest first: [{ v, key, size, at }]. Each upload has its own R2 name, so two devices saving at
-- once can't overwrite each other's file; only the one that wins the version is kept. (Older accounts: null, and their
-- files are at u/<id>/<version>.)
ALTER TABLE users ADD COLUMN blobs TEXT;
