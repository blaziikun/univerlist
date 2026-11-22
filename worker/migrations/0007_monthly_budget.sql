-- The whole site's R2 use this month, so it stays inside Cloudflare's free amounts however many accounts there are
-- (BUDGET in sync.ts). One row a month; rows older than two months are cleared.
CREATE TABLE IF NOT EXISTS budget (
    month TEXT PRIMARY KEY, -- "2026-11"
    puts INTEGER NOT NULL DEFAULT 0, -- R2 writes (Class A)
    gets INTEGER NOT NULL DEFAULT 0 -- R2 reads and look-ups (Class B)
);
