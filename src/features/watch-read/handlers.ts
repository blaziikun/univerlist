// src/features/watch-read/handlers.ts
// ─────────────────────────────────────────────────────────────────
//  Watch & read: what their buttons do
//
//  Choosing what to play or read, your servers and links, and the player's own buttons. core/actions.ts calls watchClick() for
//  every button with a data-act; it returns true when the button is one of these. e is the click, t the button, k and
//  id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

import {
    $,
    addItem,
    entryOf,
    fieldsOf,
    markDirty,
    meta,
    quietPatch,
    scheduleSave,
    toast,
    ui,
    undo,
} from "../core/core";
import type { ActEl } from "../core/core";
import { autoCovers } from "../sources/covers";
import { renderMain } from "../core/shell";
import {
    cinClose,
    cinLayout,
    cinLights,
    cinSeasonPick,
    loadWatchSeason,
    playerRedraw,
    PS,
    renderPlayer,
    savePos,
    seasonItem,
    srcKey,
    srtToVtt,
    W,
    watchMark,
    watchOpen,
    watchPickFiles,
    watchSetSource,
    watchStart,
    watchStep,
} from "./watch";
import { cinFull, pcSeekBy, pcSeekTo, srvRemember } from "./player";
import { overlayNow } from "./player/overlay.svelte";
import { stageChanged } from "./stage-state.svelte";
import { stageOffNote, stageOn } from "../extensions/builtins";
import { closeCtx, openMenu } from "../core/keys";
import { cleanCandidate } from "../core/actions";
import { RD, readFromItem, readPickFiles, readStart } from "./read";

const video = () => $<HTMLVideoElement>("#cinema video");
// a file chosen from this computer: a button makes a file picker for the moment it's needed
function pickFile(accept: string, then: (f: File) => void) {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = accept;
    inp.onchange = () => {
        const f = inp.files?.[0];
        if (f) then(f);
    };
    inp.click();
}

export async function watchClick(
    _e: Event,
    t: ActEl,
    act: string,
    k: string | undefined,
    id: string | undefined
): Promise<boolean> {
    switch (act) {
        case "watch-home":
            W.view = "home";
            W.show = null;
            renderMain();
            return true;
        case "watch-pick": {
            const r = (W.results || [])[Number(k)];
            if (r) watchOpen(r);
            return true;
        }
        case "watch-item": {
            if (!stageOn()) {
                stageOffNote();
                return true;
            }
            const b = id ? entryOf(id) : null;
            if (b) watchOpen(b);
            return true;
        }
        case "watch-add": {
            const s = W.show;
            if (!s) return true;
            const d = cleanCandidate({ ...s, status: "want", source: s.src || "watch" });
            delete d.groupId;
            const nid = addItem({ ...d, title: s.title }, "Add " + s.title);
            s.id = nid;
            W.seasons.forEach(x => {
                if (!x.member) x.member = nid;
            });
            toast("Added " + s.title, { label: "Undo", fn: undo });
            setTimeout(() => autoCovers([nid]), 300);
            renderMain();
            return true;
        }
        case "watch-files":
            watchPickFiles();
            return true;
        case "watch-servers":
            ui.watchServers = !ui.watchServers;
            renderMain();
            return true;
        // ── Read ──
        case "read-open":
            if (id) readFromItem(id);
            return true;
        case "read-home":
            RD.item = null;
            RD.files = [];
            renderMain();
            return true;
        case "read-files":
            readPickFiles();
            return true;
        case "read-start":
            readStart(Number(k));
            return true;
        case "rl-servers":
            ui.readServers = !ui.readServers;
            renderMain();
            return true;
        case "srv-add":
            meta.settings.servers = [...(meta.settings.servers || []), { name: "My server", pattern: "", on: true }];
            markDirty();
            renderMain();
            return true;
        case "srv-del":
            meta.settings.servers = (meta.settings.servers || []).filter((_, i) => i !== Number(k));
            markDirty();
            renderMain();
            return true;
        case "srv-up": {
            const S = meta.settings.servers || [],
                i = Number(k);
            if (i > 0 && i < S.length) [S[i - 1], S[i]] = [S[i], S[i - 1]];
            markDirty();
            renderMain();
            return true;
        }
        case "watch-src": {
            const r = t.getBoundingClientRect();
            openMenu("episode", `${Number(t.dataset.s)}:${Number(k)}`, r.left - 200, r.bottom + 6, {
                label: "Episode " + Number(k),
            });
            return true;
        }
        case "ws-unlink": {
            const si = Number(t.dataset.s),
                b = seasonItem(si);
            if (b) {
                const S = { ...fieldsOf(b.sources) };
                delete S[srcKey(si, Number(k))];
                quietPatch(b.id, { sources: S });
                scheduleSave();
            }
            closeCtx();
            renderMain();
            return true;
        }
        case "ws-file": {
            const si = Number(t.dataset.s),
                ep = Number(k);
            closeCtx();
            pickFile("video/*,.mkv", f => watchSetSource(si, ep, { file: f }));
            return true;
        }
        case "watch-play":
            watchStart(Number(t.dataset.s), Number(k));
            return true;
        case "watch-mark":
            watchMark(Number(t.dataset.s), Number(k), t.getAttribute("aria-pressed") !== "true");
            return true;
        case "watch-season":
            W.si = Number(k);
            loadWatchSeason(W.si);
            renderMain();
            return true;
        case "wg-split": {
            meta.watchSplit = [
                ...new Set([...(meta.watchSplit || []), ...W.seasons.map(x => x.member).filter(Boolean)]),
            ];
            markDirty();
            const m = W.seasons[W.si]?.member,
                b = m ? entryOf(m) : null;
            if (b) watchOpen(b);
            return true;
        }
        case "cin-close":
            cinClose();
            if (ui.page === "watch") renderMain();
            return true;
        case "cin-season":
            cinSeasonPick(Number(k));
            return true;
        case "cin-servers": {
            W.player = null;
            renderPlayer();
            W.view = "home";
            W.show = null;
            ui.watchServers = true;
            renderMain();
            scrollTo(0, 0);
            return true;
        }
        case "cin-next":
            watchStep(1);
            return true;
        case "cin-prev":
            watchStep(-1);
            return true;
        case "cin-mark": {
            // ticked or unticked as it plays: the episode carries on (the tick is all that draws again)
            const p = W.player;
            if (p) {
                p.marked = !p.marked;
                if (p.e != null) watchMark(p.si ?? 0, p.e, p.marked);
                stageChanged("mark");
            }
            return true;
        }
        case "cin-full":
            cinFull();
            return true;
        case "cin-lay":
            cinLayout();
            return true;
        case "cin-lights":
            cinLights();
            return true;
        case "cin-ep": {
            const si = Number(t.dataset.s),
                e = Number(k);
            if (W.player) {
                const v = video();
                if (v && W.lastKey) savePos(W.lastKey, v.currentTime);
            }
            watchStart(si, e);
            return true;
        }
        case "cin-pip": {
            const v = video();
            if (v && v.requestPictureInPicture) v.requestPictureInPicture().catch(() => {});
            return true;
        }
        case "cin-back":
        case "cin-fwd":
        case "cin-skip": {
            const o = PS();
            pcSeekBy(act === "cin-back" ? -o.seek : act === "cin-fwd" ? o.seek : o.skip);
            return true;
        }
        case "pc-startover": {
            pcSeekTo(0);
            const o = overlayNow();
            if (o) o.chip = "";
            return true;
        }
        case "pc-next-now":
            if (W.player && W.player.upNextGo) W.player.upNextGo();
            return true;
        case "pc-next-cancel":
            if (W.player && W.player.upNextCancel) W.player.upNextCancel();
            return true;
        case "pc-play": {
            const v = video();
            if (v) {
                if (v.paused) v.play().catch(() => {});
                else v.pause();
            }
            return true;
        }
        case "pc-mute": {
            const v = video();
            if (v) {
                v.muted = !v.muted;
            }
            return true;
        }
        // the player's panels open and close around what's playing, which carries on
        case "cin-opts":
            if (W.player) {
                W.player.opts = !W.player.opts;
                W.player.srcOpen = false;
                playerRedraw();
            }
            return true;
        case "cin-srcs":
            if (W.player) {
                W.player.srcOpen = !W.player.srcOpen;
                W.player.opts = false;
                playerRedraw();
            }
            return true;
        case "cin-src-pick": {
            const p = W.player,
                v = video();
            if (!p) return true;
            p.keepAt = v ? (p.offset || 0) + v.currentTime : 0;
            p.k = Number(k);
            p.prefDone = true;
            srvRemember(p);
            p.failed = (p.failed || []).filter(i => i !== p.k);
            p.srcOpen = false;
            renderPlayer();
            return true;
        }
        case "cin-startnow":
            if (W.player && W.player.release) W.player.release();
            return true;
        case "cin-hold":
            if (W.player && W.player.holdNow) W.player.holdNow();
            return true;
        case "cin-holdno":
            if (W.player && W.player.holdNo) W.player.holdNo();
            return true;
        case "cin-subs": {
            pickFile(".vtt,.srt", async f => {
                let txt = await f.text();
                if (/\.srt$/i.test(f.name) || !/^WEBVTT/.test(txt)) txt = srtToVtt(txt);
                const p = W.player;
                if (!p) return;
                const v = video(),
                    at = v ? v.currentTime : 0;
                p.subs = URL.createObjectURL(new Blob([txt], { type: "text/vtt" }));
                renderPlayer();
                const v2 = video();
                if (v2)
                    v2.addEventListener(
                        "loadedmetadata",
                        () => {
                            v2.currentTime = at;
                        },
                        { once: true }
                    );
            });
            return true;
        }
    }
    return false;
}
