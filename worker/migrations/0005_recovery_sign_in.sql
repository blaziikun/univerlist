-- The recovery code can sign you in, not only unlock: the browser makes a sign-in key from the code (a separate
-- derivation from the one that seals your library) and the server keeps only that key's hash, to find your account.
-- The code itself never leaves your browser.
ALTER TABLE users ADD COLUMN recovery_auth TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_recovery ON users(recovery_auth);
