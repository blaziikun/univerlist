// src/features/core/events.ts
// ─────────────────────────────────────────────────────────────────
//  Events: one listener per kind of event, for the whole page
//
//  Clicks are matched to a button with data-act and handed to actOn() (core/actions.ts); typing, changes, keys,
//  pictures dropped or pasted in, and pictures that won't load are handled here, and the app starts at the end.
//  (Dragging things into place is each page's own: lists/reorder.svelte.ts, the library page, tier lists, the tabs.)
// ─────────────────────────────────────────────────────────────────

import {
    $,
    $$,
    asField,
    boot,
    bootFresh,
    change,
    changeMeta,
    clone,
    closestTo,
    coverCache,
    entryOf,
    errName,
    fileSync,
    findExisting,
    isRecord,
    isStatus,
    items,
    listOf,
    markDirty,
    meta,
    migrateItem,
    modeById,
    newId,
    norm,
    nowISO,
    patch,
    plural,
    scheduleSave,
    sleep,
    ticked,
    titleOf,
    toast,
    ui,
    undo,
} from "./core";
import { applyTheme, validHex } from "./theme";
import { allArt, refreshItem } from "../sources/sources";
import { loadSiteShares } from "../sources/proxy";
import { ensureTag, runAniListSync } from "../sources/anilist";
import {
    auto,
    autoCovers,
    cacheAndColour,
    coverSrc,
    fetchArt,
    refreshAiring,
    scoreQ,
    updateItemTiles,
} from "../sources/covers";
import { until } from "./views";
import { hasAnimanga, renderMain, renderSide, renderSideStatus, renderTop } from "./shell";
import { shellChanged } from "./shell/shell-state.svelte";
import { FILT_EMPTY } from "../library/library";
import { editThemeId } from "../settings/settings";
import { closeModal, openModal, renderOverlay } from "./modals";
import { folderSync, loadHosted } from "../import-export/packs";
import { ambApply } from "../look/ambience";
import { W } from "../watch-read/watch";
import { RD } from "../watch-read/read";
import { focusSearch } from "./search";
import { closeCtx, runKey } from "./keys";
import { placeRestore, restoredPlace, tabOnEnter } from "./tabs";
import {
    afterChange,
    applyDensity,
    closeSettings,
    goSettings,
    render,
    savePrefs,
    setMode,
    toggleSide,
} from "./navigation";
import { newListId, openItem, patchChar, savePerson, stepItem, toggleFav } from "../library/item-actions";
import { editingMode, modeChanged, setThemeVal } from "../settings/handlers";
import { actOn, handleImportFile, seqFrom } from "./actions";
import type { FavPerson, ImportPreview, Item } from "./model";

// ═══════════════════════════════════════════
//  CLICKS
// ═══════════════════════════════════════════
// which picture a chosen image file is for (set by the button that opened the file picker)
let pendingCover: string | null = null;
export function setPendingCover(v: string | null) {
    pendingCover = v;
}
/** an entry an import brings: what the file says about it, checked by migrateItem() when it's added */
type Incoming = Record<string, unknown> & { title?: unknown; medium?: unknown; tags?: unknown };
/** a list an import brings (Letterboxd's lists) */
interface IncomingList {
    name: string;
    desc?: string;
    numbered?: boolean;
    entries: { title: string; year?: number; note?: string }[];
}
// imports from any source: existing entries are updated, never duplicated; the whole import can be undone
export function runImport(p: ImportPreview, { bookKind = "Novel" } = {}) {
    const list: Incoming[] = p.items || [];
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    const plan: { x: Incoming; id: string | null; newId?: string }[] = list.map(x => ({
        x,
        id: findExisting(x.title, x.creator, text(x.medium) || undefined, isRecord(x.ext) ? x.ext : undefined),
    }));
    const newIds: string[] = [];
    for (const q of plan)
        if (!q.id) q.newId = newId(text(q.x.title), text(q.x.medium)) + "-" + Math.random().toString(36).slice(2, 5);
    for (const q of plan) for (const tg of listOf(q.x.tags)) ensureTag(String(tg));
    const mb = { lists: clone(meta.lists) };
    for (const l of (p.lists || []).filter(isIncomingList)) {
        const ids = l.entries
            .map(e => {
                const q = plan.find(
                    q => norm(q.x.title) === norm(e.title) && (!e.year || !q.x.year || q.x.year === e.year)
                );
                return q ? q.id || q.newId : findExisting(e.title, "", "film");
            })
            .filter((x): x is string => !!x);
        meta.lists = [
            ...meta.lists,
            {
                id: newListId(),
                name: l.name,
                desc: l.desc || "From Letterboxd",
                numbered: !!l.numbered,
                mode: "",
                ids: [...new Set(ids)],
                notes: Object.fromEntries(
                    l.entries
                        .filter(e => e.note)
                        .map(e => {
                            const q = plan.find(q => norm(q.x.title) === norm(e.title));
                            return [q ? q.id || q.newId : "", e.note];
                        })
                        .filter(x => x[0])
                ),
                created: nowISO(),
            },
        ];
    }
    change(
        `Import ${list.length} from ${p.kind}`,
        plan.map(q => q.id || q.newId || ""),
        (b, id) => {
            const q = plan.find(r => (r.id || r.newId) === id);
            if (!q) return undefined;
            const x = q.x;
            if (b) {
                // what the file says is taken only where it's the right kind of value: the rest of the entry is yours
                const u: Item = { ...b };
                if (typeof x.rating === "number" && x.rating && !b.rating) {
                    u.rating = x.rating;
                    if (typeof x.scale === "string" && x.scale && !b.scale) u.scale = x.scale;
                }
                if (isStatus(x.status) && (b.status === "want" || x.status === "done")) u.status = x.status;
                for (const f of ["finishedAt", "startedAt", "year", "total", "isbn", "runtime", "kind", "creator"])
                    if (x[f] && !b[f]) u[f] = x[f];
                if (typeof x.copy === "string" && x.copy && x.copy !== "none" && b.copy === "none") u.copy = x.copy;
                if (typeof x.repeat === "number" && x.repeat > (b.repeat || 0)) u.repeat = x.repeat;
                if (Array.isArray(x.log) && x.log.length && !(b.log || []).length) u.log = x.log;
                if (typeof x.prog === "number" && x.prog > (b.prog || 0)) u.prog = x.prog;
                u.tags = [...new Set([...(b.tags || []), ...listOf(x.tags).map(String)])];
                u.genres = [...new Set([...(b.genres || []), ...listOf(x.genres).map(String)])];
                u.ext = { ...(isRecord(x.ext) ? x.ext : {}), ...(b.ext || {}) };
                u.scores = { ...(isRecord(x.scores) ? numbersIn(x.scores) : {}), ...(b.scores || {}) };
                if (typeof x.cover === "string" && x.cover && !b.cover && !b.coverData) u.cover = x.cover;
                if (typeof x.notes === "string" && x.notes && !String(b.notes || "").includes(x.notes))
                    u.notes = [b.notes, x.notes].filter(Boolean).join("\n\n");
                return u;
            }
            newIds.push(id);
            const obj: Record<string, unknown> = { ...x, source: p.kind };
            if (!obj.kind) obj.kind = obj.medium === "book" ? bookKind : "";
            for (const f of Object.keys(obj)) if (obj[f] == null || obj[f] === "") delete obj[f];
            return migrateItem(obj);
        },
        { metaBefore: mb }
    );
    closeModal();
    toast(`Imported ${list.length}${(p.lists || []).length ? " and " + plural((p.lists || []).length, "list") : ""}`, {
        label: "Undo",
        fn: undo,
    });
    setTimeout(() => autoCovers(newIds), 400);
}
const isIncomingList = (l: unknown): l is IncomingList =>
    isRecord(l) && Array.isArray(l.entries) && l.entries.every(e => isRecord(e) && typeof e.title === "string");
/** the numbers in an object (a file's scores, by site) */
const numbersIn = (o: Record<string, unknown>): Record<string, number> =>
    Object.fromEntries(Object.entries(o).filter((e): e is [string, number] => typeof e[1] === "number"));
export async function runRefresh() {
    const m = ui.modal;
    if (!m) return;
    m.scope = m.scope || "missing"; // chosen in the dialog (sources/dialogs/RefreshArt.svelte)
    if (auto.running) {
        auto.paused = true;
        await sleep(400);
    }
    scoreQ.stop();
    const ids = [...items.entries()]
        .filter(([, b]) =>
            m.scope === "scores"
                ? b.medium !== "book"
                : m.scope === "books"
                  ? b.medium === "book" && !b.coverData && !b.coverPicked
                  : !coverSrc(b)
        )
        .map(([i]) => i);
    const ctl = new AbortController();
    Object.assign(m, { running: true, finished: false, total: ids.length, error: "", ctl });
    let done = (m.done = 0),
        found = (m.found = 0);
    renderOverlay();
    let fails = 0;
    for (const bid of ids) {
        if (ctl.signal.aborted) break;
        const b = items.get(bid);
        if (!b) {
            m.done = ++done;
            continue;
        }
        m.current = titleOf(b);
        renderOverlay();
        try {
            if (m.scope === "scores") {
                await refreshItem(bid, ctl.signal);
                m.found = ++found;
            } else if (await fetchArt(bid, ctl.signal, m.scope === "books")) {
                m.found = ++found;
                await cacheAndColour(bid, ctl.signal);
                updateItemTiles(bid);
            }
            fails = 0;
        } catch (err) {
            if (errName(err) === "AbortError") break;
            if (++fails >= 5) {
                m.error = "The sources aren't responding. Try again later.";
                break;
            }
        }
        m.done = ++done;
        if (done % 8 === 0) scheduleSave();
        await sleep(220);
    }
    scheduleSave();
    m.running = false;
    m.finished = !m.error;
    m.current = "";
    auto.paused = false;
    scoreQ.stopped = false;
    afterChange();
}

// ═══════════════════════════════════════════
//  INPUTS
// ═══════════════════════════════════════════
const THEME_NUM = new Set(["bgAmt", "glow", "fsTitle", "ls", "fs", "radius", "cover", "gap", "wHead", "wUi"]);
export const themeFmt = (k: string, v: unknown): string =>
    ["bgAmt", "glow"].includes(k)
        ? Math.round(Number(v) * 100) + "%"
        : k === "ls"
          ? Number(v).toFixed(2) + "em"
          : v + "px";

// pictures from files or the clipboard
async function useImageFile(f: File) {
    try {
        const target = pendingCover,
            m = ui.modal;
        const gif =
            f.type === "image/gif" &&
            ["avatar", "banner", "char", "person", "fav"].includes(target || "") &&
            f.size < 8e6;
        const data = gif
            ? await new Promise<string>((res, rej) => {
                  const r = new FileReader();
                  r.onload = () => res(String(r.result));
                  r.onerror = rej;
                  r.readAsDataURL(f);
              })
            : await fileToJpeg(f, target === "banner" ? 3200 : target === "avatar" || target === "char" ? 900 : 1000);
        if (target === "add" && m && m.kind === "add") {
            m.coverData = data;
            renderOverlay();
        } else if (target === "char" && m && m.kind === "char") {
            const c = meta.chars.find(x => x.id === m.id);
            patchChar(m.id || "", { imageData: data, uploads: [...((c && c.uploads) || []), data] }, "Upload picture");
        } else if (target === "fav" && m && m.kind === "favedit")
            patch(m.id || "", { favArtData: data }, "Favourite picture");
        else if (target === "person" && m && m.kind === "person") {
            savePerson(m.name, (p: FavPerson) => ({ ...p, imageData: data }), "Upload picture");
            renderOverlay();
        } else if (target === "avatar") {
            const mode = modeById((m && m.mode) || ui.mode);
            if (mode.id === "universal") changeMeta("Upload picture", "profile", p => ({ ...p, avatarData: data }));
            else {
                mode.profile = { ...(mode.profile || {}), avatarData: data };
                modeChanged();
            }
            renderOverlay();
        } else if (target === "banner") {
            const mode = modeById((m && m.mode) || ui.mode);
            if (mode.id === "universal") changeMeta("Upload banner", "profile", p => ({ ...p, bannerData: data }));
            else {
                mode.profile = { ...(mode.profile || {}), bannerData: data };
                modeChanged();
                renderOverlay();
            }
        } else if (target === "spine" && m && m.kind === "item") {
            patch(m.id || "", { spineArt: data, spinePicked: true }, "Upload spine");
            toast("Spine changed", { label: "Undo", fn: undo });
        } else if (m && m.kind === "coverpick") {
            const i = m.i || 0,
                id = (m.queue || [])[i];
            patch(
                id,
                { coverData: data, coverColor: null, color: null, coverPicked: true },
                "Use your picture as the cover"
            );
            m.picked = (m.picked || 0) + 1;
            m.i = i + 1;
            renderOverlay();
            coverPickLoad();
        } else if (m && m.kind === "item") {
            const mid = m.id || "";
            patch(
                mid,
                { coverData: data, coverColor: null, color: null, coverPicked: true },
                "Use your picture as the cover"
            );
            cacheAndColour(mid).then(() => {
                updateItemTiles(mid);
                scheduleSave();
            });
            toast("Cover updated", { label: "Undo", fn: undo });
        }
    } catch (_) {
        toast("That image couldn't be read.");
    }
}
function fileToJpeg(file: File, max: number): Promise<string> {
    return createImageBitmap(file).then(bmp => {
        const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * k);
        c.height = Math.round(bmp.height * k);
        c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", 0.9);
    });
}

export function setCover(id: string, url: string) {
    patch(
        id,
        { cover: url, coverData: null, coverChecked: true, coverColor: null, color: null, coverPicked: true },
        "Change cover"
    );
    cacheAndColour(id).then(() => {
        updateItemTiles(id);
        scheduleSave();
    });
}
export async function coverPickLoad() {
    const m = ui.modal;
    if (!m || m.kind !== "coverpick") return;
    const queue = m.queue || [],
        cands = (m.cands = m.cands || {}),
        at = m.i || 0;
    for (const id of queue.slice(at, at + 3)) {
        const b = entryOf(id);
        if (cands[id] !== undefined || !b) continue;
        cands[id] = null;
        try {
            cands[id] = (await allArt(b)).covers.filter(c => !c.wide);
        } catch (_) {
            cands[id] = [];
        }
        if (ui.modal === m && queue[m.i || 0] === id) renderOverlay();
    }
}
// this page was opened from a "Sign in on another device" code: main.ts says so, and the start-up below acts on it
let joining = false;
// the app's own start-up has finished: main.ts asks, for a sign-in link that arrives after it (and the test hook, for
// the browser tests to wait on)
let booted = false;
export const isBooted = () => booted;
export function joinOnStart() {
    joining = true;
}
// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initEvents() {
    // ═══════════════════════════════════════════
    //  CLICKS
    // ═══════════════════════════════════════════
    document.addEventListener("click", async e => {
        // a button: HTML, or an SVG element in a chart
        const t = closestTo<HTMLElement | SVGElement>(e, "[data-act]");
        if (!t || t.tagName === "A") return;
        if (t instanceof HTMLInputElement && t.type === "checkbox") return;
        if (t.closest("summary")) e.preventDefault(); // a button on a folding row acts, it does not fold the row
        const act = t.dataset.act || "",
            k = t.dataset.k,
            id = t.dataset.id,
            m = ui.modal;
        if (t.closest("svg") && act === "open") {
            openItem(id || "", seqFrom(t));
            return;
        }
        await actOn(e, t, act, k, id, m);
    });
    // ═══════════════════════════════════════════
    //  INPUTS
    // ═══════════════════════════════════════════
    document.addEventListener("input", e => {
        const t = asField(e.target);
        if (!t) return;
        // the backup passphrase is remembered while the page is open (in memory only, never saved), so redrawing the page doesn't empty the box
        if (t.id === "q") {
            ui.q = t.value;
            if (ui.page !== "profile" || ui.tab !== "library") {
                ui.page = "profile";
                ui.tab = "library";
                ui.viewId = null;
                ui.shelfKey = null;
                ui.status = "all";
            }
            renderMain();
        }
        // live styling: colours and sliders apply as you drag
        if (t.dataset.theme !== undefined && (t.type === "range" || t.type === "color")) {
            const k = t.dataset.theme,
                v = THEME_NUM.has(k) ? parseFloat(t.value) : t.value;
            setThemeVal(k, v);
            if (t.type === "range" && t.nextElementSibling) t.nextElementSibling.textContent = themeFmt(k, v);
            if (t.type === "color") {
                const h = asField(document.querySelector(`[data-themehex="${k}"]`));
                if (h) h.value = t.value;
            }
        }
        if (t.id === "side-w") {
            const w = +t.value;
            meta.layout.side.width = w;
            $("#app")!.style.setProperty("--side-w", w + "px");
            if (t.nextElementSibling) t.nextElementSibling.textContent = w + "px";
            markDirty();
        }
        if (t.id === "set-appname") {
            meta.settings.appName = t.value.trim() || "UniverList";
            document.title = meta.settings.appName;
            markDirty();
            renderTop();
        }
    });
    document.addEventListener("change", e => {
        const t = asField(e.target),
            m = ui.modal,
            // the entry, character or person the open dialog is about
            mid = m?.id || "";
        if (!t) return;
        // library and tabs
        if (t.id === "mode-sel") setMode(t.value);
        if (t.id === "set-backupkeys") {
            meta.settings.backupKeys = ticked(t);
            markDirty();
        }
        if (t.id === "exp-lists") {
            ui.exp = { ...(ui.exp || {}), lists: t.value };
        }
        if (t.id === "set-proxy") {
            meta.settings.imageProxy = ticked(t);
            coverCache.blocked = false;
            markDirty();
        }
        if (t.id === "cp-scope") {
            ui.cpScope = t.value;
        }
        if (t.id === "set-links") {
            meta.settings.showLinks = ticked(t);
            markDirty();
        }
        if (t.id === "theme-name") {
            const tid = editThemeId();
            if (meta.themes) meta.themes[tid] = { ...meta.themes[tid], name: t.value.trim() || tid };
            markDirty();
            renderMain();
        }
        if (t.id === "f-copy") {
            ui.copy = t.value;
            ui.viewId = null;
            savePrefs();
            renderMain();
        }
        if (t.id === "f-kind") {
            ui.kind = t.value || null;
            renderMain();
        }
        if (t.id === "f-genre") {
            ui.genre = t.value || null;
            renderMain();
        }
        if (t.id === "f-tag") {
            ui.tag = t.value || null;
            renderMain();
            renderSide();
        }
        if (t.id === "stats-year") {
            ui.statsYear = Number(t.value);
            renderMain();
        }
        if (t.id === "fav-group" || t.id === "set-favgroup") {
            meta.layout.favGroup = ticked(t);
            markDirty();
            renderMain();
        }
        if (t.id === "vibe" && m) {
            const v = t.value.trim(),
                b = items.get(mid);
            if (v) ensureTag(v);
            change("Set theme", mid, x =>
                x
                    ? {
                          ...x,
                          vibe: v,
                          tags: [...new Set([...(x.tags || []).filter(g => g !== b?.vibe), ...(v ? [v] : [])])],
                      }
                    : undefined
            );
        }
        if (t.id === "platform" && m) patch(mid, { platform: t.value.trim() }, "Set platform");
        if (t.id === "pg-lane" && m) patch(mid, { lane: t.value }, "Set where you're reading");
        // settings: general
        if (t.id === "set-autosync") {
            meta.settings.autoSync = ticked(t);
            markDirty();
        }
        if (t.id === "set-lb") {
            meta.settings.letterboxdUser = t.value.trim();
            markDirty();
        }
        if (t.id === "set-sz") {
            meta.settings.serializdUser = t.value.trim();
            markDirty();
            renderMain();
        }
        if (t.id === "set-region") {
            meta.settings.region = t.value.trim().toUpperCase() || "GB";
            markDirty();
        }
        if (t.id === "vault-auto") {
            meta.settings.vaultAuto = Number(t.value);
            markDirty();
        }
        if (t.dataset.speed) {
            const v = parseFloat(t.value);
            if (v > 0) {
                meta.settings.speeds = { ...meta.settings.speeds, [t.dataset.speed]: v };
                markDirty();
            }
        }
        // settings: layout
        if (t.id === "side-start") {
            meta.layout.side.startOpen = ticked(t);
            markDirty();
        }
        // settings: modes
        const md = ui.page === "settings" && (ui.setSec || "general") === "modes" ? editingMode() : null;
        if (md && t.id === "mode-name") {
            md.name = t.value.trim() || md.name;
            modeChanged();
        }
        if (md && t.id === "mode-glyph") {
            md.g = t.value.trim();
            modeChanged();
        }
        if (md && t.id === "mode-bio") {
            md.profile = { ...(md.profile || {}), bio: t.value.trim() };
            markDirty();
        }
        if (md && t.id === "mode-theme") {
            md.theme = t.value;
            if (md.id === ui.mode) applyTheme();
            modeChanged();
        }
        if (md && ["mode-view", "mode-group", "mode-sort"].includes(t.id)) {
            md[t.id.slice(5)] = t.value;
            markDirty();
        }
        if (md && t.dataset.shelfname !== undefined) {
            const s = Array.isArray(md.shelves) ? md.shelves[Number(t.dataset.shelfname)] : undefined;
            if (s) {
                s.name = t.value.trim() || s.name;
                modeChanged();
            }
        }
        // settings: appearance
        if (t.dataset.theme !== undefined && t.tagName === "SELECT") {
            const k = t.dataset.theme;
            setThemeVal(k, THEME_NUM.has(k) ? parseFloat(t.value) : t.value);
            renderMain();
        }
        if (t.dataset.theme !== undefined && (t.type === "range" || t.type === "color")) renderSide();
        if (t.dataset.themehex) {
            const v = t.value.trim().startsWith("#") ? t.value.trim() : "#" + t.value.trim();
            if (validHex(v)) {
                setThemeVal(t.dataset.themehex, v.toLowerCase());
                renderMain();
            } else toast("Use a colour like #1a2b3c");
        }
        if (t.id === "side-w") renderSide();
    });
    document.addEventListener("keydown", e => {
        const typing = /INPUT|TEXTAREA|SELECT/.test(String(document.activeElement && document.activeElement.tagName)),
            m = ui.modal,
            mod = e.metaKey || e.ctrlKey,
            // the element the key was pressed in
            el = e.target instanceof HTMLElement ? e.target : null;
        if (ui.keyCapture) return;
        if (mod && e.key.toLowerCase() === "k") {
            e.preventDefault();
            if (m) closeModal();
            focusSearch();
            return;
        }
        if (e.key === "Escape" && $("#ctx") && !$("#ctx")!.hidden) {
            closeCtx();
            return;
        }
        if (e.key === "Escape" && ui.modeMenu) {
            ui.modeMenu = false;
            shellChanged();
            return;
        }
        if (e.key === "Escape" && ui.pop) {
            ui.pop = null;
            render();
            return;
        }
        if (e.key === "Escape" && $("#app")!.classList.contains("side-peek")) {
            $("#app")!.classList.remove("side-peek");
            return;
        }
        if (e.key === "Escape") {
            if (m) {
                if (m.back) {
                    const b = m.back;
                    ui.modal = null;
                    openModal(b.kind, b);
                } else closeModal();
            } else if (ui.selecting) {
                ui.selecting = false;
                ui.sel.clear();
                renderMain();
            } else if (ui.page === "settings") {
                if (ui.setQ) {
                    ui.setQ = "";
                    renderMain();
                } else closeSettings();
            } else if (ui.page === "watch" && !W.player && W.view === "show") {
                W.view = "home";
                W.show = null;
                ui.wpOpts = false;
                renderMain();
                window.scrollTo(0, 0);
            } else if (ui.page === "read" && !$("#reader") && RD.item) {
                RD.item = null;
                RD.files = [];
                renderMain();
                window.scrollTo(0, 0);
            } else if (window.innerWidth < 860 && meta.layout.side.open) toggleSide(false);
            return;
        }
        const enter = (sel: string, act: string) => {
            if (e.key === "Enter" && el?.id === sel) {
                e.preventDefault();
                $(`[data-act="${act}"]`)?.click();
                return true;
            }
            return false;
        };
        if (e.key === "Enter" && el?.classList.contains("h2in")) {
            e.preventDefault();
            el.blur();
            return;
        }
        if (enter("vp2", "vault-create")) return;
        if (typing) return;
        if (m && m.kind === "coverpick") {
            if (/^[1-9]$/.test(e.key)) $(`[data-act="cp-pick"][data-k="${Number(e.key) - 1}"]`)?.click();
            else if (e.key === "ArrowRight") $('[data-act="cp-next"]')!.click();
            else if (e.key === "ArrowLeft") {
                const b = $<HTMLButtonElement>('[data-act="cp-prev"]');
                if (b && !b.disabled) b.click();
            }
            return;
        }
        if (m && m.kind === "item" && !mod && !e.altKey) {
            if (e.key === "ArrowLeft") {
                stepItem(-1);
                return;
            }
            if (e.key === "ArrowRight") {
                stepItem(1);
                return;
            }
            if (e.key.toLowerCase() === "f" && !e.shiftKey) {
                toggleFav(m.id || "");
                return;
            }
        }
        if (m && !mod) return;
        runKey(e);
    });
    $("#file-cover")!.addEventListener("change", e => {
        if (!(e.target instanceof HTMLInputElement)) return;
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) useImageFile(f);
    });
    document.addEventListener("paste", e => {
        const m = ui.modal;
        if (
            !m ||
            !["item", "add", "char", "favedit", "person"].includes(m.kind) ||
            (m.kind === "add" && m.step !== "review")
        )
            return;
        if (
            /INPUT|TEXTAREA/.test(document.activeElement?.tagName || "") &&
            !(e.clipboardData && [...e.clipboardData.items].some(i => i.type.startsWith("image/")))
        )
            return;
        const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.type.startsWith("image/"));
        if (item) {
            e.preventDefault();
            pendingCover = m.kind === "item" ? "item" : m.kind === "favedit" ? "fav" : m.kind;
            const f = item.getAsFile();
            if (f) useImageFile(f);
        }
    });
    $("#file-import")!.addEventListener("change", async e => {
        if (!(e.target instanceof HTMLInputElement)) return;
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) handleImportFile(f);
    });
    window.addEventListener("online", () => {
        renderMain();
        autoCovers();
    });
    window.addEventListener("offline", () => renderMain());
    document.addEventListener(
        "error",
        e => {
            const img = e.target;
            // a picture Svelte drew deals with its own (library/tiles/Cover.svelte)
            if (!(img instanceof HTMLImageElement) || img.closest("[data-svelte]")) return;
            const src = img.getAttribute("src") || "";
            // a picture that won't load directly gets one more try through the image proxy; its site is remembered so banners and spines use the proxy too
            if (/^https:/.test(src) && !/wsrv\.nl/.test(src) && meta.settings.imageProxy !== false) {
                img.src = coverCache.proxied(src);
                coverCache.learn(src);
                return;
            }
            if (img.parentElement?.classList.contains("cover")) {
                img.parentElement.classList.remove("has-img");
                img.remove();
            }
        },
        true
    );
    // countdowns tick in place; the page itself is never redrawn on a timer (a page Svelte draws ticks its own)
    setInterval(() => {
        for (const el of $$("[data-at]"))
            if (!el.closest("[data-svelte]")) el.textContent = until(Number(el.dataset.at));
    }, 30000);
    // ═══════════════════════════════════════════
    //  START
    // ═══════════════════════════════════════════
    (async () => {
        await boot();
        await fileSync.init();
        await folderSync.init();
        if (bootFresh) await loadHosted();
        let prefs: Record<string, unknown> = {};
        try {
            const saved: unknown = JSON.parse(localStorage.getItem("univerlist-ui") || "{}");
            if (isRecord(saved)) prefs = saved;
        } catch (_) {}
        for (const k of ["sort", "group", "copy"] as const) {
            const v = prefs[k];
            if (v && typeof v === "string") ui[k] = v;
        }
        const lastMode = typeof prefs.mode === "string" ? prefs.mode : "";
        const s = meta.settings;
        ui.mode = s.startMode === "last" ? lastMode || "universal" : s.startMode || "universal";
        if (!meta.modes.some(x => x.id === ui.mode)) ui.mode = meta.modes[0].id;
        ui.filt = FILT_EMPTY();
        ui.page = "profile";
        ui.tab = tabOnEnter(ui.mode);
        ui.status = "all";
        const back = placeRestore();
        meta.layout.side.pinned = !!meta.layout.side.startOpen && window.innerWidth >= 860;
        ui.q = "";
        ui.sel = new Set();
        ui.selecting = false;
        ui.modal = null;
        applyTheme();
        applyDensity();
        ambApply();
        render();
        loadSiteShares();
        // opened from an "Sign in on another device" code (main.ts): straight to Account & sync, which offers to sign this device in
        if (joining) {
            s.welcomed3 = true;
            markDirty();
            goSettings("account");
        } else if (!s.welcomed3 && !items.size) openModal("welcome");
        else if (back) {
            if (restoredPlace.item) openItem(restoredPlace.item);
            if (restoredPlace.y) requestAnimationFrame(() => setTimeout(() => scrollTo(0, restoredPlace.y), 60));
        }
        booted = true;
        // only new things are looked up; nothing is retried on its own
        setTimeout(() => autoCovers(), 1500);
        if (
            s.autoSync &&
            meta.profile.anilist &&
            s.anilistUser &&
            navigator.onLine &&
            (!s.alSyncedAt || Date.now() - Date.parse(s.alSyncedAt) > 6 * 3600e3)
        )
            setTimeout(() => runAniListSync({ quiet: true }), 2500);
        else if (meta.modes.some(m => hasAnimanga(m))) setTimeout(() => refreshAiring(), 6000);
    })();
    // close menus and popovers when clicking elsewhere
    document.addEventListener(
        "pointerdown",
        e => {
            if (ui.modeMenu && !closestTo(e, ".modepick")) {
                ui.modeMenu = false;
                shellChanged();
            }
            if (ui.pop && !closestTo(e, ".pop")) {
                ui.pop = null;
                // the sidebar's Customise menu closes too (it stayed open, as only the page was drawn again)
                renderSideStatus();
                renderMain();
            }
        },
        true
    );
}
