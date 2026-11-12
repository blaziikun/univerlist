// src/features/core/actions.ts
// ─────────────────────────────────────────────────────────────────
//  Actions: which code a button belongs to
//
//  Every button names what it does in data-act. actOn() sends it to the feature that knows it: a few by prefix (tl- to
//  tier lists, ss- to a series' servers, ext- to extensions…), the rest to each area's handlers in turn.
// ─────────────────────────────────────────────────────────────────

import {
    $,
    $$,
    type ActEl,
    allModes,
    asField,
    type ClickHandler,
    clone,
    closestTo,
    findExisting,
    isRecord,
    isSealed,
    items,
    markDirty,
    meta,
    modeById,
    patch,
    plural,
    scheduleSave,
    ticked,
    toast,
    tx,
    ui,
    vault,
} from "./core";
import type { ImportPreview, Item, Modal } from "./model";
import { applyTheme, resolveTheme } from "./theme";
import { cacheAndColour, updateItemTiles } from "../sources/covers";
import { partsClick, seasonsClick } from "./parts";
import { renderMain } from "./shell";
import { openModal, renderOverlay } from "./modals";
import { frameClick, isFrameTarget, openFrame } from "../library/frame";
import { readImportFile, TOO_BIG, ZIP_BROKEN, ZIP_LOCKED, ZIP_METHOD } from "../import-export/importers";
import { smartClick } from "../import-export/smartimport";
import { tasteClick } from "../insights/taste";
import { lcClick, learnClick, pathClick } from "../learning-centre/learning";
import { uniClick } from "../learning-centre/learning-curricula";
import { ssClick } from "../watch-read/series";
import { stageOffNote, stageOn } from "../extensions/builtins";
import { RD } from "../watch-read/read";
import { stageClick } from "../watch-read/stage";
import { tierClick } from "../library/tiers";
import { castListClick } from "../library/listadd";
import { tabsClick } from "./tabs";
import { extClick } from "../extensions/extensions";
import { guideDownload } from "../settings/guide";
import { render } from "./navigation";
import { makePrivate, makePublic } from "../library/item-actions";
import { navClick } from "./nav-handlers";
import { libraryClick } from "../library/handlers";
import { itemClick } from "../library/item-handlers";
import { peopleClick } from "../library/people-handlers";
import { listClick } from "../library/list-handlers";
import { profileClick } from "../library/profile-handlers";
import { insightsClick } from "../insights/handlers";
import { sourcesClick } from "../sources/handlers";
import { watchClick } from "../watch-read/handlers";
import { editingMode, modeChanged, settingsClick } from "../settings/handlers";
import { ioClick } from "../import-export/handlers";

/** the entries around a button (its block, list or panel), in order: what the card's arrows step through */
export function seqFrom(t: Element): string[] | null {
    const box = t.closest(
        ".libbody, .blk, .gsres, .strip, .favgrid, .chargrid2, .board, .queue, .diarymonth, .drows, .sstack, .schart, .nexts, .ibody, .panel, section, .tabbody, #main"
    );
    if (!box) return null;
    return [
        ...new Set([...box.querySelectorAll<HTMLElement>('[data-act="open"][data-id]')].map(x => x.dataset.id || "")),
    ].filter(x => items.has(x));
}
// entries of the types you chose move into the private collection when it opens.
// Earlier versions swept anything AniList flagged, so those come back out once.
export function sweepSealed() {
    if (!vault.key) return 0;
    let n = 0,
        back = 0;
    for (const [id, b] of [...items])
        if (isSealed(b) && !vault.ids.has(id)) {
            makePrivate(id);
            n++;
        }
    if (meta.settings.unsealOnce) {
        for (const id of [...vault.ids]) {
            const b = items.get(id);
            if (b && b.flag && !isSealed(b)) {
                makePublic(id);
                back++;
            }
        }
        meta.settings.unsealOnce = false;
        markDirty();
    }
    if (n || back) {
        vault.sealDue = true;
        scheduleSave();
    }
    if (back) setTimeout(() => toast(`Moved ${plural(back, "mature title")} back into your main library`), 400);
    return n;
}
export async function eraseEverything() {
    try {
        for (const s of ["items", "meta", "covers"])
            await tx(s, "readwrite", st => {
                st.clear();
            });
    } catch (_) {}
    for (const k of Object.keys(localStorage))
        if (/^(stacks|univerlist)/.test(k))
            try {
                localStorage.removeItem(k);
            } catch (_) {}
    location.reload();
}
/** a catalogue's answer without what only the search needed (its scores for ranking, its recommendations…) */
export function cleanCandidate(c: object): Record<string, unknown> {
    const d: Record<string, unknown> = { ...c };
    for (const k of [
        "src",
        "recs",
        "cast",
        "votes",
        "score",
        "seeds",
        "reason",
        "add",
        "popularity",
        "lang",
        "desc",
        "filmKind",
        "id",
    ])
        delete d[k];
    return d;
}
export async function handleImportFile(f: File) {
    let p: ImportPreview;
    try {
        p = await readImportFile(f);
    } catch (e) {
        const why = e instanceof Error ? e.message : "";
        openModal("io", {
            error:
                why === TOO_BIG
                    ? "That zip unpacks to more than any export could (over 2 GB, or tens of thousands of files), so it wasn't opened."
                    : why === ZIP_LOCKED
                      ? "That zip has a password, so it can't be opened here. Zip the files again without one."
                      : why === ZIP_METHOD
                        ? "That zip was packed with a kind of compression this can't unpack. Zip the files again with your computer's own zip (it uses the usual kind)."
                        : why === ZIP_BROKEN
                          ? "That zip is damaged (it may not have finished downloading), so it wasn't opened."
                          : "That file couldn't be read. It should be a UniverList backup, a Letterboxd .zip, a MyAnimeList .xml, or a CSV.",
        });
        return;
    }
    if (p.kind === "custom") {
        openModal("csvmap", {
            preview: p,
            medium: /serializd/i.test(f.name)
                ? "tv"
                : /backloggd/i.test(f.name)
                  ? "game"
                  : /mydramalist|mdl/i.test(f.name)
                    ? "tv"
                    : /anime-?planet/i.test(f.name)
                      ? "anime"
                      : "film",
        });
        return;
    }
    if (p.kind !== "bundle")
        p.match = (p.items || []).filter(x =>
            findExisting(
                x.title,
                x.creator,
                typeof x.medium === "string" ? x.medium : undefined,
                isRecord(x.ext) ? x.ext : undefined
            )
        ).length;
    if (ui.modal && ui.modal.kind === "io") {
        ui.modal.preview = p;
        ui.modal.error = "";
        renderOverlay();
    } else openModal("io", { preview: p });
}
export const IMPORT_HELP: Record<string, string> = {
    myanimelist: `MyAnimeList doesn't let other sites read lists. Export yours (<a class="link" href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noopener">MAL → Export</a>), then drop the file above.`,
    goodreads: `Goodreads has no public list API. Export your library (<a class="link" href="https://www.goodreads.com/review/import" target="_blank" rel="noopener">Goodreads → Import and export</a>) and drop the CSV above.`,
    storygraph: `StoryGraph: Manage account → Export StoryGraph library, then drop the CSV above.`,
    imdb: `IMDb: Your ratings → ⋯ → Export, then drop the CSV above.`,
    serializd: `Serializd has no export yet. Copy the show titles from your profile and use “Paste a list of titles”.`,
    backloggd: `Backloggd has no export yet. Copy your games (with scores, like “Daxter - 5/5”) and use “Paste a list of titles”.`,
    trakt: `Trakt needs a sign-in to read lists. Export from Trakt's settings as CSV and drop it above.`,
};
// each returns true once it has handled the button (<area>/handlers.ts)
const CLICK_AREAS: ClickHandler[] = [
    navClick,
    libraryClick,
    itemClick,
    peopleClick,
    listClick,
    profileClick,
    insightsClick,
    sourcesClick,
    watchClick,
    settingsClick,
    ioClick,
];
export async function actOn(
    e: Event,
    t: ActEl,
    act: string,
    k: string | undefined,
    id: string | undefined,
    m: Modal | null
): Promise<boolean> {
    if (castListClick(act, t, k)) return true;
    if (act.startsWith("tl-") || act.startsWith("tq-")) return tierClick(act, t, k, e);
    if (act.startsWith("pw-")) return pathClick(act, t, k, e);
    if (act.startsWith("ext-") && extClick(act, t, k)) return true;
    if (act.startsWith("ss-")) return await ssClick(act, t, k);
    if (act === "key-eye") {
        const i = $<HTMLInputElement>("#key-" + k);
        if (i) {
            i.type = i.type === "password" ? "text" : "password";
            t.setAttribute("aria-pressed", String(i.type === "text"));
        }
        return true;
    }
    if (act === "fav-nums") {
        meta.layout.favNums = meta.layout.favNums === false;
        markDirty();
        renderMain();
        return true;
    }
    if (act === "frame-open") {
        const T: unknown = JSON.parse(t.dataset.k || "{}");
        if (isFrameTarget(T)) openFrame(t.dataset.src, T);
        return true;
    }
    if (act.startsWith("frame-")) return frameClick(act);
    if (act.startsWith("stage-") || act.startsWith("wp-")) return stageClick(act, t, k);
    if (act.startsWith("taste-")) return tasteClick(act, t, k);
    if (act.startsWith("learn-")) return learnClick(act, t, k);
    if (act.startsWith("lc")) return lcClick(act, t, k);
    if (act.startsWith("uni-")) return uniClick(act, t, k);
    if (act === "guide-md") {
        guideDownload();
        return true;
    }
    if (act.startsWith("tab-") && tabsClick(act, t, k)) return true;
    if (act === "mode-to-all") {
        const src = editingMode(),
            before = clone(meta.modes);
        for (const x of meta.modes)
            if (x !== src) {
                if (k === "theme") x.theme = src.theme;
                else {
                    x.view = src.view;
                    x.group = src.group;
                    x.sort = src.sort;
                    x.vz = clone(src.vz || {});
                }
            }
        modeChanged();
        applyTheme();
        render();
        toast(
            k === "theme"
                ? `Every mode now uses ${resolveTheme(src.theme).name}`
                : `Every mode now opens like ${src.name}`,
            {
                label: "Undo",
                fn: () => {
                    meta.modes = before;
                    modeChanged();
                    applyTheme();
                    render();
                },
            }
        );
        return true;
    }
    if (act === "go-stage") {
        if (!stageOn()) {
            stageOffNote();
            return true;
        }
        ui.modeMenu = false;
        for (const x of $$(".modemenu")) x.remove();
        const to = meta.settings.stageLast || "watch";
        if (to === "read") RD.item = null;
        ui.page = to;
        render();
        scrollTo(0, 0);
        return true;
    }
    if (act === "cover-original" && m && m.kind === "item" && m.id) {
        const mid = m.id;
        patch(mid, { coverData: null, coverColor: null, color: null }, "Use the original cover");
        cacheAndColour(mid)
            .then(() => updateItemTiles(mid))
            .catch(() => {});
        return true;
    }
    if (act === "frame-open") {
        const T: unknown = JSON.parse(t.dataset.k || "{}");
        if (isFrameTarget(T)) openFrame(t.dataset.src, T);
        return true;
    }
    if (act.startsWith("parts-")) return partsClick(act, t, k);
    if (act.startsWith("seasons-")) return seasonsClick(act, t, k);
    if (act.startsWith("sm-")) return smartClick(act, t, k);
    for (const area of CLICK_AREAS) if (await area(e, t, act, k, id, m)) return true;
    return false;
}
// scores from the detailed criteria
export function critPatch(b: Item, C: Record<string, number | undefined>): Partial<Item> {
    const vals = Object.values(C).filter((v): v is number => !!v),
        p: Partial<Item> = { crit: C };
    if (b.critAvg && vals.length) p.rating = Math.round((vals.reduce((a, v) => a + v, 0) / vals.length) * 10) / 10;
    return p;
}
// overview blocks: drag one onto another to move it there

// ── start-up: what this file does once every file has loaded (core/start.ts) ──
export function initActions() {
    // sliders and number boxes for scores
    document.addEventListener("change", e => {
        const t = asField(e.target);
        if (!t) return;
        if (t.id === "set-adv") {
            meta.settings.advanced = ticked(t);
            markDirty();
            renderMain();
        }
        if (t.dataset.modetheme) {
            const md = modeById(t.dataset.modetheme);
            md.theme = t.value;
            modeChanged();
            applyTheme();
        }
        if (t.id === "hub-hide") {
            const h = modeById("universal");
            h.hidden = ticked(t) || undefined;
            if (ticked(t) && ui.mode === "universal") {
                const n = allModes()[0];
                if (n) ui.mode = n.id;
            }
            modeChanged();
            render();
        }
        if (t.id === "set-autofetch") {
            meta.settings.autoFetch = ticked(t);
            markDirty();
        }
        if (t.id === "set-airing") {
            meta.settings.airing = ticked(t);
            markDirty();
        }
        if (t.dataset.critm) {
            const k = t.dataset.critm,
                v = t.value
                    .split(",")
                    .map(x => x.trim())
                    .filter(Boolean);
            meta.settings.criteria = { ...(meta.settings.criteria || {}), [k]: v.length ? v : undefined };
            markDirty();
        }
    });
    document.addEventListener(
        "keydown",
        e => {
            const t = e.target;
            if (t instanceof HTMLElement && t.dataset.actopic && e.key === "Enter") {
                e.preventDefault();
                t.dispatchEvent(new Event("change", { bubbles: true }));
            }
            if (t instanceof Element && t.id === "imp-url" && e.key === "Enter") {
                e.preventDefault();
                $('[data-act="import-url"]')?.click();
            }
        },
        true
    );
    // hovering the sidebar button shows the sidebar; clicking pins it

    // drop files anywhere in the import box
    document.addEventListener("dragover", e => {
        const z = closestTo(e, "#dropzone");
        if (z && e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
            e.preventDefault();
            z.classList.add("over");
        }
    });
    document.addEventListener("dragleave", e => {
        const z = closestTo(e, "#dropzone");
        if (z) z.classList.remove("over");
    });
    document.addEventListener(
        "drop",
        e => {
            const z = closestTo(e, "#dropzone");
            if (!z || !e.dataTransfer || !e.dataTransfer.files.length) return;
            e.preventDefault();
            e.stopPropagation();
            z.classList.remove("over");
            handleImportFile(e.dataTransfer.files[0]);
        },
        true
    );
}
