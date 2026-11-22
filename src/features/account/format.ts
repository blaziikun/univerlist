// src/features/account/format.ts
// ─────────────────────────────────────────────────────────────────
//  Account: dates and sizes, the way the account page shows them
// ─────────────────────────────────────────────────────────────────

export const when = (t: number | string) =>
    new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
export const size = (n: number) => (n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB");
