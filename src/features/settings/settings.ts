// src/features/settings/settings.ts
// ─────────────────────────────────────────────────────────────────
//  Settings: the section list, and what the Svelte sections share with the older code
//
//  The page and every section are Svelte (Settings.svelte and sections/, beside this file). What stays here: the list
//  of sections (the a11y sweep walks it too), what the sections work out (a mode's grid of media and types, read back
//  when a box in it is ticked; the theme list; the keys' descriptions), and the private collection's own handlers,
//  which keep its settings sealed inside it.
// ─────────────────────────────────────────────────────────────────

import {
    $,
    asField,
    closestTo,
    items,
    KINDS,
    matchPats,
    MEDIA,
    MEDIA_KEYS,
    meta,
    plural,
    scheduleSave,
    SEALED_MODE,
    toast,
    ui,
    vault,
} from "../core/core";
import { UNIVERLIST_WORKER } from "../sources/proxy";
import { afterRenderHooks, renderMain, renderSide } from "../core/shell";
import { builtinOn } from "../extensions/builtins";
import { editingMode, modeChanged } from "./handlers";
import { sweepSealed } from "../core/actions";
import type { Theme } from "../core/model";

const SET_SECS_ALL: [string, string][] = [
    ["general", "General"],
    ["account", "Account & sync"],
    ["library", "Library"],
    ["appearance", "Appearance"],
    ["backdrops", "Backdrops (beta)"],
    ["modes", "Modes"],
    ["data", "Data, sources & keys"],
    ["privacy", "Private collection"],
    ["ext", "Extensions"],
    ["keys", "Keybinds"],
    ["tags", "Tags"],
    ["advanced", "Advanced"],
];
// the sections (Settings.svelte draws them). Account & sync shows unless switched off;
// Backdrops (src/features/backdrops) once the Backdrop builder is switched on
export const setSecs = () =>
    SET_SECS_ALL.filter(
        ([k]) => (k !== "account" || builtinOn("account")) && (k !== "backdrops" || builtinOn("backdrops"))
    );
export const SET_ALIAS: Record<string, string> = {
    themes: "appearance",
    layout: "library",
    io: "data",
    imports: "data",
    export: "data",
    ratings: "general",
};
// ── Modes: the media-and-type grids (sections/Modes.svelte draws them; events.ts reads them back) ──
export function kindToggles(match: string[], medium: string): [kind: string, on: boolean][] {
    return ["", ...KINDS[medium]].map(k => [k, matchPats({ medium, kind: k }, match)]);
}
/** a box in a mode's or a shelf's grid of media and types (settings/parts/Matrix.svelte) ticked or unticked: the
 *  grid as it was (match, the media it lists) with that box changed, read back as what it shows. A medium with
 *  every type ticked is the medium; otherwise each ticked type; nothing ticked is "__none". */
export function matrixRead(match: string[], media: readonly string[], medium: string, kind: string, on: boolean) {
    const pats: string[] = [];
    for (const m of MEDIA_KEYS) {
        if (!media.includes(m)) continue;
        const boxes = kindToggles(match, m).map(
                ([k, v]) => [k, m === medium && (kind === "*" || k === kind) ? on : v] as const
            ),
            ticked = boxes.filter(x => x[1]).map(x => x[0]);
        if (ticked.length === boxes.length) pats.push(m);
        else for (const k of ticked) pats.push(m + ":" + k);
    }
    return pats.length ? pats : ["__none"];
}
/** …and saved: the mode's own grid ("mode"), or one of its shelves' ("shelf" and its place), which stays open */
export function matrixTick(prefix: string, pats: string[]) {
    const md = editingMode();
    if (prefix === "mode") md.match = pats;
    else {
        const i = Number(prefix.slice(5)),
            shelf = Array.isArray(md.shelves) ? md.shelves[i] : undefined;
        if (shelf) {
            shelf.match = pats;
            ui.openShelf = i;
        }
    }
    ui.shelfKey = null;
    modeChanged();
}
export const themeList = (): [string, Theme][] => Object.entries(meta.themes || {}).filter(([, t]) => !t.hidden);
export const themeOpts = (): [string, string][] => themeList().map(([k, t]) => [k, t.name || k]);
export function describePats(p: string[] | undefined) {
    const out: string[] = [],
        neg: string[] = [];
    for (const x of p || []) {
        if (x === "*") {
            out.push("everything");
            continue;
        }
        if (x === "__none") continue;
        const n = x.startsWith("!"),
            [m, k] = (n ? x.slice(1) : x).split(":");
        const name = (MEDIA[m] || { name: m }).name + (k !== undefined ? ": " + (k || "no type") : "");
        (n ? neg : out).push(name);
    }
    return (out.join(", ") || "nothing") + (neg.length ? " (except " + neg.join(", ") + ")" : "");
}
export const editThemeId = (): string => {
    const themes = meta.themes || {},
        mine = editingMode().theme;
    return ui.editTheme && themes[ui.editTheme] ? ui.editTheme : mine && themes[mine] ? mine : themeList()[0][0];
};
// ── Data, sources & keys: what each free key is for, and where to get it (sections/Data.svelte) ──
/** each key: its name, what it's for, where to get it, and how */
export const KEY_INFO: Record<string, [name: string, what: string, where: string, how: string]> = {
    tmdb: [
        "TMDB",
        "Film and TV: posters, casts, recommendations and the best matches.",
        "https://www.themoviedb.org/settings/api",
        "Free account, then Settings → API. The short API key or the long read access token both work.",
    ],
    omdb: [
        "OMDb",
        "IMDb, Rotten Tomatoes and Metacritic scores for films and shows (1,000 lookups a day).",
        "https://www.omdbapi.com/apikey.aspx",
        "Pick the free tier; the key arrives by email.",
    ],
    rawg: [
        "RAWG",
        "Games: covers, Metacritic, time to beat, genres and platforms.",
        "https://rawg.io/apidocs",
        "Free account, then Get API key.",
    ],
    igdb: [
        "Your proxy",
        "One free Cloudflare Worker of your own for the databases that only answer servers: IGDB (games the way Backloggd has them: covers, characters, platforms, time to beat), SteamGridDB (every cover people have made for a game), TheGamesDB and ScreenScraper (the real box for each platform, and real spines), Comic Vine (every issue's cover) and Hardcover (book editions). Add only the keys you want.",
        "https://api-docs.igdb.com/#account-creation",
        "Put the script below into a free Cloudflare Worker, add the keys as its secrets, then paste the Worker's address here.",
    ],
};
// every picture the app shows, so they can be saved for offline and packed into the .zip
export function offlineTargets(): string[] {
    const out = new Set<string>(),
        add = (u: unknown) => {
            if (typeof u === "string" && /^https:/.test(u)) out.add(u);
        };
    for (const b of items.values()) {
        add(b.cover);
        add(b.banner);
        add(b.favArt);
    }
    for (const c of meta.chars) add(c.image || c.alImage);
    for (const p of meta.people || []) add(p.image);
    const pr = meta.profile;
    add(pr.avatar);
    add(pr.banner);
    if (pr.anilist) {
        add(pr.anilist.avatar);
        add(pr.anilist.banner);
    }
    for (const m of meta.modes) {
        const mp = m.profile || {};
        add(mp.banner);
        add(mp.avatar);
    }
    return [...out];
}

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initSettings() {
    // the shelves-as-rows look, kept in step with the settings on every render
    afterRenderHooks.push(() => {
        document.body.classList.toggle("shelfrows", !!meta.layout?.shelfRows);
    });
    // ----- the private collection's own settings (sections/Privacy.svelte draws them): stored encrypted inside it, never in
    // the app or a backup in the clear -----
    document.addEventListener("change", e => {
        const t = asField(e.target);
        if (!t || !vault.key || !vault.prefs) return;
        if (t.id === "sp-name") {
            SEALED_MODE.name = t.value.trim() || "Private";
            vault.sealDue = true;
            scheduleSave();
            renderSide();
        }
        if (t.dataset.spkind) {
            const m = t.dataset.spkind,
                v = t.value.trim();
            if (!v) return;
            const L = (vault.prefs.kinds[m] = vault.prefs.kinds[m] || []);
            if (!L.includes(v)) L.push(v);
            vault.sealDue = true;
            const n = sweepSealed();
            scheduleSave();
            renderMain();
            if (n) toast(`Moved ${plural(n, "entry", "entries")} in here`);
        }
    });
    document.addEventListener("click", e => {
        const t = closestTo(e, "[data-act]");
        if (!t || !vault.key || !vault.prefs) return;
        const a = t.dataset.act;
        if (a === "sp-kind-del") {
            const L = vault.prefs.kinds[t.dataset.k || ""] || [];
            L.splice(Number(t.dataset.i), 1);
            vault.sealDue = true;
            scheduleSave();
            renderMain();
        }
        if (a === "sp-link-del") {
            vault.prefs.links.splice(Number(t.dataset.i), 1);
            vault.sealDue = true;
            scheduleSave();
            renderMain();
        }
        if (a === "sp-link-add") {
            const name = $<HTMLInputElement>("#sp-lname")!.value.trim(),
                url = $<HTMLInputElement>("#sp-lurl")!.value.trim();
            if (!name || !/^https:\/\//.test(url)) {
                toast("Give it a name and an https:// address");
                return;
            }
            vault.prefs.links.push({ name, url: url.includes("{q}") ? url : url + "{q}" });
            vault.sealDue = true;
            scheduleSave();
            renderMain();
        }
    });
    document.addEventListener("click", async e => {
        const t = closestTo(e, '[data-act="igdb-copy"]');
        if (!t) return;
        try {
            await navigator.clipboard.writeText(UNIVERLIST_WORKER);
            toast("Copied");
        } catch (_) {
            toast("Select the script and copy it");
        }
    });
}
