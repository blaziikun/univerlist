// src/features/core/actions.js
// ─────────────────────────────────────────────────────────────────
//  Actions: which code a button belongs to
//
//  Every button names what it does in data-act. actOn() sends it to the feature that knows it: a few by prefix (tl- to
//  tier lists, ss- to a series' servers, ext- to extensions…), the rest to each area's handlers.js in turn.
// ─────────────────────────────────────────────────────────────────

function seqFrom(t) {
    const box = t.closest(
        ".libbody, .blk, .gsres, .strip, .favgrid, .chargrid2, .board, .queue, .diarymonth, .drows, .sstack, .schart, .nexts, .ibody, .panel, section, .tabbody, #main"
    );
    if (!box) return null;
    return [...new Set([...box.querySelectorAll('[data-act="open"][data-id]')].map(x => x.dataset.id))].filter(x =>
        items.has(x)
    );
}
// entries of the types you chose move into the private collection when it opens.
// Earlier versions swept anything AniList flagged, so those come back out once.
function sweepSealed() {
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
async function eraseEverything() {
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
function cleanCandidate(c) {
    const d = { ...c };
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
async function handleImportFile(f) {
    let p;
    try {
        p = await readImportFile(f);
    } catch (e) {
        openModal("io", {
            error:
                e && e.message === TOO_BIG
                    ? "That zip unpacks to more than any export could (over 2 GB, or tens of thousands of files), so it wasn't opened."
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
    if (p.kind !== "bundle") p.match = p.items.filter(x => findExisting(x.title, x.creator, x.medium, x.ext)).length;
    if (ui.modal && ui.modal.kind === "io") {
        ui.modal.preview = p;
        ui.modal.error = "";
        renderOverlay();
    } else openModal("io", { preview: p });
}
const IMPORT_HELP = {
    myanimelist: `MyAnimeList doesn't let other sites read lists. Export yours (<a class="link" href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noopener">MAL → Export</a>), then drop the file above.`,
    goodreads: `Goodreads has no public list API. Export your library (<a class="link" href="https://www.goodreads.com/review/import" target="_blank" rel="noopener">Goodreads → Import and export</a>) and drop the CSV above.`,
    storygraph: `StoryGraph: Manage account → Export StoryGraph library, then drop the CSV above.`,
    imdb: `IMDb: Your ratings → ⋯ → Export, then drop the CSV above.`,
    serializd: `Serializd has no export yet. Copy the show titles from your profile and use “Paste a list of titles”.`,
    backloggd: `Backloggd has no export yet. Copy your games (with scores, like “Daxter - 5/5”) and use “Paste a list of titles”.`,
    trakt: `Trakt needs a sign-in to read lists. Export from Trakt's settings as CSV and drop it above.`,
};
// each returns true once it has handled the button (<area>/handlers.js)
const CLICK_AREAS = [
    navClick,
    libraryClick,
    itemClick,
    peopleClick,
    listClick,
    addClick,
    profileClick,
    insightsClick,
    sourcesClick,
    watchClick,
    settingsClick,
    ioClick,
];
async function actOn(e, t, act, k, id, m) {
    if (typeof pickClick === "function" && (pickClick(act, t, k, id, m) || castListClick(act, t, k, m))) return true;
    if (act.startsWith("tl-") || act.startsWith("tq-")) return tierClick(act, t, k, e);
    if (act.startsWith("pw-")) return pathClick(act, t, k, e);
    if (act.startsWith("ext-") && extClick(act, t, k)) return true;
    if (act.startsWith("ss-")) return await ssClick(act, t, k);
    if (act === "key-eye") {
        const i = $("#key-" + k);
        if (i) {
            i.type = i.type === "password" ? "text" : "password";
            t.setAttribute("aria-pressed", i.type === "text");
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
        const T = JSON.parse(t.dataset.k || "{}");
        openFrame(t.dataset.src, T);
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
        $$(".modemenu").forEach(x => x.remove());
        const to = meta.settings.stageLast || "watch";
        if (to === "read") RD.item = null;
        ui.page = to;
        render();
        scrollTo(0, 0);
        return true;
    }
    if (act === "cover-original" && m && m.kind === "item") {
        patch(m.id, { coverData: null, coverColor: null, color: null }, "Use the original cover");
        cacheAndColour(m.id)
            .then(() => updateItemTiles(m.id))
            .catch(() => {});
        return true;
    }
    if (act === "frame-open") {
        const T = JSON.parse(t.dataset.k || "{}");
        openFrame(t.dataset.src, T);
        return true;
    }
    if (act === "parts-open") {
        if (ui.modal) {
            ui.modal.partsOpen = !ui.modal.partsOpen;
            ui.modal.tab = "synopsis";
            renderOverlay();
        }
        return true;
    }
    if (act.startsWith("parts-")) return partsClick(act, t, k, e);
    if (act.startsWith("seasons-")) return seasonsClick(act, t, k);
    if (act.startsWith("sm-")) return smartClick(act, t, k);
    for (const area of CLICK_AREAS) if (await area(e, t, act, k, id, m)) return true;
    return false;
}
// scores from the detailed criteria
function critPatch(b, C) {
    const vals = Object.values(C).filter(Boolean),
        p = { crit: C };
    if (b.critAvg && vals.length) p.rating = Math.round((vals.reduce((a, v) => a + v, 0) / vals.length) * 10) / 10;
    return p;
}
// sliders and number boxes for scores
document.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset.rate != null && t.type === "range") {
        const n = t.parentNode.querySelector("[data-ratenum]");
        if (n) n.value = t.value;
    }
    if (t.id === "quote-q") {
        ui.quoteQ = t.value;
        renderMain();
        keepFocus("#quote-q");
    }
});
document.addEventListener("change", e => {
    const t = e.target,
        m = ui.modal;
    if (t.id === "it-scale" && m && m.kind === "item") {
        patch(m.id, { scale: t.value || undefined }, "Score scale");
        renderOverlay();
    }
    const score = (key, v, crit) => {
        const sb = items.get(key === "ctx-rate" ? $("#ctx") && $("#ctx").dataset.id : m && m.id),
            r = v === "" ? 0 : parseScore(v, scaleOf(sb));
        if (key === "ctx-rate") {
            const iid = $("#ctx") && $("#ctx").dataset.id;
            if (iid) {
                patch(iid, { rating: r }, "Score");
                refreshCtx();
            }
            return;
        }
        if (!m || m.kind !== "item") return;
        if (key === "crit") {
            const b = items.get(m.id),
                C = { ...(b.crit || {}), [crit]: r || undefined };
            if (!r) delete C[crit];
            patch(m.id, critPatch(b, C), "Score " + crit);
        } else patch(m.id, { rating: r }, "Score");
    };
    if (t.dataset.rate != null) score(t.dataset.rate, t.value, t.dataset.crit);
    if (t.dataset.ratenum != null) score(t.dataset.ratenum, t.value, t.dataset.crit);
    if (m && m.kind === "item") {
        if (t.id === "it-status") setStatus(m.id, t.value);
        if (t.id === "it-copy")
            patch(m.id, { copy: t.value, toBuy: t.value === "none" ? items.get(m.id).toBuy : false }, "Ownership");
        if (t.id === "it-buy") patch(m.id, { toBuy: t.checked }, "Plan to buy");
        if (t.id === "it-plat") {
            patch(m.id, { platform: t.value.trim() }, "Platform");
            if (ui.page === "profile") renderMain();
        }
        if (t.id === "crit-avg") {
            const b = items.get(m.id);
            patch(
                m.id,
                {
                    critAvg: t.checked || undefined,
                    ...(t.checked ? critPatch({ ...b, critAvg: true }, b.crit || {}) : {}),
                },
                "Score from the detail"
            );
        }
        if (t.id === "d-drop")
            patch(
                m.id,
                { droppedAt: t.value ? new Date(t.value + "T12:00:00").toISOString() : null },
                "Change dropped date"
            );
    }
    if (t.dataset.filt) {
        ui.filt = { ...FILT_EMPTY(), ...(ui.filt || {}), [t.dataset.filt]: t.value.trim() };
        renderMain();
    }
    if (t.dataset.filtc) {
        ui.filt = { ...FILT_EMPTY(), ...(ui.filt || {}), [t.dataset.filtc]: t.checked };
        renderMain();
    }
    if (t.id === "filt-own" || t.id === "filt-started") {
        ui.filt = { ...FILT_EMPTY(), ...(ui.filt || {}), [t.id === "filt-own" ? "own" : "started"]: t.value };
        renderMain();
    }
    if (t.id === "set-adv") {
        meta.settings.advanced = t.checked;
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
        h.hidden = t.checked || undefined;
        if (t.checked && ui.mode === "universal") {
            const n = allModes()[0];
            if (n) ui.mode = n.id;
        }
        modeChanged();
        render();
    }
    if (t.id === "set-autofetch") {
        meta.settings.autoFetch = t.checked;
        markDirty();
    }
    if (t.id === "set-airing") {
        meta.settings.airing = t.checked;
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
    if (t.dataset.lrename) {
        const v = t.value.trim();
        if (v)
            changeMeta("Rename list", "lists", L => L.map(l => (l.id === t.dataset.lrename ? { ...l, name: v } : l)));
        refreshCtx();
    }
    if (t.id === "wg-name" && W.show && W.show.groupId) {
        meta.watchGroups[W.show.groupId] = {
            ...(meta.watchGroups[W.show.groupId] || {}),
            name: t.value.trim() || W.show.title,
        };
        markDirty();
    }
    if (t.dataset.srv != null) {
        const S = meta.settings.servers,
            i = Number(t.dataset.srv);
        // a link pattern must point at your own network or a server you've added (own-sources.js)
        if (t.dataset.f === "pattern" && t.value.trim() && !isOwnSource(t.value.trim())) {
            toast(NOT_OWN_SOURCE);
            t.value = S[i].pattern || "";
            return;
        }
        S[i] = { ...S[i], [t.dataset.f]: t.type === "checkbox" ? t.checked : t.value.trim() };
        markDirty();
    }
    if (t.id === "cin-src" && W.player) {
        W.player.k = Number(t.value);
        renderPlayer();
    }
    if (t.id === "cin-sub" && W.player) {
        const v = $("#cinema video");
        if (v) subChoose(W.player, v, t.value, true);
    }
    if (t.id === "cin-speed") {
        meta.settings.player = { ...PS(), speed: +t.value };
        markDirty();
        const v = $("#cinema video");
        if (v) v.playbackRate = +t.value;
    }
    if (t.dataset.po && W.player) {
        meta.settings.player = { ...PS(), [t.dataset.po]: t.type === "checkbox" ? t.checked : t.value };
        markDirty();
        if (t.dataset.po === "fit") {
            const v = $("#cinema video");
            if (v) v.style.objectFit = t.value;
        }
    }
    if (t.dataset.pon && W.player) {
        meta.settings.player = { ...PS(), [t.dataset.pon]: Math.max(0, parseFloat(t.value) || 0) };
        markDirty();
        $("#cinema").style.setProperty("--subsize", PS().subSize + "%");
    }
    if (t.dataset.blkt != null) {
        const kd = t.dataset.bkind || "ov",
            i = Number(t.dataset.blkt),
            v = t.value.trim();
        setBlocks(curMode(), B => B.map((x, j) => (j === i ? { ...x, title: v || undefined } : x)), kd);
        refreshCtx();
    }
});
document.addEventListener(
    "keydown",
    e => {
        if (e.target.id === "wq" && e.key === "Enter") {
            e.preventDefault();
            const q = e.target.value.trim();
            if (q) watchSearch(q);
        }
        if (e.target.dataset && e.target.dataset.actopic && e.key === "Enter") {
            e.preventDefault();
            e.target.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (e.target.id === "imp-url" && e.key === "Enter") {
            e.preventDefault();
            const b = $('[data-act="import-url"]');
            b && b.click();
        }
    },
    true
);
// hovering the sidebar button shows the sidebar; clicking pins it

// drop files anywhere in the import box
document.addEventListener("dragover", e => {
    const z = e.target.closest && e.target.closest("#dropzone");
    if (z && e.dataTransfer && [...e.dataTransfer.types].includes("Files")) {
        e.preventDefault();
        z.classList.add("over");
    }
});
document.addEventListener("dragleave", e => {
    const z = e.target.closest && e.target.closest("#dropzone");
    if (z) z.classList.remove("over");
});
document.addEventListener(
    "drop",
    e => {
        const z = e.target.closest && e.target.closest("#dropzone");
        if (!z || !e.dataTransfer || !e.dataTransfer.files.length) return;
        e.preventDefault();
        e.stopPropagation();
        z.classList.remove("over");
        handleImportFile(e.dataTransfer.files[0]);
    },
    true
);
// overview blocks: drag one onto another to move it there
let blkDrag = null;
let blkKind = "ov";
document.addEventListener(
    "dragstart",
    e => {
        const b = e.target.closest && e.target.closest(".blocks.editing .blk");
        if (!b || e.target.closest(".qi")) return;
        blkDrag = Number(b.dataset.bi);
        blkKind = b.dataset.bkind || "ov";
        b.classList.add("drag");
        e.dataTransfer.effectAllowed = "move";
        try {
            e.dataTransfer.setData("text/plain", "blk");
        } catch (_) {}
        e.stopPropagation();
    },
    true
);
document.addEventListener(
    "dragover",
    e => {
        if (blkDrag == null) return;
        const b = e.target.closest(".blk");
        if (!b) return;
        e.preventDefault();
        $$(".blk.over").forEach(x => x.classList.remove("over"));
        b.classList.add("over");
    },
    true
);
document.addEventListener(
    "drop",
    e => {
        if (blkDrag == null) return;
        const b = e.target.closest(".blk");
        const from = blkDrag;
        blkDrag = null;
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        const to = Number(b.dataset.bi);
        if (to === from) return renderMain();
        setBlocks(
            curMode(),
            B => {
                const x = B.splice(from, 1)[0];
                B.splice(to, 0, x);
                return B;
            },
            blkKind
        );
    },
    true
);
document.addEventListener(
    "dragend",
    () => {
        if (blkDrag != null) {
            blkDrag = null;
            $$(".blk.drag,.blk.over").forEach(x => x.classList.remove("drag", "over"));
        }
    },
    true
);
