// src/features/learning-centre/learning-import.ts
// ─────────────────────────────────────────────────────────────────
//  The Learning Centre: fetching a university's module list and reading lists into a path
//
//  Paste a link: a programme or module page (the modules, by year, with codes and credits), or a reading list (the
//  books, in order). It's fetched (directly when the site allows it, otherwise through your site's /api, which only
//  reaches university and reading-list sites), read, and shown in a table you can edit before anything is saved. Every
//  university's pages differ: reading lists on Talis Aspire are read exactly; anything else is read from its headings,
//  tables and lists, which is why you check it first. A site that can't be reached (or needs you to sign in): open it,
//  select everything, copy, and paste it here. A fetched page is read as hostile: it's parsed into a document that
//  never runs, and only text comes out of it.
// ─────────────────────────────────────────────────────────────────

import {
    addItem,
    at,
    errMessage,
    fieldsOf,
    markDirty,
    norm,
    plural,
    recordsOf,
    safeJSON,
    textOf,
    toast,
    ui,
} from "../core/core";
import type { Modal, PathBook, PathModule } from "../core/model";
import { pxBase, pxURL } from "../sources/proxy";
import { autoCovers } from "../sources/covers";
import { renderMain } from "../core/shell";
import { closeModal, renderOverlay } from "../core/modals";
import { acId, lcSub, pwLib, PWS } from "./learning";
import { uniAddProgramme } from "./learning-curricula";

const LC_CODE =
    /(?:^|[\s([:|·•–-])((?:[A-Z]{2,6}[ -]?\d{2,6}[A-Z]?\d?)|(?:\d{1,2}\.\d{2,4}[A-Z]?))(?=$|[\s)\]:,.|·•–-])/;
const LC_STAGE =
    /\b(?:year|level|stage|semester|term|block)\s*(?:\d{1,2}|[IVX]{1,4}|one|two|three|four|five)\b|\b(?:first|second|third|fourth|fifth|final)[ -]year\b|\bpart\s*(?:IA|IB|II|III|[1-4]|[A-C])\b|\b(?:michaelmas|lent|easter|autumn|spring|summer|fall|winter)\s+term\b/i;
const LC_OPT = /\b(optional|options?|electives?|choose|choice)\b/i,
    LC_CORE = /\b(compulsory|core|required|mandatory)\b/i;
// an element's text, with a space wherever a cell, line or block ends (textContent runs "AERO40001" and "Mathematics" together)
const LC_GAP = /^(TD|TH|TR|BR|LI|P|DIV|DT|DD|H[1-6]|TABLE|SECTION|ARTICLE|UL|OL|HEADER|FOOTER|SUMMARY)$/;
function lcText(el: Node): string {
    let out = "";
    const walk = (n: Node) => {
        for (const c of n.childNodes) {
            if (c.nodeType === 3) out += c.nodeValue || "";
            else if (c instanceof Element) {
                const gap = LC_GAP.test(c.tagName);
                if (gap) out += " ";
                walk(c);
                if (gap) out += " ";
            }
        }
    };
    walk(el);
    return out.replace(/\s+/g, " ").trim();
}
const LC_BLOCK = "li,tr,dt,dd,p,summary,h4,h5,h6,a,div.item,div.module,article";
/** a row of what was found, to check before it's saved: a module (stage, code, name, credits, core) or a reading
 * (section, title, author, year, ISBN, how important) */
export interface LcRow {
    keep: boolean;
    stage?: string;
    code?: string;
    name?: string;
    credits?: string;
    core?: boolean;
    section?: string;
    t?: string;
    a?: string;
    year?: string;
    isbn?: string;
    imp?: string;
}
/** what a page held: modules or readings, and how it was read */
interface LcFound {
    kind: string;
    rows: LcRow[];
    how?: string;
}

// ── module lists ──
function lcParseModules(doc: Document): LcRow[] {
    const out: LcRow[] = [],
        seen = new Set<string>();
    let stage = "",
        kind: boolean | null = null;
    const blocks = [...doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,caption,th," + LC_BLOCK)];
    for (const el of blocks) {
        const tx = lcText(el);
        if (!tx) continue;
        if (/^(H[1-6]|CAPTION|TH)$/.test(el.tagName) || (el.tagName === "SUMMARY" && !LC_CODE.test(tx))) {
            if (tx.length <= 90) {
                const sm = LC_STAGE.exec(tx);
                if (sm) {
                    stage = lcStageName(tx);
                    kind = LC_OPT.test(tx) ? false : LC_CORE.test(tx) ? true : null;
                } else if (LC_OPT.test(tx) || LC_CORE.test(tx)) kind = !LC_OPT.test(tx);
            }
            if (/^H[1-6]$/.test(el.tagName)) continue;
        }
        // only the innermost block holding a code (a link inside a list item is read once, as the list item)
        if (el.tagName !== "TR" && [...el.querySelectorAll(LC_BLOCK)].some(c => LC_CODE.test(lcText(c)))) continue;
        if (el.tagName !== "TR" && el.closest("tr")) continue;
        const m = LC_CODE.exec(tx);
        if (!m || tx.length > 260) continue;
        const code = m[1].replace(/\s+/g, " ");
        let name = "",
            credits = "";
        if (el.tagName === "TR") {
            const cells = [...el.children].map(lcText);
            for (const c of cells) {
                if (c.includes(code)) {
                    const rest = c.replace(code, "").replace(/^[\s:–·-]+|[\s:–·-]+$/g, "");
                    if (rest.length > name.length) name = rest;
                } else if (/^\d{1,3}(\.\d)?$/.test(c) && +c >= 2 && +c <= 120 && !credits) credits = c;
                else if (c.length > name.length && /[a-z]{3}/i.test(c) && !/^\d/.test(c)) name = c;
            }
        } else {
            const cr = /(\d{1,3}(?:\.\d)?)\s*(?:credits?|cr\b|ects|cats|units?|ects credits)/i.exec(tx);
            if (cr) credits = cr[1];
            name = tx
                .replace(code, " ")
                .replace(/\(?\s*\d{1,3}(?:\.\d)?\s*(?:credits?|cr\b|ects|cats|units?)\s*\)?/gi, " ")
                .replace(/[\s:–—·|()[\]-]+/g, " ")
                .trim();
        }
        name = name
            .replace(/\s+/g, " ")
            .replace(/^(module|course|unit)\s*:?\s*/i, "")
            .trim();
        if (!name || name.length < 3 || name.length > 140 || !/[a-z]{3}/i.test(name)) continue;
        const key = code + "|" + norm(name);
        if (seen.has(code) || seen.has(key)) continue;
        seen.add(code);
        seen.add(key);
        const local = LC_OPT.test(tx) ? false : LC_CORE.test(tx) ? true : null;
        out.push({ keep: true, stage, code, name, credits, core: local ?? kind ?? true });
    }
    return out;
}
function lcStageName(tx: string) {
    const m = LC_STAGE.exec(tx);
    let s = m ? m[0] : tx;
    s = s.replace(/\s+/g, " ").trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── reading lists ──
const LC_YEAR = /\b(1[5-9]\d\d|20[0-3]\d)\b/,
    LC_ISBN = /\b(97[89](?:[- ]?\d){10}|\d{9}[\dX])\b/;
function lcCite(text: string, title: string) {
    let t = "",
        a = "",
        year = "",
        isbn = "";
    const s = text
        .replace(/\s+/g, " ")
        .replace(/\[(online|electronic resource|e-?book)\]/gi, "")
        .replace(/\bAvailable (at|from):?.*$/i, "")
        .trim();
    const ib = LC_ISBN.exec(s);
    if (ib) isbn = ib[1].replace(/[- ]/g, "");
    const y = /\((\d{4})[a-z]?\)/.exec(s) || /,\s*(1[5-9]\d\d|20[0-3]\d)\b/.exec(s) || LC_YEAR.exec(s);
    if (y) year = y[1];
    if (title && s.includes(title)) {
        t = title;
        a = s.slice(0, s.indexOf(title));
    } else {
        let m: RegExpExecArray | null;
        if ((m = /^(.{2,160}?)\s*\((?:\d{4})[a-z]?\)[.,]?\s*["'‘“](.{3,250}?)["'’”]/.exec(s))) {
            a = m[1];
            t = m[2];
        } else if (
            (m = /^(.{2,160}?)\s*\((?:\d{4})[a-z]?\)[.,]?\s*(.{3,250}?)(?:\.\s|,\s(?:[A-Z][a-z]+:|\d)|\s\(|$)/.exec(s))
        ) {
            a = m[1];
            t = m[2];
        } else if (
            (m = /^["'‘“]?(.{3,200}?)["'’”]?\s+by\s+(.+?)(?:\s*[;(]|(?<!\b[A-Z])\.\s+(?=[A-Z][a-z]{2})|,\s|\.?$)/i.exec(
                s
            ))
        ) {
            t = m[1];
            a = m[2];
        } else if (
            (m =
                /^([A-Z][\w'’-]+,\s+[A-Z][\w'’-]+(?:\s+[A-Z]\.?)?(?:,?\s+(?:and|&)\s+[A-Z][^.]{2,60})?)\.\s+(.{3,250}?)(?:\.\s|$)/.exec(
                    s
                ))
        ) {
            a = m[1];
            t = m[2];
        } else if (
            (m = /^((?:[A-Z][\w'’-]+,\s*(?:[A-Z]\.\s?){1,3}(?:\s?(?:,|&|and)\s*)?){1,6})\s*(.{3,250}?)(?:\.\s|$)/.exec(
                s
            ))
        ) {
            a = m[1];
            t = m[2];
        } else if ((m = /^(.{3,200}?)\s+[–—]\s+(.{3,120})$/.exec(s))) {
            t = m[1];
            a = m[2];
        } else t = s.split(/\.\s/)[0];
    }
    const tidy = (x: string) =>
        String(x || "")
            .replace(/\((?:\d{4})[a-z]?\)/g, "")
            .replace(/\b(eds?|edn|editors?)\.?\b/gi, "")
            .replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, "")
            .replace(/\s+/g, " ")
            .trim();
    // "Title, Publisher, 1976": the title stops at the comma before the publisher or the year
    if (!title) {
        const cut = /^(.{3,}?),\s+(.*)$/.exec(t);
        if (
            cut &&
            (LC_YEAR.test(cut[2]) ||
                /press|publish|wiley|springer|hill|elsevier|routledge|pearson|prentice|academic|university|norton|penguin|dover|birkh/i.test(
                    cut[2]
                ))
        )
            t = cut[1];
    }
    t = tidy(t)
        .replace(/^["'‘“]|["'’”]$/g, "")
        .replace(/\s*\(\d+(st|nd|rd|th) ed(ition)?\.?\)$/i, "");
    a =
        tidy(a) +
        (/\b[A-Z]$/.test(tidy(a)) && /\b[A-Z]\.\s*[,.(]?\s*$/.test(a.replace(/\((?:\d{4})[a-z]?\)/g, "").trim())
            ? "."
            : "");
    if (a.length > 140) a = a.slice(0, 140);
    return { t, a, year, isbn };
}
function lcParseReadings(doc: Document): LcRow[] {
    const out: LcRow[] = [],
        seen = new Set<string>();
    let section = "",
        imp = "";
    for (const el of doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6,li,p,tr,dd,div.item,article")) {
        const tx = lcText(el);
        if (!tx) continue;
        if (/^H[1-6]$/.test(el.tagName)) {
            if (tx.length <= 100) {
                section = tx.replace(/\s*\(\d+ items?\)$/i, "");
                imp = /essential|core|required|key/i.test(tx)
                    ? "core"
                    : /recommended/i.test(tx)
                      ? "rec"
                      : /further|background|optional|supplementary|additional/i.test(tx)
                        ? "opt"
                        : imp;
            }
            continue;
        }
        if ([...el.querySelectorAll("li,p,tr,dd,div.item,article")].some(c => lcText(c).length > 12)) continue;
        if (tx.length < 12 || tx.length > 600 || LC_CODE.test(tx.slice(0, 14))) continue;
        const it = el.querySelector("i,em,cite,.title,[class*=title]"),
            title = it ? lcText(it) : "";
        const score =
            (LC_YEAR.test(tx) ? 1 : 0) +
            (LC_ISBN.test(tx) ? 2 : 0) +
            (title.length > 3 ? 1 : 0) +
            (/\sby\s/i.test(tx) ? 1 : 0) +
            (/\b(press|publish|edition|ed\.|edn|vol\.|journal|chapter|pp\.)/i.test(tx) ? 1 : 0);
        if (score < 1 || (score < 2 && tx.length < 25)) continue;
        const c = lcCite(tx, title.length > 3 ? title : "");
        if (!c.t || c.t.length < 3) continue;
        const key = norm(c.t) + "|" + norm(c.a).split(" ")[0];
        if (seen.has(key)) continue;
        seen.add(key);
        const local = /essential|core|required/i.test(tx)
            ? "core"
            : /recommended/i.test(tx)
              ? "rec"
              : /further|background|optional|supplementary/i.test(tx)
                ? "opt"
                : imp;
        out.push({ keep: true, section, ...c, imp: local || "" });
    }
    return out;
}
// Talis Aspire (many UK universities' reading lists): its own data, in the list's order, sections and all. The data
// is linked data as JSON (subject → predicate → values); anything in it that isn't is skipped
function lcParseTalis(J: unknown): LcRow[] {
    const R = "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        RL = "http://purl.org/vocab/resourcelist/schema#",
        DC = "http://purl.org/dc/terms/",
        BIBO = "http://purl.org/ontology/bibo/",
        FOAF = "http://xmlns.com/foaf/0.1/";
    const v = (s: string, p: string) => recordsOf(at(J, s, p)).map(o => textOf(o.value)),
        one = (s: string, ...ps: string[]) => {
            for (const p of ps) {
                const x = v(s, p)[0];
                if (x) return x;
            }
            return "";
        };
    const seq = (s: string) =>
        Object.keys(fieldsOf(at(J, s)))
            .filter(k => /#_\d+$/.test(k) && k.startsWith(R))
            .sort((a, b) => +(a.split("_").pop() || 0) - +(b.split("_").pop() || 0))
            .map(k => textOf(at(J, s, k, 0, "value")))
            .filter(Boolean);
    const isA = (s: string, ty: string) => v(s, R + "type").some(x => x === RL + ty || x.endsWith("#" + ty));
    const list = Object.keys(fieldsOf(J)).find(s => isA(s, "List"));
    if (!list) return [];
    const out: LcRow[] = [],
        seen = new Set<string>(),
        walk = (node: string, section: string) => {
            // a list that leads back into itself is read once
            if (seen.has(node)) return;
            seen.add(node);
            for (const c of seq(node)) {
                if (isA(c, "Section")) {
                    walk(c, one(c, DC + "title", "http://www.w3.org/2000/01/rdf-schema#label") || section);
                    continue;
                }
                const res = one(c, RL + "resource");
                if (!res) continue;
                const authorsSeq = one(res, BIBO + "authorList"),
                    names = authorsSeq
                        ? seq(authorsSeq)
                              .map(p => one(p, FOAF + "name"))
                              .filter(Boolean)
                        : v(res, DC + "creator")
                              .map(p => one(p, FOAF + "name") || (p.startsWith("http") || p.startsWith("_:") ? "" : p))
                              .filter(Boolean);
                const t = one(res, DC + "title");
                if (!t) continue;
                const impU = one(c, RL + "importance"),
                    imp = /essential|core|required/i.test(impU)
                        ? "core"
                        : /recommend/i.test(impU)
                          ? "rec"
                          : impU
                            ? "opt"
                            : "";
                out.push({
                    keep: true,
                    section,
                    t,
                    a: names.join(", "),
                    year: (one(res, DC + "date", DC + "issued").match(/\d{4}/) || [""])[0],
                    isbn: one(res, BIBO + "isbn13", BIBO + "isbn10", BIBO + "isbn"),
                    imp,
                });
            }
        };
    walk(list, "");
    return out;
}
// pasted text (copied from a page that couldn't be fetched): one entry per line
function lcParseText(text: string, kind: string): LcRow[] | LcFound {
    const lines = text
        .split(/\r?\n/)
        .map(s =>
            s
                .replace(/^[\s•·*–-]+/, "")
                .replace(/^\d{1,3}[.)]\s+(?=[A-Za-z"'‘“])/, "")
                .trim()
        )
        .filter(Boolean);
    const html =
        "<body>" +
        lines
            .map(l =>
                /^#{1,6}\s|^(year|level|stage|part|semester|term)\b/i.test(l) && l.length < 90
                    ? `<h3>${escHTML(l.replace(/^#+\s*/, ""))}</h3>`
                    : `<p>${escHTML(l)}</p>`
            )
            .join("") +
        "</body>";
    const doc = new DOMParser().parseFromString(html, "text/html");
    return kind === "modules" ? lcParseModules(doc) : kind === "readings" ? lcParseReadings(doc) : lcGuess(doc);
}
const HTML_ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const escHTML = (s: string) => String(s).replace(/[&<>]/g, c => HTML_ESC[c]);
function lcGuess(doc: Document): LcFound {
    const M = lcParseModules(doc),
        R = lcParseReadings(doc);
    return M.length >= 3 && M.length >= R.length / 2 ? { kind: "modules", rows: M } : { kind: "readings", rows: R };
}

// ── fetching: straight from the site when it allows it, else through /api (your site's, or your own proxy) ──
function lcVia(u: string): string[] {
    const out: string[] = [],
        b = pxBase(),
        px = b ? pxURL("page", "", { u }) : null;
    // this site's own /api first (with your proxy password if your proxy is this site), then your own proxy elsewhere
    if (/^https?:$/.test(location.protocol))
        out.push(
            b && b.origin === location.origin && px ? px : location.origin + "/api/page?u=" + encodeURIComponent(u)
        );
    if (px && !out.includes(px)) out.push(px);
    return out;
}
async function lcGet(u: string): Promise<{ text: string; type: string }> {
    try {
        const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
        if (r.ok) return { text: await r.text(), type: r.headers.get("content-type") || "" };
    } catch (_) {}
    let err = "unreachable";
    for (const via of lcVia(u)) {
        try {
            const r = await fetch(via, { signal: AbortSignal.timeout(20000) });
            // the proxy hands pages back as plain text, with their real type beside it
            if (r.ok)
                return {
                    text: await r.text(),
                    type: r.headers.get("x-page-type") || r.headers.get("content-type") || "",
                };
            err =
                r.status === 403
                    ? "not-allowed"
                    : r.status === 404 && /\/api\//.test(via)
                      ? "unreachable"
                      : "HTTP " + r.status;
        } catch (_) {}
    }
    throw new Error(err);
}
const lcTalisJSON = (u: string): string | null => {
    try {
        const x = new URL(u);
        return /(^|\.)rl\.talis\.com$|talisaspire\.com$/.test(x.hostname) && /\/lists\/[0-9a-f-]{20,}/i.test(x.pathname)
            ? x.origin + x.pathname.replace(/\.(html|json)$/i, "").replace(/\/+$/, "") + ".json"
            : null;
    } catch (_) {
        return null;
    }
};
async function lcRead(u: string, kind: string): Promise<LcFound> {
    const tj = kind !== "modules" && lcTalisJSON(u);
    if (tj) {
        try {
            const r = await lcGet(tj);
            const rows = lcParseTalis(safeJSON(r.text));
            if (rows.length) return { kind: "readings", rows, how: "Talis Aspire" };
        } catch (_) {}
    }
    const r = await lcGet(u);
    if (/json/.test(r.type) || /^\s*\{/.test(r.text)) {
        try {
            const rows = lcParseTalis(safeJSON(r.text));
            if (rows.length) return { kind: "readings", rows, how: "Talis Aspire" };
        } catch (_) {}
    }
    const doc = new DOMParser().parseFromString(r.text, "text/html");
    if (kind === "modules") return { kind, rows: lcParseModules(doc) };
    if (kind === "readings") return { kind, rows: lcParseReadings(doc) };
    return lcGuess(doc);
}

/** the text fields of a row, which its table can change */
export const ROW_TEXT = ["stage", "code", "name", "credits", "section", "t", "a", "year", "imp"] as const;
export type RowText = (typeof ROW_TEXT)[number];
/** the fetch dialog: where it was opened from (a pathway, one of its modules, or a course's Curricula), the link, and
 * what was found */
export interface LcImportModal extends Modal {
    pid?: string;
    mid?: string;
    cur?: string;
    url?: string;
    want?: string;
    found?: string;
    how?: string;
    rows?: LcRow[];
    paste?: boolean;
    uni?: string;
    pname?: string;
    into?: string;
    chain?: boolean;
    toLib?: boolean;
}
export const isLcImportModal = (m: Modal | null): m is LcImportModal =>
    !!m && m.kind === "lcimport" && (m.rows === undefined || Array.isArray(m.rows));
/** the dialog this fetch is for catches up, if it's still the one open (focus: and focus moves into it, for a new step) */
const redraw = (m: Modal, focus?: boolean) => {
    if (ui.modal === m) renderOverlay(focus);
};
/** fetch the link and read what's there (modules or readings): the next step shows it to check, or says why not */
export function lcFetch(m: LcImportModal, url: string) {
    const P = m.cur ? null : PWS().find(p => p.id === m.pid),
        u = url.trim();
    m.url = u;
    m.err = "";
    if (!/^https?:\/\//i.test(u)) {
        m.err = "Paste a full link, starting with https://";
        redraw(m);
        return;
    }
    m.busy = true;
    redraw(m);
    lcRead(u, m.mid ? "readings" : m.want || "auto")
        .then(r => {
            m.busy = false;
            m.step = "review";
            m.found = r.kind;
            m.rows = r.rows;
            m.how = r.how || "";
            if (P && !P.url && r.kind === "modules") P.url = u;
            redraw(m, true);
        })
        .catch(e => {
            const why = errMessage(e);
            m.busy = false;
            m.paste = true;
            m.err =
                why === "not-allowed"
                    ? "That site isn't a university or reading-list site this can reach. Paste its text below instead."
                    : why === "unreachable"
                      ? "Couldn't reach it from here (the site may block it, or this copy has no /api). Paste its text below instead."
                      : "Couldn't read it (" + why + "). Paste its text below instead.";
            redraw(m);
        });
}
/** read pasted text instead of a page */
export function lcPaste(m: LcImportModal, text: string) {
    const tx = text.trim();
    m.text = tx;
    if (!tx) return;
    const r = lcParseText(tx, m.mid ? "readings" : m.want || "auto"),
        rows = Array.isArray(r) ? r : r.rows;
    m.step = "review";
    m.found = Array.isArray(r) ? (m.mid ? "readings" : m.want) : r.kind;
    m.rows = rows;
    m.how = "pasted";
    redraw(m, true);
}
/** save what was kept: modules (into stages, an existing module of the same code updated), readings (into a module,
 *  one per section, or none; in order if asked; into your library too if asked), or, for Curricula, a programme */
/** the sections a reading list's rows came in (its weeks, its parts), in order */
export const lcSections = (R: LcRow[]) => [...new Set(R.map(r => r.section).filter(Boolean))];
export function lcSave(m: LcImportModal) {
    const P = m.cur ? null : PWS().find(p => p.id === m.pid);
    const R = (m.rows || []).filter(r => r.keep);
    let note = "";
    if (m.cur) {
        if (m.found !== "modules") {
            toast("That looks like a reading list: add programmes from a module list.");
            return;
        }
        const n = uniAddProgramme(m.cur, {
            uni: m.uni || "",
            name: m.pname || "Programme",
            url: m.url || "",
            modules: R.map(r => ({ name: r.name || "", code: r.code, core: r.core !== false })),
        });
        closeModal();
        ui.uniSub = m.cur;
        renderMain();
        toast(`Added ${m.uni || "the programme"}: ${plural(n, "module")}`);
        return;
    }
    if (!P) return;
    if (m.found === "modules") {
        const stages = (P.stages ||= []),
            modules = (P.modules ||= []);
        for (const r of R) {
            let sid = "";
            if (r.stage) {
                const name = r.stage;
                let s = stages.find(x => norm(x.name) === norm(name));
                if (!s) {
                    s = { id: acId(), name };
                    stages.push(s);
                }
                sid = s.id;
            }
            const same = r.code && modules.find(x => x.code && norm(x.code) === norm(r.code));
            if (same)
                Object.assign(same, {
                    name: r.name || same.name,
                    credits: r.credits || same.credits,
                    core: r.core !== false,
                    stage: sid || same.stage,
                });
            else
                modules.push({
                    id: acId(),
                    stage: sid,
                    code: r.code || "",
                    name: r.name || "",
                    credits: r.credits || "",
                    core: r.core !== false,
                });
        }
        note = `Added ${plural(R.length, "module")}`;
    } else {
        const into = m.mid || (m.into ?? (lcSections(m.rows || []).length ? "@sections" : "")),
            chain = m.chain !== false,
            toLib = !!m.toLib,
            S = lcSub(P.sub),
            modules = (P.modules ||= []);
        const secMod: Record<string, string> = {},
            modFor = (r: LcRow) => {
                if (into !== "@sections") return into;
                const n = r.section || "Readings";
                if (!secMod[n]) {
                    const ex = modules.find(x => norm(x.name) === norm(n));
                    if (ex) secMod[n] = ex.id;
                    else {
                        const made: PathModule = {
                            id: acId(),
                            stage: "",
                            code: "",
                            name: n,
                            credits: "",
                            core: true,
                        };
                        modules.push(made);
                        secMod[n] = made.id;
                    }
                }
                return secMod[n];
            };
        const prev: Record<string, string> = {};
        for (const r of R) {
            const mid = modFor(r),
                id = "b" + acId();
            const b: PathBook = {
                id,
                t: r.t || "",
                a: r.a || "",
                year: r.year || "",
                isbn: r.isbn || "",
                th: "",
                mod: mid,
                st: "todo",
                note: "",
                opt: r.imp === "opt" || undefined,
                after: chain && prev[mid] ? [{ k: prev[mid], s: "start" }] : [],
            };
            P.books.push(b);
            prev[mid] = id;
            if (toLib && !pwLib(b)) {
                b.lib = addItem(
                    {
                        medium: "book",
                        kind: "Academic",
                        title: b.t,
                        creator: b.a,
                        year: Number(b.year) || undefined,
                        isbn: b.isbn || undefined,
                        subject: S ? S.name : "",
                        status: "want",
                    },
                    "Add " + b.t
                );
            }
        }
        note = `Added ${plural(R.length, "reading")}`;
        if (toLib) setTimeout(() => autoCovers(), 400);
    }
    markDirty();
    closeModal();
    ui.pwId = P.id;
    P.view = "modules";
    renderMain();
    toast(note);
}
