-- "Confirm it's you": the moments that change who can get into an account (deleting it, a new recovery code, adding
-- or removing a passkey) need a passkey or the recovery code just now, not only a session. A session confirmed in the
-- last few minutes (by signing in with a passkey or the code, or by POST /confirm) has fresh_until in the future.
-- A device signed in by a QR code has to confirm.
ALTER TABLE sessions ADD COLUMN fresh_until INTEGER NOT NULL DEFAULT 0;
