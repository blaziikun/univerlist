// src/features/core/events.js
// ─────────────────────────────────────────────────────────────────
//  Events: one listener per kind of event, for the whole page
//
//  Clicks are matched to a button with data-act and handed to actOn() (core/actions.js); typing, changes, keys,
//  dragging, dropping and pasting are handled here, and the app starts at the end.
// ─────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════
//  CLICKS
// ═══════════════════════════════════════════
let lastSelIdx = -1,
    pendingCover = null;
document.addEventListener("click", async e => {
    const t = e.target.closest("[data-act]");
    if (!t || t.tagName === "A") return;
    if (t.tagName === "INPUT" && t.type === "checkbox" && t.dataset.act !== "pick-own") return;
    if (t.closest("summary")) e.preventDefault(); // a button on a folding row acts, it does not fold the row
    const act = t.dataset.act,
        k = t.dataset.k,
        id = t.dataset.id,
        m = ui.modal;
    if (t.closest("svg") && act === "open") {
        openItem(id, seqFrom(t));
        return;
    }
    await actOn(e, t, act, k, id, m);
});
function readPaste(m) {
    m.text = $("#ps-text").value;
    m.medium = $("#ps-medium").value;
    m.ikind = $("#ps-kind").value;
    m.status = $("#ps-status").value;
    m.tag = $("#ps-tag").value.trim();
}
function runPalette(i) {
    const m = ui.modal,
        it = m && m.items && m.items[i];
    if (!it) return;
    closeModal();
    if (it.id) openItem(it.id);
    else if (it.char) openModal("char", { id: it.char });
    else it.fn();
}
// imports from any source: existing entries are updated, never duplicated; the whole import can be undone
function runImport(p, { bookKind = "Novel" } = {}) {
    const list = p.items || [];
    const plan = list.map(x => ({ x, id: findExisting(x.title, x.creator, x.medium, x.ext) }));
    const newIds = [];
    for (const q of plan)
        if (!q.id) q.newId = newId(q.x.title, q.x.medium) + "-" + Math.random().toString(36).slice(2, 5);
    for (const q of plan) for (const tg of q.x.tags || []) ensureTag(tg);
    const mb = { lists: clone(meta.lists) };
    for (const l of p.lists || []) {
        const ids = l.entries
            .map(e => {
                const q = plan.find(
                    q => norm(q.x.title) === norm(e.title) && (!e.year || !q.x.year || q.x.year === e.year)
                );
                return q ? q.id || q.newId : findExisting(e.title, "", "film");
            })
            .filter(Boolean);
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
        plan.map(q => q.id || q.newId),
        (b, id) => {
            const q = plan.find(r => (r.id || r.newId) === id),
                x = q.x;
            if (b) {
                const u = { ...b };
                if (x.rating && !b.rating) {
                    u.rating = x.rating;
                    if (x.scale && !b.scale) u.scale = x.scale;
                }
                if (x.status && (b.status === "want" || x.status === "done")) u.status = x.status;
                for (const f of ["finishedAt", "startedAt", "year", "total", "isbn", "runtime", "kind", "creator"])
                    if (x[f] && !b[f]) u[f] = x[f];
                if (x.copy && x.copy !== "none" && b.copy === "none") u.copy = x.copy;
                if (x.repeat && x.repeat > (b.repeat || 0)) u.repeat = x.repeat;
                if ((x.log || []).length && !(b.log || []).length) u.log = x.log;
                if (x.prog && x.prog > (b.prog || 0)) u.prog = x.prog;
                u.tags = [...new Set([...(b.tags || []), ...(x.tags || [])])];
                u.genres = [...new Set([...(b.genres || []), ...(x.genres || [])])];
                u.ext = { ...(x.ext || {}), ...(b.ext || {}) };
                u.scores = { ...(x.scores || {}), ...(b.scores || {}) };
                if (x.cover && !b.cover && !b.coverData) u.cover = x.cover;
                if (x.notes && !String(b.notes || "").includes(x.notes))
                    u.notes = [b.notes, x.notes].filter(Boolean).join("\n\n");
                return u;
            }
            newIds.push(id);
            const obj = { ...x, source: p.kind };
            if (!obj.kind) obj.kind = obj.medium === "book" ? bookKind : "";
            for (const f of Object.keys(obj)) if (obj[f] == null || obj[f] === "") delete obj[f];
            return migrateItem(obj);
        },
        { metaBefore: mb }
    );
    closeModal();
    toast(`Imported ${list.length}${(p.lists || []).length ? " and " + plural(p.lists.length, "list") : ""}`, {
        label: "Undo",
        fn: undo,
    });
    setTimeout(() => autoCovers(newIds), 400);
}
async function runRefresh() {
    const m = ui.modal;
    m.scope = $("#rc-scope").value;
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
    Object.assign(m, {
        running: true,
        finished: false,
        total: ids.length,
        done: 0,
        found: 0,
        error: "",
        ctl: new AbortController(),
    });
    renderOverlay();
    let fails = 0;
    for (const bid of ids) {
        if (m.ctl.signal.aborted) break;
        const b = items.get(bid);
        if (!b) {
            m.done++;
            continue;
        }
        m.current = titleOf(b);
        renderOverlay();
        try {
            if (m.scope === "scores") {
                await refreshItem(bid, m.ctl.signal);
                m.found++;
            } else if (await fetchArt(bid, m.ctl.signal, m.scope === "books")) {
                m.found++;
                await cacheAndColour(bid, m.ctl.signal);
                updateItemTiles(bid);
            }
            fails = 0;
        } catch (err) {
            if (err.name === "AbortError") break;
            if (++fails >= 5) {
                m.error = "The sources aren't responding. Try again later.";
                break;
            }
        }
        m.done++;
        if (m.done % 8 === 0) scheduleSave();
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
const themeFmt = (k, v) =>
    ["bgAmt", "glow"].includes(k) ? Math.round(v * 100) + "%" : k === "ls" ? (+v).toFixed(2) + "em" : v + "px";
function keepFocus(sel) {
    const el = $(sel);
    if (el) {
        const p = el.value.length;
        el.focus();
        try {
            el.setSelectionRange(p, p);
        } catch (_) {}
    }
}
document.addEventListener("input", e => {
    const t = e.target,
        m = ui.modal;
    // the backup passphrase is remembered while the page is open (in memory only, never saved), so redrawing the page doesn't empty the box
    if (t.id === "exp-keypass") ui.expPass = t.value;
    if (t.id === "imp-keypass" && m) m.keypass = t.value;
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
    if (t.id === "pal-q") {
        m.q = t.value;
        m.i = 0;
        renderOverlay();
    }
    if (t.id === "pi-q") {
        m.q = t.value;
        renderOverlay();
    }
    if (t.id === "char-q") {
        ui.charQ = t.value;
        renderMain();
        keepFocus("#char-q");
    }
    if (t.id === "tier-q") {
        ui.tierQ = t.value;
        renderMain();
        keepFocus("#tier-q");
    }
    if (t.id === "people-q") {
        ui.peopleQ = t.value;
        renderMain();
        keepFocus("#people-q");
    }
    // live styling: colours and sliders apply as you drag
    if (t.dataset.theme !== undefined && (t.type === "range" || t.type === "color")) {
        const k = t.dataset.theme,
            v = THEME_NUM.has(k) ? parseFloat(t.value) : t.value;
        setThemeVal(k, v);
        if (t.type === "range" && t.nextElementSibling) t.nextElementSibling.textContent = themeFmt(k, v);
        if (t.type === "color") {
            const h = $(`[data-themehex="${k}"]`);
            if (h) h.value = t.value;
        }
    }
    if (t.dataset.vz) {
        const md = curMode(),
            v = curView(md),
            val = parseFloat(t.value);
        md.vz = { ...(md.vz || {}), [v]: { ...viewOpts(md, v), [t.dataset.vz]: val } };
        const lb = $(".libbody");
        if (lb) lb.style.setProperty(t.dataset.vz === "z" ? "--z" : "--gz", val);
        if (t.nextElementSibling) t.nextElementSibling.textContent = Math.round(val * 100) + "%";
        markDirty();
    }
    if (t.id === "side-w") {
        const w = +t.value;
        meta.layout.side.width = w;
        $("#app").style.setProperty("--side-w", w + "px");
        if (t.nextElementSibling) t.nextElementSibling.textContent = w + "px";
        markDirty();
    }
    if (t.id === "set-appname") {
        meta.settings.appName = t.value.trim() || "UniverList";
        document.title = meta.settings.appName;
        const b = $(".brand");
        if (b) b.innerHTML = logoHTML();
        markDirty();
    }
});
document.addEventListener("change", e => {
    const t = e.target;
    if (t.id !== "ctx-mode") return;
    const id = ($("#ctx") || {}).dataset && $("#ctx").dataset.id;
    if (id) {
        moveToMode([id], t.value);
        renderMain();
    }
});
document.addEventListener("change", e => {
    const t = e.target,
        m = ui.modal;
    if (!m || m.kind !== "item" || !["it-mode", "it-tlang"].includes(t.id)) return;
    if (t.id === "it-mode") moveToMode([m.id], t.value);
    else patch(m.id, { titleLang: t.value || undefined }, "Title language");
    m.moreOpen = true;
    renderOverlay();
    renderMain();
});
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.sidesec) return;
    const L = meta.layout.side,
        H = new Set(L.hide || SIDE_HIDE_DEFAULT);
    t.checked ? H.delete(t.dataset.sidesec) : H.add(t.dataset.sidesec);
    L.hide = [...H];
    markDirty();
    renderSide();
});
document.addEventListener("change", e => {
    const t = e.target,
        m = ui.modal;
    // library and tabs
    if (t.id === "mode-sel") setMode(t.value);
    if (t.id === "sort") {
        const md = curMode(),
            gp = curGroup(md);
        md.sort = t.value;
        md.gsort = Object.fromEntries(Object.entries(md.gsort || {}).filter(([k]) => !k.startsWith(gp + ":")));
        if (t.value === "shelf") md.view = "spine";
        markDirty();
        renderMain();
    }
    if (t.id === "group") {
        curMode().group = t.value;
        markDirty();
        renderMain();
    }
    if (t.classList.contains("gsort")) {
        const md = curMode(),
            v = t.value;
        if (v.startsWith("all:")) {
            md.sort = v.slice(4);
            md.gsort = Object.fromEntries(
                Object.entries(md.gsort || {}).filter(([k]) => !k.startsWith(curGroup(md) + ":"))
            );
        } else md.gsort = { ...(md.gsort || {}), [t.dataset.gk]: v };
        if (v.endsWith("shelf")) md.view = "spine";
        markDirty();
        renderMain();
    }
    if (t.dataset.vzc) {
        const md = curMode(),
            v = curView(md);
        md.vz = { ...(md.vz || {}), [v]: { ...viewOpts(md, v), [t.dataset.vzc]: t.checked } };
        markDirty();
        renderMain();
    }
    if (t.dataset.vz) {
        renderMain();
    }
    if (t.dataset.exp) {
        ui.exp = { ...(ui.exp || {}), [t.dataset.exp]: t.checked };
    }
    if (t.id === "set-backupkeys") {
        meta.settings.backupKeys = t.checked;
        markDirty();
    }
    if (t.id === "exp-lists") {
        ui.exp = { ...(ui.exp || {}), lists: t.value };
    }
    if (t.dataset.part && m) {
        m.sel = { ...(m.sel || {}), [t.dataset.part]: t.checked };
        if (/^(extensions|privext)$/.test(t.dataset.part)) renderOverlay();
    }
    if (t.dataset.exthow && m) {
        m.extHow = t.dataset.exthow;
    }
    if (t.dataset.seasons) {
        meta.settings.seasons = { ...(meta.settings.seasons || {}), [t.dataset.seasons]: t.checked };
        markDirty();
    }
    if (t.id === "set-proxy") {
        meta.settings.imageProxy = t.checked;
        coverCache.blocked = false;
        markDirty();
    }
    if (t.id === "cp-scope") {
        ui.cpScope = t.value;
    }
    if (t.dataset.season != null && m && m.kind === "item") {
        const i = Number(t.dataset.season),
            f = t.dataset.sf,
            b = items.get(m.id),
            S = (b.seasons || []).slice();
        S[i] = {
            ...S[i],
            [f]: f === "rating" ? parseFloat(t.value) || "" : f === "eps" ? parseInt(t.value, 10) || "" : t.value,
        };
        patch(m.id, { seasons: S }, "Edit season");
    }
    if (t.id === "set-links") {
        meta.settings.showLinks = t.checked;
        markDirty();
    }
    if (t.id === "theme-name") {
        const tid = editThemeId();
        meta.themes[tid] = { ...meta.themes[tid], name: t.value.trim() || tid };
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
    if (t.id === "rank-shelf") {
        ui.rankShelf = t.value || null;
        rankState.pair = null;
        renderMain();
    }
    if (t.id === "fav-group" || t.id === "set-favgroup") {
        meta.layout.favGroup = t.checked;
        markDirty();
        renderMain();
    }
    if (t.id === "people-all") {
        ui.peopleAll = t.checked;
        renderMain();
    }
    // lists
    const L = ui.listId && meta.lists.find(l => l.id === ui.listId);
    if (L && t.id === "list-name") {
        const v = t.value.trim() || L.name;
        changeMeta("Rename list", "lists", A => A.map(l => (l.id === L.id ? { ...l, name: v } : l)));
    }
    if (L && t.id === "list-desc") {
        const v = t.value.trim();
        changeMeta("Describe list", "lists", A => A.map(l => (l.id === L.id ? { ...l, desc: v } : l)));
    }
    if (L && t.id === "list-numbered") {
        const v = t.checked;
        changeMeta("List order", "lists", A => A.map(l => (l.id === L.id ? { ...l, numbered: v } : l)));
    }
    if (L && t.id === "list-sort" && t.value) {
        const by = t.value,
            f = {
                year: b => b.year || 9999,
                title: b => titleOf(b).toLowerCase(),
                rating: b => -(b.rating || 0),
                added: b => b.addedAt || "",
            }[by];
        setListIds(
            L.id,
            a =>
                a.slice().sort((x, y) => {
                    const p = f(items.get(x) || {}),
                        q = f(items.get(y) || {});
                    return p < q ? -1 : p > q ? 1 : 0;
                }),
            "Sort list"
        );
    }
    if (t.dataset.lnote) {
        const lid = t.dataset.lnote,
            iid = t.dataset.id,
            v = t.value.trim();
        changeMeta("List note", "lists", A =>
            A.map(l => (l.id === lid ? { ...l, notes: { ...(l.notes || {}), [iid]: v } } : l))
        );
    }
    // item card
    if (t.id === "notes" && m) {
        const v = t.value;
        if ((items.get(m.id) || {}).notes !== v) {
            patch(m.id, { notes: v }, "Edit notes");
            toast("Notes saved");
        }
    }
    if (t.id === "vibe" && m) {
        const v = t.value.trim(),
            b = items.get(m.id);
        if (v) ensureTag(v);
        change("Set theme", m.id, x => ({
            ...x,
            vibe: v,
            tags: [...new Set([...(x.tags || []).filter(g => g !== b.vibe), ...(v ? [v] : [])])],
        }));
    }
    if (t.id === "platform" && m) patch(m.id, { platform: t.value.trim() }, "Set platform");
    if (t.dataset.mscore && m) {
        const v = parseFloat(t.value);
        const b = items.get(m.id);
        patch(m.id, { scores: { ...b.scores, [t.dataset.mscore]: Number.isFinite(v) ? v : undefined } }, "Add a score");
    }
    if (t.id === "franchise" && m) patch(m.id, { franchise: t.value.trim() }, "Set franchise");
    if (t.id === "d-start" && m)
        patch(m.id, { startedAt: t.value ? new Date(t.value + "T12:00:00").toISOString() : null }, "Change start date");
    if (t.id === "d-finish" && m)
        patch(
            m.id,
            { finishedAt: t.value ? new Date(t.value + "T12:00:00").toISOString() : null },
            "Change finish date"
        );
    if (t.id === "pg-lane" && m) patch(m.id, { lane: t.value }, "Set where you're reading");
    if (t.id === "d-seed" && m) {
        m.seed = t.value;
        m.results = null;
        renderOverlay();
    }
    if (t.id === "a-medium" && m && m.kind === "add") {
        m.draft = { ...m.draft, ...readFields("a-") };
        renderOverlay();
    }
    if (t.id === "a-kind" && m && m.step === "search") m.ikind = t.value;
    if (t.id === "e-medium" && m && m.kind === "item") {
        const f = readFields("e-");
        m.editing = true;
        renderOverlay();
        Object.entries(f).forEach(([k, v]) => {
            const el = $("#e-" + k);
            if (el && k !== "medium") el.value = Array.isArray(v) ? v.join(", ") : (v ?? "");
        });
    }
    // paste and column matcher
    if (t.id === "ps-medium" && m) {
        readPaste(m);
        m.ikind = "";
        renderOverlay();
    }
    if (t.dataset.map && m) {
        m.map = { ...m.map, [t.dataset.map]: t.value || undefined };
        renderOverlay();
    }
    if (t.id === "cm-medium" && m) {
        m.medium = t.value;
        renderOverlay();
    }
    if (t.id === "cm-scale" && m) {
        m.scale = t.value;
        renderOverlay();
    }
    if (t.id === "cm-status" && m) {
        m.status = t.value;
        renderOverlay();
    }
    // settings: general
    if (t.id === "set-autosync") {
        meta.settings.autoSync = t.checked;
        markDirty();
    }
    if (t.id === "set-al" || t.id === "al-user") {
        meta.settings.anilistUser = t.value.trim();
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
        meta.layout.side.startOpen = t.checked;
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
        const s = md.shelves[Number(t.dataset.shelfname)];
        if (s) {
            s.name = t.value.trim() || s.name;
            modeChanged();
        }
    }
    if (md && t.dataset.mm) {
        const [prefix, medium, kind] = t.dataset.mm.split("|");
        if (kind === "*")
            $$(`[data-mm^="${prefix}|${medium}|"]`).forEach(x => {
                x.checked = t.checked;
            });
        const pats = readMatrix(prefix);
        if (prefix === "mode") md.match = pats;
        else {
            const i = Number(prefix.slice(5));
            if (md.shelves[i]) {
                md.shelves[i].match = pats;
                ui.openShelf = i;
            }
        }
        ui.shelfKey = null;
        modeChanged();
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
    // tags

    // other tabs
    if (t.id === "fr-name") {
        const f = franchises().find(x => x.key === t.dataset.k);
        if (f) {
            const v = t.value.trim();
            change(
                "Rename franchise",
                f.members.map(b => b.id),
                b => ({ ...b, franchise: v })
            );
        }
    }
    if (t.id === "cmp-a" || t.id === "cmp-b") {
        const iid = idFromOption(t.value);
        if (iid) {
            ui[t.id === "cmp-a" ? "cmpA" : "cmpB"] = iid;
            renderMain();
        }
    }
    if (t.id === "tier-name") {
        const v = t.value.trim();
        changeMeta("Rename tier list", "tiers", T =>
            T.map(x => (x.id === ui.tierId ? { ...x, name: v || x.name } : x))
        );
    }
    if (t.dataset.tlabel != null) {
        const i = Number(t.dataset.tlabel),
            v = t.value.trim();
        changeMeta("Rename tier", "tiers", T =>
            T.map(x =>
                x.id !== ui.tierId
                    ? x
                    : { ...x, rows: x.rows.map((r, j) => (j === i ? { ...r, label: v || r.label } : r)) }
            )
        );
    }
    if (t.dataset.tcolor != null) {
        const i = Number(t.dataset.tcolor),
            v = t.value;
        changeMeta("Tier colour", "tiers", T =>
            T.map(x =>
                x.id !== ui.tierId ? x : { ...x, rows: x.rows.map((r, j) => (j === i ? { ...r, color: v } : r)) }
            )
        );
    }
    if (t.id === "tier-onlydone") {
        const v = t.checked;
        changeMeta("Tier list filter", "tiers", T => T.map(x => (x.id === ui.tierId ? { ...x, onlyDone: v } : x)));
    }
    // bulk edits
    if (ui.selecting && ui.sel.size) {
        const ids = [...ui.sel];
        if (t.id === "bulk-status" && t.value) {
            const v = t.value;
            change(`Mark ${ids.length} ${STATUS_WORDS.any[v].toLowerCase()}`, ids, b => ({
                ...b,
                status: v,
                startedAt: v === "active" && !b.startedAt ? nowISO() : b.startedAt,
                finishedAt: v === "done" && !b.finishedAt ? nowISO() : b.finishedAt,
                prog: v === "done" && b.total && b.medium !== "game" ? b.total : b.prog,
            }));
            toast("Updated " + ids.length, { label: "Undo", fn: undo });
        }
        if (t.id === "bulk-copy" && t.value) {
            const v = t.value;
            change(`Set ownership for ${ids.length}`, ids, b =>
                v === "buy"
                    ? { ...b, toBuy: true }
                    : v === "nobuy"
                      ? { ...b, toBuy: false }
                      : { ...b, copy: v, toBuy: v === "none" ? b.toBuy : false }
            );
            toast("Updated " + ids.length, { label: "Undo", fn: undo });
        }
        if (t.id === "bulk-mode" && t.value) {
            moveToMode(ids, t.value);
            ui.sel.clear();
            renderMain();
            return;
        }
        if (t.id === "bulk-kind" && t.value) {
            const v = t.value;
            change(`Set type for ${ids.length}`, ids, b => ({
                ...b,
                kind: v,
                shelf:
                    b.medium === "book"
                        ? v === "Academic"
                            ? "academic"
                            : v === "Non-fiction"
                              ? "nonfiction"
                              : "fiction"
                        : b.shelf,
            }));
            toast("Updated " + ids.length, { label: "Undo", fn: undo });
        }
        if (t.id === "bulk-list" && t.value) {
            if (t.value === "__new") openModal("listnew", { ids });
            else {
                listAdd(t.value, ids);
                toast(`Added ${ids.length} to ${(meta.lists.find(l => l.id === t.value) || {}).name}`);
            }
        }
        if (t.id === "bulk-untag" && t.value) {
            const tg = t.value;
            change(`Remove tag ${tg}`, ids, b =>
                (b.tags || []).includes(tg) ? { ...b, tags: b.tags.filter(x => x !== tg) } : undefined
            );
        }
    }
});
document.addEventListener("keydown", e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName),
        m = ui.modal,
        mod = e.metaKey || e.ctrlKey;
    if (ui.keyCapture) return;
    if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (m) closeModal();
        focusSearch();
        return;
    }
    if (m && m.kind === "palette") {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            m.i = Math.max(0, Math.min((m.items || []).length - 1, (m.i || 0) + (e.key === "ArrowDown" ? 1 : -1)));
            renderOverlay();
        }
        if (e.key === "Enter") {
            e.preventDefault();
            runPalette(m.i || 0);
        }
        if (e.key === "Escape") closeModal();
        return;
    }
    if (e.key === "Escape" && $("#ctx") && !$("#ctx").hidden) {
        closeCtx();
        return;
    }
    if (e.key === "Escape" && ui.modeMenu) {
        ui.modeMenu = false;
        $$(".modemenu").forEach(x => x.remove());
        return;
    }
    if (e.key === "Escape" && ui.pop) {
        ui.pop = null;
        render();
        return;
    }
    if (e.key === "Escape" && $("#app").classList.contains("side-peek")) {
        $("#app").classList.remove("side-peek");
        return;
    }
    if (e.key === "Escape") {
        if (m) {
            if (m.back) {
                const b = m.back;
                ui.modal = null;
                openModal(b.kind, b);
            } else closeModal();
        } else if (ui.tierSel) {
            ui.tierSel = null;
            renderMain();
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
    const enter = (sel, act) => {
        if (e.key === "Enter" && e.target.id === sel) {
            e.preventDefault();
            const b = $(`[data-act="${act}"]`);
            b && b.click();
            return true;
        }
        return false;
    };
    if (e.key === "Enter" && e.target.id === "tag-in") {
        e.preventDefault();
        addTagTo(m.id, e.target.value);
        setTimeout(() => {
            const i = $("#tag-in");
            i && i.focus();
        }, 0);
        return;
    }
    if (e.key === "Enter" && e.target.id === "ch-tag") {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v) {
            const c = meta.chars.find(x => x.id === m.id);
            patchChar(m.id, { tags: [...new Set([...(c.tags || []), v])] });
            setTimeout(() => {
                const i = $("#ch-tag");
                i && i.focus();
            }, 0);
        }
        return;
    }
    if (e.key === "Enter" && e.target.id === "bulk-tag") {
        e.preventDefault();
        addTagTo([...ui.sel], e.target.value);
        e.target.value = "";
        return;
    }
    if (e.key === "Enter" && e.target.classList.contains("h2in")) {
        e.preventDefault();
        e.target.blur();
        return;
    }
    if (
        enter("a-q", "add-search") ||
        enter("sv-name", "sv-save") ||
        enter("sp-page", "sp-save") ||
        enter("pg-now", "log-save") ||
        enter("pg-total", "log-save") ||
        enter("cs-q", "cs-search") ||
        enter("al-user", "al-sync") ||
        enter("tn-name", "tn-create") ||
        enter("lk-target", "link-add") ||
        enter("ln-name", "ln-create") ||
        enter("lp-new", "lp-create") ||
        enter("vpu", "vault-unlock") ||
        enter("vp2", "vault-create") ||
        enter("vn2", "vault-pass-save") ||
        enter("pp-role-new", "pp-role-add")
    )
        return;
    if (e.key === "Enter" && e.target.id === "pi-q") {
        e.preventDefault();
        const b = $('[data-act="pi-pick"]:not([disabled])');
        b && b.click();
        return;
    }
    if (typing) return;
    if (m && m.kind === "coverpick") {
        if (/^[1-9]$/.test(e.key)) {
            const b = $(`[data-act="cp-pick"][data-k="${Number(e.key) - 1}"]`);
            b && b.click();
        } else if (e.key === "ArrowRight") $('[data-act="cp-next"]').click();
        else if (e.key === "ArrowLeft") {
            const b = $('[data-act="cp-prev"]');
            b && !b.disabled && b.click();
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
            toggleFav(m.id);
            return;
        }
    }
    if (ui.tab === "rank" && ui.page === "profile" && rankState.pair && !m) {
        if (e.key === "ArrowLeft") {
            rankPick(0);
            return;
        }
        if (e.key === "ArrowRight") {
            rankPick(1);
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            rankPick("draw");
            return;
        }
    }
    if (m && !mod) return;
    runKey(e);
});

// spine hover card
let tipEl = null;
document.addEventListener("mouseover", e => {
    const s = e.target.closest(".spine");
    if (!s) {
        if (tipEl) tipEl.hidden = true;
        return;
    }
    const b = items.get(s.dataset.id);
    if (!b) return;
    if (!tipEl) {
        tipEl = document.createElement("div");
        tipEl.className = "tip";
        document.body.append(tipEl);
    }
    tipEl.innerHTML = `<span class="call">${mDot(b.medium)}${esc(s.dataset.call)}</span><b>${esc(titleOf(b))}</b><span class="hint">${esc([b.creator, b.kind, b.year].filter(Boolean).join(" · "))}</span>${b.status === "active" ? `<span class="hint">${esc(progText(b))}</span>` : ""}<div class="meta" style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">${statusPill(b)}${copyPill(b)}${rateShow(b.rating, scaleOf(b))}${crowdPill(b)}</div>`;
    const r = s.getBoundingClientRect();
    tipEl.hidden = false;
    const x = Math.min(window.innerWidth - 270, Math.max(8, r.left + r.width / 2 - 120)),
        y = r.top - tipEl.offsetHeight - 10;
    tipEl.style.left = x + "px";
    tipEl.style.top = (y < 8 ? r.bottom + 10 : y) + "px";
});
// sidebar: drag its edge to resize
document.addEventListener("pointerdown", e => {
    const g = e.target.closest(".side-grip");
    if (!g) return;
    e.preventDefault();
    const side = $("#side"),
        rect = side.getBoundingClientRect(),
        right = meta.layout.side.pos === "right";
    document.body.classList.add("resizing");
    const mv = ev => {
        const w = Math.round(Math.max(170, Math.min(380, right ? rect.right - ev.clientX : ev.clientX - rect.left)));
        meta.layout.side.width = w;
        $("#app").style.setProperty("--side-w", w + "px");
    };
    const up = () => {
        removeEventListener("pointermove", mv);
        removeEventListener("pointerup", up);
        document.body.classList.remove("resizing");
        markDirty();
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
});
// drag and drop: lists (incl. Up next), favourites, characters, tier lists
let drag = null;
document.addEventListener("dragstart", e => {
    const q = e.target.closest(
        ui.arrange ? "[data-oid]" : ".qi[data-qid], [data-favid], [data-charid], .tchip[data-tkey]"
    );
    if (!q) return;
    drag = ui.arrange
        ? ["order", q.dataset.oid]
        : q.dataset.qid
          ? ["list", q.dataset.qid, q.dataset.lid]
          : q.dataset.favid
            ? ["fav", q.dataset.favid]
            : q.dataset.charid
              ? ["char", q.dataset.charid]
              : ["tier", q.dataset.tkey];
    q.classList.add("drag");
    e.dataTransfer.effectAllowed = "move";
    try {
        e.dataTransfer.setData("text/plain", drag[1]);
    } catch (_) {}
});
const dropTarget = el =>
    drag &&
    (drag[0] === "order"
        ? el.closest("[data-oid]")
        : drag[0] === "list"
          ? el.closest(`.qi[data-lid="${CSS.escape(drag[2] || "")}"]`)
          : drag[0] === "fav"
            ? el.closest("[data-favid]")
            : drag[0] === "char"
              ? el.closest("[data-charid]")
              : el.closest(".tzone, .tchip[data-tkey]"));
document.addEventListener("dragover", e => {
    const q = dropTarget(e.target);
    if (!q) return;
    e.preventDefault();
    $$(".over").forEach(x => x.classList.remove("over"));
    q.classList.add("over");
});
document.addEventListener("dragend", () => {
    drag = null;
    $$(".drag,.over").forEach(x => x.classList.remove("drag", "over"));
});
document.addEventListener("drop", e => {
    const q = dropTarget(e.target);
    if (!q || !drag) return;
    e.preventDefault();
    const [kind, from, lid] = drag;
    drag = null;
    if (kind === "list") {
        const to = q.dataset.qid;
        if (to !== from) listDrop(lid, from, to);
    }
    if (kind === "fav") favDrop(from, q.dataset.favid);
    if (kind === "order") orderDrop(from, q.dataset.oid);
    if (kind === "char") {
        const to = q.dataset.charid;
        if (to !== from)
            changeMeta("Reorder characters", "chars", list => {
                const ids = list
                        .slice()
                        .sort((a, b) => (a.rank || 999) - (b.rank || 999))
                        .map(c => c.id),
                    a = ids.filter(x => x !== from),
                    was = ids.indexOf(from),
                    at = ids.indexOf(to);
                a.splice(a.indexOf(to) + (was < at ? 1 : 0), 0, from);
                return a.map((id, i) => ({ ...list.find(c => c.id === id), rank: i + 1 }));
            });
    }
    if (kind === "tier") {
        const tl = meta.tiers.find(x => x.id === ui.tierId);
        if (!tl) return;
        const zone = q.closest(".tzone"),
            row = zone && zone.dataset.k !== undefined ? zone.dataset.k : "pool",
            beforeKey = q.dataset.tkey && q.dataset.tkey !== from ? q.dataset.tkey : null;
        changeMeta("Move in tier list", "tiers", T =>
            T.map(x => {
                if (x.id !== tl.id) return x;
                const rows = x.rows.map(r => ({ ...r, ids: r.ids.filter(k => k !== from) }));
                if (row !== "pool" && rows[Number(row)]) {
                    const ids = rows[Number(row)].ids,
                        i = beforeKey ? ids.indexOf(beforeKey) : -1;
                    i >= 0 ? ids.splice(i, 0, from) : ids.push(from);
                }
                return { ...x, rows };
            })
        );
        ui.tierSel = null;
    }
});
// pictures from files or the clipboard
async function useImageFile(f) {
    try {
        const target = pendingCover,
            m = ui.modal;
        const gif =
            f.type === "image/gif" && ["avatar", "banner", "char", "person", "fav"].includes(target) && f.size < 8e6;
        const data = gif
            ? await new Promise((res, rej) => {
                  const r = new FileReader();
                  r.onload = () => res(r.result);
                  r.onerror = rej;
                  r.readAsDataURL(f);
              })
            : await fileToJpeg(f, target === "banner" ? 3200 : target === "avatar" || target === "char" ? 900 : 1000);
        if (target === "add" && m && m.kind === "add") {
            m.coverData = data;
            renderOverlay();
        } else if (target === "char" && m && m.kind === "char") {
            const c = meta.chars.find(x => x.id === m.id);
            patchChar(m.id, { imageData: data, uploads: [...((c && c.uploads) || []), data] }, "Upload picture");
        } else if (target === "fav" && m && m.kind === "favedit")
            patch(m.id, { favArtData: data }, "Favourite picture");
        else if (target === "person" && m && m.kind === "person") {
            savePerson(m.name, p => ({ ...p, imageData: data }), "Upload picture");
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
            patch(m.id, { spineArt: data, spinePicked: true }, "Upload spine");
            toast("Spine changed", { label: "Undo", fn: undo });
        } else if (m && m.kind === "coverpick") {
            const id = m.queue[m.i];
            patch(
                id,
                { coverData: data, coverColor: null, color: null, coverPicked: true },
                "Use your picture as the cover"
            );
            m.picked++;
            m.i++;
            renderOverlay();
            coverPickLoad();
        } else if (m && m.kind === "item") {
            patch(
                m.id,
                { coverData: data, coverColor: null, color: null, coverPicked: true },
                "Use your picture as the cover"
            );
            cacheAndColour(m.id).then(() => {
                updateItemTiles(m.id);
                scheduleSave();
            });
            toast("Cover updated", { label: "Undo", fn: undo });
        }
    } catch (_) {
        toast("That image couldn't be read.");
    }
}
$("#file-cover").addEventListener("change", e => {
    const f = e.target.files[0];
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
        /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName) &&
        !(e.clipboardData && [...e.clipboardData.items].some(i => i.type.startsWith("image/")))
    )
        return;
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.type.startsWith("image/"));
    if (item) {
        e.preventDefault();
        pendingCover = m.kind === "item" ? "item" : m.kind === "favedit" ? "fav" : m.kind;
        if (m.kind === "add") m.draft = { ...m.draft, ...readFields("a-") };
        useImageFile(item.getAsFile());
    }
});
$("#file-import").addEventListener("change", async e => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) handleImportFile(f);
});
function fileToJpeg(file, max) {
    return createImageBitmap(file).then(bmp => {
        const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * k);
        c.height = Math.round(bmp.height * k);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", 0.9);
    });
}
window.addEventListener("online", () => {
    renderMain();
    autoCovers();
});
window.addEventListener("offline", () => renderMain());
document.addEventListener(
    "error",
    e => {
        const img = e.target;
        if (!img || img.tagName !== "IMG") return;
        const src = img.getAttribute("src") || "";
        // a picture that won't load directly gets one more try through the image proxy; its site is remembered so banners and spines use the proxy too
        if (/^https:/.test(src) && !/wsrv\.nl/.test(src) && meta.settings.imageProxy !== false) {
            img.src = coverCache.proxied(src);
            coverCache.learn(src);
            return;
        }
        if (img.parentNode && img.parentNode.classList && img.parentNode.classList.contains("cover")) {
            img.parentNode.classList.remove("has-img");
            img.remove();
        }
    },
    true
);
// countdowns tick in place; the page itself is never redrawn on a timer
setInterval(() => {
    for (const el of $$("[data-at]")) el.textContent = until(Number(el.dataset.at));
}, 30000);

// ═══════════════════════════════════════════
//  START
// ═══════════════════════════════════════════
(async () => {
    await boot();
    await fileSync.init();
    await folderSync.init();
    if (bootFresh) await loadHosted();
    let prefs = {};
    try {
        prefs = JSON.parse(localStorage.getItem("univerlist-ui") || "{}");
    } catch (_) {}
    for (const k of ["sort", "group", "copy"]) if (prefs[k]) ui[k] = prefs[k];
    const s = meta.settings;
    ui.mode = s.startMode === "last" ? prefs.mode || "universal" : s.startMode || "universal";
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
    if (window.ulJoining) {
        s.welcomed3 = true;
        markDirty();
        goSettings("account");
    } else if (!s.welcomed3 && !items.size) openModal("welcome");
    else if (back) {
        if (placeRestore.item) openItem(placeRestore.item);
        if (placeRestore.y) requestAnimationFrame(() => setTimeout(() => scrollTo(0, placeRestore.y), 60));
    }
    window.ulBooted = true;
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

// your own shelf arrangement: drag any cover onto another to put it there (undoable)
function orderDrop(from, to) {
    if (from === to) return;
    const mode = curMode(),
        box = $(`[data-oid="${CSS.escape(to)}"]`),
        grp = box && box.closest("[data-gsort]"),
        key = grp && ["mine", "rank"].includes(grp.dataset.gsort) ? "myOrder" : "orders";
    const shown = grp ? [...grp.querySelectorAll("[data-oid]")].map(x => x.dataset.oid) : listOrder.slice(),
        was = shown.indexOf(from),
        at = shown.indexOf(to);
    if (was < 0 || at < 0) return;
    const a = shown.filter(x => x !== from);
    a.splice(a.indexOf(to) + (was < at ? 1 : 0), 0, from);
    if (key === "myOrder") {
        const A = items.get(from),
            B = items.get(to);
        if (A && B && (A.rating || 0) !== (B.rating || 0))
            toast("Ranking keeps scores first: dragging reorders things with the same score.");
    }
    changeMeta(key === "myOrder" ? "Reorder my ranking" : "Arrange shelf", key, O => {
        const old = ((O || {})[mode.id] || []).filter(x => !a.includes(x));
        return { ...(O || {}), [mode.id]: [...a, ...old] };
    });
}
function setCover(id, url) {
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
async function coverPickLoad() {
    const m = ui.modal;
    if (!m || m.kind !== "coverpick") return;
    for (const id of m.queue.slice(m.i, m.i + 3)) {
        if (m.cands[id] !== undefined || !items.get(id)) continue;
        m.cands[id] = null;
        try {
            m.cands[id] = (await allArt({ id, ...items.get(id) })).covers.filter(c => !c.wide);
        } catch (_) {
            m.cands[id] = [];
        }
        if (ui.modal === m && m.queue[m.i] === id) renderOverlay();
    }
}
// the sidebar peeks from the toggle (after a short hover) or the screen edge, and hides a moment after you leave it.
// One motion only (a transform), and a grace period so passing over the gap never makes it flicker.
const sidePeek = { t: 0, leave: 0 };
function sideZone(e) {
    const app = $("#app"),
        right = meta.layout.side.pos === "right",
        w = meta.layout.side.width;
    return {
        app,
        right,
        edge: right ? e.clientX >= innerWidth - 8 : e.clientX <= 8,
        over: !!(e.target.closest && (e.target.closest("#side") || e.target.closest(".sidebtn"))),
        inBand: right ? e.clientX >= innerWidth - w - 16 : e.clientX <= w + 16,
    };
}
document.addEventListener("pointermove", e => {
    if (
        meta.layout.side.pinned ||
        e.pointerType === "touch" ||
        innerWidth < 861 ||
        document.body.classList.contains("resizing")
    )
        return;
    const z = sideZone(e),
        open = z.app.classList.contains("side-peek");
    if (!open) {
        if (z.edge) {
            clearTimeout(sidePeek.t);
            peekSide(true);
        } else if (e.target.closest && e.target.closest(".sidebtn")) {
            if (!sidePeek.t)
                sidePeek.t = setTimeout(() => {
                    sidePeek.t = 0;
                    peekSide(true);
                }, 140);
        } else {
            clearTimeout(sidePeek.t);
            sidePeek.t = 0;
        }
        return;
    }
    if (z.over || z.inBand) {
        clearTimeout(sidePeek.leave);
        sidePeek.leave = 0;
        return;
    }
    if (!sidePeek.leave)
        sidePeek.leave = setTimeout(() => {
            sidePeek.leave = 0;
            if (!meta.layout.side.pinned) peekSide(false);
        }, 260);
});
// close menus and popovers when clicking elsewhere
document.addEventListener(
    "pointerdown",
    e => {
        if (ui.modeMenu && !e.target.closest(".modepick")) {
            ui.modeMenu = false;
            $$(".modemenu").forEach(x => x.remove());
        }
        if (ui.pop && !e.target.closest(".pop")) {
            ui.pop = null;
            renderMain();
        }
    },
    true
);
