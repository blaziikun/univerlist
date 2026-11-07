// src/features/watch-read/handlers.js
// ─────────────────────────────────────────────────────────────────
//  Watch: what its buttons do
//
//  Choosing what to play, your servers and links, and the player's own buttons. core/actions.js calls watchClick() for
//  every button with a data-act; it returns true when the button is one of these. e is the click, t the button, k and
//  id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

async function watchClick(e, t, act, k, id, m) {
    switch (act) {
        case "watch-home":
            W.view = "home";
            W.show = null;
            renderMain();
            return true;
        case "watch-pick":
            watchOpen(W.results[Number(k)]);
            return true;
        case "watch-item":
            if (!stageOn()) {
                stageOffNote();
                return true;
            }
            watchOpen({ id, ...items.get(id) });
            return true;
        case "watch-add": {
            const s = W.show,
                d = cleanCandidate({ ...s, status: "want", source: s.src || "watch" });
            delete d.groupId;
            const nid = addItem(d, "Add " + s.title);
            W.show.id = nid;
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
            const S = meta.settings.servers,
                i = Number(k);
            [S[i - 1], S[i]] = [S[i], S[i - 1]];
            markDirty();
            renderMain();
            return true;
        }
        case "watch-src": {
            const si = Number(t.dataset.s),
                ep = Number(k),
                r = t.getBoundingClientRect(),
                b = seasonItem(si),
                cur = b && (b.sources || {})[srcKey(si, ep)];
            openMenuAt(
                r.left - 200,
                r.bottom + 6,
                () => `<div class="ctx-h"><b>Episode ${ep}</b><small>Just for this one</small></div>
        <div class="ctx-s"><span class="ilab">Link to a video file</span><input class="inp" id="ws-url" value="${esc(cur ? cur.url : "")}" placeholder="https://…/episode.mp4"><div class="ctx-a"><button data-act="ws-url" data-s="${si}" data-k="${ep}">Save link</button>${cur ? `<button data-act="ws-unlink" data-s="${si}" data-k="${ep}">Remove link</button>` : ""}</div></div>
        <div class="ctx-a"><button data-act="ws-file" data-s="${si}" data-k="${ep}">Choose a file…</button></div>`
            );
            return true;
        }
        case "ws-url": {
            const u = ($("#ws-url") || {}).value.trim();
            if (!/^https?:\/\//.test(u)) {
                toast("Paste a link that starts with http");
                return true;
            }
            if (!isOwnSource(u)) {
                toast(NOT_OWN_SOURCE);
                return true;
            }
            watchSetSource(Number(t.dataset.s), Number(k), { url: u });
            closeCtx();
            return true;
        }
        case "ws-unlink": {
            const si = Number(t.dataset.s),
                b = seasonItem(si);
            if (b) {
                const S = { ...(b.sources || {}) };
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
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "video/*,.mkv";
            inp.onchange = () => inp.files[0] && watchSetSource(si, ep, { file: inp.files[0] });
            inp.click();
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
            watchOpen({ ...items.get(W.seasons[W.si].member), id: W.seasons[W.si].member });
            return true;
        }
        case "cin-close": {
            const v = $("#cinema video");
            if (v && W.lastKey) savePos(W.lastKey, (W.player.offset || 0) + v.currentTime);
            W.player = null;
            renderPlayer();
            W.view = W.show ? "show" : "home";
            ui.wpOpts = false;
            if (ui.page === "watch") renderMain();
            return true;
        }
        case "cin-season": {
            if (!W.player) return true;
            const i = Number(k);
            W.player.listSi = i;
            cinSideRedraw();
            loadWatchSeason(i);
            return true;
        }
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
        case "cin-mark":
            if (W.player) {
                W.player.marked = !W.player.marked;
                watchMark(W.player.si, W.player.e, W.player.marked);
                const v = $("#cinema video");
                if (v) W.player.keepAt = v.currentTime;
                renderPlayer();
            }
            return true;
        case "cin-full": {
            const el = $("#cinema");
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            else if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
            return true;
        }
        case "cin-lay": {
            const v = $("#cinema video");
            if (W.player && v) W.player.keepAt = curAt();
            meta.settings.player = { ...PS(), layout: (PS().layout || "docked") === "docked" ? "cinema" : "docked" };
            markDirty();
            renderPlayer();
            return true;
        }
        case "cin-lights": {
            const v = $("#cinema video");
            if (W.player && v) W.player.keepAt = v.currentTime;
            meta.settings.player = { ...PS(), lights: !PS().lights };
            markDirty();
            $("#cinema").classList.toggle("lights", PS().lights);
            const b = $('#cinema [data-act="cin-lights"]');
            if (b) {
                b.textContent = PS().lights ? "☀" : "☾";
                b.setAttribute("aria-pressed", String(!!PS().lights));
            }
            return true;
        }
        case "cin-ep": {
            const si = Number(t.dataset.s),
                e = Number(k);
            if (W.player) {
                const v = $("#cinema video");
                if (v && W.lastKey) savePos(W.lastKey, v.currentTime);
            }
            watchStart(si, e);
            return true;
        }
        case "cin-pip": {
            const v = $("#cinema video");
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
            const c = t.closest(".pc-chip");
            if (c) c.remove();
            return true;
        }
        case "pc-next-now":
            if (W.player && W.player.upNextGo) W.player.upNextGo();
            return true;
        case "pc-next-cancel":
            if (W.player && W.player.upNextCancel) W.player.upNextCancel();
            return true;
        case "pc-play": {
            const v = $("#cinema video");
            if (v) v.paused ? v.play().catch(() => {}) : v.pause();
            return true;
        }
        case "pc-mute": {
            const v = $("#cinema video");
            if (v) {
                v.muted = !v.muted;
            }
            return true;
        }
        case "cin-opts":
            W.player.opts = !W.player.opts;
            W.player.srcOpen = false;
            renderPlayer();
            return true;
        case "cin-srcs":
            W.player.srcOpen = !W.player.srcOpen;
            W.player.opts = false;
            renderPlayer();
            return true;
        case "cin-src-pick": {
            const p = W.player,
                v = $("#cinema video");
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
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = ".vtt,.srt";
            inp.onchange = async () => {
                const f = inp.files[0];
                if (!f) return;
                let txt = await f.text();
                if (/\.srt$/i.test(f.name) || !/^WEBVTT/.test(txt)) txt = srtToVtt(txt);
                const v = $("#cinema video"),
                    at = v ? v.currentTime : 0;
                W.player.subs = URL.createObjectURL(new Blob([txt], { type: "text/vtt" }));
                renderPlayer();
                const v2 = $("#cinema video");
                if (v2)
                    v2.addEventListener(
                        "loadedmetadata",
                        () => {
                            v2.currentTime = at;
                        },
                        { once: true }
                    );
            };
            inp.click();
            return true;
        }
    }
    return false;
}
