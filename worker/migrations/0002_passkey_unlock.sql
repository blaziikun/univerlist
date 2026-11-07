-- Passkey unlock: each passkey can carry your sync key, sealed by a secret only that passkey can produce (WebAuthn PRF).
-- The secret never leaves your browser, so this box is as useless to the server as the passphrase one.
ALTER TABLE credentials ADD COLUMN unlock_box TEXT;
