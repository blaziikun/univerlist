// src/features/import-export/smartimport.ts
// ─────────────────────────────────────────────────────────────────
//  Smart import: a list from anywhere (any site's CSV, a pasted list) is looked up row by row
//
//  Each row is matched online, so it arrives with the right title, picture, year and ids. Matching forgives typos
//  (titles are compared by how alike they are, not letter by letter). Rows nothing matches are shown to you before
//  anything is created.
// ─────────────────────────────────────────────────────────────────

import { cleanTitle, errName, findExisting, isRecord, MEDIA, norm, sleep, surname, ui } from "../core/core";
import type { ActEl } from "../core/core";
import { searchMedium } from "../sources/sources";
import { openModal, renderOverlay } from "../core/modals";
import { runImport } from "../core/events";
import type { Candidate, ItemExt, Modal } from "../core/model";
import type { ImportedRow } from "./importers";

// ── scores in any form: 8, 8/10, 4.5/5, 85%, ★★★★½, ⭐⭐⭐, 👍 ──
const STAR_FULL = /[★⭐🌟✪✭]/gu,
    STAR_HALF = /½|⯪|☆½/u;
/** what a score column is out of, from its header ("Rating (out of 5)", "Score /100") or, failing that, from its
 * biggest value */
export function columnScale(header: string | undefined, values: (string | undefined)[]): string {
    const h = String(header || "");
    const m = /(?:out of|\/)\s*(5|10|100)\b/i.exec(h);
    if (m) return m[1];
    if (/stars?/i.test(h)) return "5";
    const nums = values
        .map(v => String(v || "").trim())
        .filter(v => /^\d+(?:[.,]\d+)?$/.test(v))
        .map(v => parseFloat(v.replace(",", ".")));
    if (!nums.length) return "10";
    const max = Math.max(...nums);
    return max <= 5 && nums.some(n => n % 1) ? "5" : max <= 5 && nums.length > 4 ? "5" : max <= 10 ? "10" : "100";
}
/** one score → [out of 10, the scale it was given in] */
export function parseAnyScore(v: unknown, colScale = "10"): [score: number, scale: string] {
    const s = String(v == null ? "" : v).trim();
    if (!s) return [0, ""];
    const stars = (s.match(STAR_FULL) || []).length,
        half = STAR_HALF.test(s) ? 0.5 : 0;
    if (stars || (half && !/\d/.test(s))) return [Math.min(10, (stars + half) * 2), "5"];
    if (/^👍/u.test(s)) return [8, "10"];
    if (/^👎/u.test(s)) return [3, "10"];
    const frac = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+)/.exec(s);
    if (frac) {
        const n = parseFloat(frac[1].replace(",", ".")),
            d = +frac[2];
        if (d > 0 && n <= d) return [Math.round((n / d) * 100) / 10, d === 5 ? "5" : d === 100 ? "100" : "10"];
    }
    const pc = /(\d+(?:[.,]\d+)?)\s*%/.exec(s);
    if (pc) return [Math.min(10, Math.round(parseFloat(pc[1].replace(",", "."))) / 10), "100"];
    const n = parseFloat(s.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return [0, ""];
    const out = colScale === "5" ? n * 2 : colScale === "100" ? n / 10 : n;
    return [Math.min(10, Math.round(out * 10) / 10), colScale];
}
/** "Anime", "Movie", "TV Series", "Book", "Video game"… in a column: what each row is, when one file mixes them */
export function mediumFromText(v: unknown): string {
    const s = String(v || "").toLowerCase();
    if (!s) return "";
    if (/anime/.test(s)) return "anime";
    if (/manhwa|manhua|webtoon/.test(s)) return "manhwa";
    if (/manga/.test(s)) return "manga";
    if (/light novel/.test(s)) return "novel";
    if (/comic|graphic novel/.test(s)) return "comic";
    if (/game|ps\d|xbox|switch|nintendo|steam|pc\b/.test(s)) return "game";
    if (/album|music|\bep\b|single|vinyl|\blp\b|record/.test(s)) return "album";
    if (/movie|film/.test(s)) return "film";
    if (/tv|series|show|season|episode|drama/.test(s)) return "tv";
    if (/book|novel|audiobook|ebook|kindle/.test(s)) return "book";
    return "";
}

// ── how alike two titles are, 0 to 1 (typos, missing words and punctuation forgiven) ──
function grams(s: string): Map<string, number> {
    const t =
            " " +
            norm(cleanTitle(s))
                // whole words only: \b takes any letter beyond a–z for a gap, so it would cut "an" off "anの"
                .replace(/(^| )(the|a|an)(?= |$)/g, "$1")
                .replace(/\s+/g, " ")
                .trim() +
            " ",
        g = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) {
        const k = t.slice(i, i + 2);
        g.set(k, (g.get(k) || 0) + 1);
    }
    return g;
}
export function titleLike(a: string, b: string): number {
    if (!a || !b) return 0;
    if (norm(cleanTitle(a)) === norm(cleanTitle(b))) return 1;
    const A = grams(a),
        B = grams(b);
    let both = 0,
        n = 0;
    for (const [k, c] of A) {
        n += c;
        both += Math.min(c, B.get(k) || 0);
    }
    for (const c of B.values()) n += c;
    return n ? (2 * both) / n : 0;
}
/** a row of a list being matched: what you gave, and what was found for it */
export type SmartRow = ImportedRow & {
    ext?: ItemExt;
    state?: string; // "library" (already in it), "matched", "none", or "" (not looked up yet)
    match?: Candidate | null;
    sure?: boolean;
    err?: boolean;
    typed?: string;
    [field: string]: unknown;
};
/** the matching dialog: the rows, the unmatched ones ticked to add as typed, and how far the lookups have got */
export interface SmartModal extends Modal {
    rows: SmartRow[];
    add: Record<number, boolean>;
    done?: number;
    running?: boolean;
}
/** the dialog that's open is the matching one (smartImport() opened it with its rows) */
export const isSmartModal = (m: Modal | null): m is SmartModal =>
    !!m && m.kind === "smartmatch" && Array.isArray(m.rows) && isRecord(m.add);
// the best of a search's results for a row, or null when none is close enough
function bestOnline(x: SmartRow, R: Candidate[]): { r: Candidate; sure: boolean } | null {
    const sur = surname(x.creator || "");
    let best: Candidate | null = null,
        top = 0;
    for (const r of R || []) {
        if (x.medium && r.medium && r.medium !== x.medium && !(x.medium === "book" && r.medium === "comic")) continue;
        let s = Math.max(
            ...[r.title, r.alt && r.alt.en, r.alt && r.alt.romaji, r.alt && r.alt.native]
                .filter((t): t is string => !!t)
                .map(t => titleLike(x.title, t))
        );
        if (x.year && r.year) s += x.year === r.year ? 0.12 : Math.abs(x.year - r.year) <= 1 ? 0.04 : -0.15;
        if (sur && r.creator) s += norm(r.creator).includes(sur) ? 0.1 : -0.05;
        if (s > top) {
            top = s;
            best = r;
        }
    }
    return best && top >= 0.62 ? { r: best, sure: top >= 0.85 } : null;
}
// what a match brings, and what of yours it never overwrites
const MINE = ["rating", "scale", "status", "finishedAt", "startedAt", "notes", "tags", "prog", "repeat", "copy", "log"];
function withMatch(x: Omit<SmartRow, "state" | "match" | "sure" | "err">, r: Candidate): Record<string, unknown> {
    const keep = Object.fromEntries(
        MINE.filter(k => {
            const v = x[k];
            return v != null && v !== "" && !(Array.isArray(v) && !v.length);
        }).map(k => [k, x[k]])
    );
    return {
        ...r,
        src: undefined,
        recs: undefined,
        medium: r.medium || x.medium,
        kind: x.kind || r.kind || "",
        ...keep,
        typed: x.title,
    };
}

// ── the matching run: a few rows at a time, gently (AniList allows about 90 lookups a minute) ──
async function smartMatch(m: SmartModal) {
    const rows = m.rows,
        ctl = (m.ctl = new AbortController()),
        al = (x: SmartRow) => ["anime", "manga", "manhwa", "novel"].includes(x.medium);
    let i = 0;
    m.done = 0;
    m.running = true;
    const one = async (x: SmartRow) => {
        if (x.state) return; // already decided (library, matched or looked up by hand)
        if (findExisting(x.title, x.creator, x.medium, x.ext)) {
            x.state = "library";
            return;
        }
        try {
            let R = await searchMedium(x.medium, cleanTitle(x.title), ctl.signal),
                hit = bestOnline(x, R);
            // a typo in the first word sinks most searches: try the longest words on their own
            if (!hit) {
                const words = norm(cleanTitle(x.title))
                    .split(" ")
                    .filter(w => w.length > 3)
                    .sort((a, b) => b.length - a.length)
                    .slice(0, 2)
                    .join(" ");
                if (words && words !== norm(cleanTitle(x.title))) {
                    R = await searchMedium(x.medium, words, ctl.signal);
                    hit = bestOnline(x, R);
                }
            }
            if (hit) {
                x.match = hit.r;
                x.sure = hit.sure;
                x.state = "matched";
            } else x.state = "none";
        } catch (e) {
            if (errName(e) === "AbortError") throw e;
            x.state = "none";
            x.err = true;
        }
    };
    const worker = async () => {
        while (i < rows.length && !ctl.signal.aborted) {
            const x = rows[i++];
            await one(x);
            m.done = (m.done || 0) + 1;
            smartRedraw();
            await sleep(al(x) ? 700 : 150);
        }
    };
    try {
        await Promise.all([worker(), worker()]);
    } catch (_) {}
    m.running = false;
    smartRedraw();
}
// the rows are changed in place as the lookups come back: the dialog (SmartMatch.svelte) is asked to catch up
function smartRedraw() {
    if (ui.modal && ui.modal.kind === "smartmatch") renderOverlay();
}
/** start one: from the column matcher or a pasted list */
export function smartImport(kind: string, list: (ImportedRow & { ext?: ItemExt })[]) {
    if (!navigator.onLine || !list.length) {
        runImport({ kind, name: kind, items: list });
        return;
    }
    openModal("smartmatch", { from: kind, rows: list.map(x => ({ ...x })), add: {} });
    if (isSmartModal(ui.modal)) smartMatch(ui.modal);
}
/** the medium's word for one of them ("" for a medium the app doesn't have) */
export const oneOf = (medium: string | undefined) => (medium && MEDIA[medium] ? MEDIA[medium].one : "");
/** look a row up again, by the title you corrected (the dialog's "Look again") */
export function smartRetry(m: SmartModal, i: number, title: string) {
    const x = m.rows[i];
    if (!x) return;
    x.title = title.trim() || x.title;
    x.state = "";
    x.match = null;
    (async () => {
        try {
            const hit = bestOnline(x, await searchMedium(x.medium, cleanTitle(x.title)));
            if (hit) {
                x.match = hit.r;
                x.sure = true;
                x.state = "matched";
            } else x.state = "none";
        } catch (_) {
            x.state = "none";
        }
        smartRedraw();
    })();
}
/** the matching dialog's buttons; true when the button was one of them */
export function smartClick(act: string, _t: ActEl, k: string | undefined): boolean {
    const m = ui.modal;
    if (!isSmartModal(m)) return false;
    const R = m.rows,
        i = Number(k),
        x = R[i];
    if (act === "sm-unmatch") {
        if (!x) return true;
        x.match = null;
        x.state = "none";
        renderOverlay();
        return true;
    }
    if (act === "sm-addall" || act === "sm-addnone") {
        R.forEach((y, j) => {
            if (y.state === "none") m.add[j] = act === "sm-addall";
        });
        renderOverlay();
        return true;
    }
    if (act === "sm-import" || act === "sm-raw") {
        if (m.ctl) m.ctl.abort();
        const list =
            act === "sm-raw"
                ? R.map(row => {
                      const { state: _s, match: _m, sure: _u, err: _e, typed: _t, ...y } = row;
                      return y;
                  })
                : R.flatMap((row, j) => {
                      const { state, match, sure: _u, err: _e, ...y } = row;
                      return state === "matched" && match
                          ? [withMatch(y, match)]
                          : state === "library" || !state
                            ? [y]
                            : m.add[j]
                              ? [y]
                              : [];
                  });
        runImport({ kind: m.from || "your list", name: m.from || "your list", items: list });
        return true;
    }
    return false;
}
