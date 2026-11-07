// src/features/watch-read/series.js
// ─────────────────────────────────────────────────────────────────
//  Servers for one series: the links and addresses that belong to just this show
//
//  Added from the player or the show page, as many as you like. They belong to the series, so every episode uses them,
//  and the anime and TV listings of the same show share them. Addresses (a link, or a pattern with {season} and
//  {episode}) are kept in your settings; links of the kinds an extension plays (it declares them in seriesServers) are
//  kept by that extension, so they are sealed with it in backups.
// ─────────────────────────────────────────────────────────────────

const ssName = () => {
    const sh = W.show || {};
    return (sh.groupId && ((meta.watchGroups || {})[sh.groupId] || {}).name) || sh.title || "";
};
const ssKey = () => {
    const sh = W.show || {};
    return (
        (sh.medium === "film" ? "f:" : "s:") +
        idTitle(cleanTitle(ssName())) +
        (sh.medium === "film" && sh.year ? ":" + sh.year : "")
    );
};
const ssOwners = () => EXT.list.filter(x => x.on && [].concat(x.manifest.seriesServers || []).length);
// an extension says which links it keeps: by how they start ("smb:") or, with a *, how they end ("*.strm")
const ssIsHeld = (v, x) => {
    const lv = v.toLowerCase(),
        bare = lv.split(/[?#]/)[0];
    return [].concat(x.manifest.seriesServers || []).some(sc => {
        sc = String(sc).toLowerCase();
        return sc.startsWith("*") ? bare.endsWith(sc.slice(1)) : lv.startsWith(sc);
    });
};
const ssOwnerFor = v => ssOwners().find(x => ssIsHeld(v, x));
const ssHeldBy = (x, key = ssKey()) => ((x.data || {}).series || {})[key] || [];
const ssLinks = (key = ssKey()) => (meta.settings.seriesServers || {})[key] || [];
// a short name for a server: its host, or (for a link an extension keeps) the start of it
const ssShort = v => {
    if (!/^https?:/i.test(v)) return v.length > 40 ? v.slice(0, 39) + "…" : v;
    try {
        return new URL(v.replace(/\{[^}]*\}/g, "x")).host;
    } catch (_) {
        return v.slice(0, 50);
    }
};
// every server this series has: [{ kind, name, value, owner? }]
function ssList() {
    const out = [];
    for (const x of ssOwners())
        for (const s of ssHeldBy(x))
            out.push({ kind: "held", name: s.name || ssShort(s.value), value: s.value, owner: x.manifest.id });
    for (const s of ssLinks()) out.push({ kind: "link", name: s.name || ssShort(s.value), value: s.value });
    return out;
}
// the library entries this show is saved on: its own and the same show filed as anime or TV
const SIB = new Map(); // the sibling lookup scans the whole library, and the episode list asks for it once per row: remember it
function ssSibling(t, m, y) {
    const k = m + "|" + t + "|" + y + "|" + items.size;
    if (!SIB.has(k)) {
        if (SIB.size > 200) SIB.clear();
        let id = null;
        try {
            id = typeof findSibling === "function" ? findSibling(t, m, y) : null;
        } catch (_) {}
        SIB.set(k, id);
    }
    return SIB.get(k);
}
function ssRelated(si) {
    const b = seasonItem(si),
        sh = W.show || {},
        out = b ? [b] : [],
        t = b ? b.title : sh.title,
        m = b ? b.medium : sh.medium,
        y = b ? b.year : sh.year;
    const sib = t ? ssSibling(t, m, y) : null;
    if (sib && items.has(sib) && !out.includes(items.get(sib))) out.push(items.get(sib));
    return out;
}
// a link saved for one episode, wherever the same show was filed (anime and TV use different keys)
function savedLink(si, e) {
    let rel;
    try {
        rel = ssRelated(si);
    } catch (_) {
        const b = seasonItem(si);
        rel = b ? [b] : [];
    } // never let this break the episode list
    const n = (W.seasons[si] || { n: 1 }).n;
    for (const [i, b] of rel.entries()) {
        const S = b.sources || {},
            keys = i ? [...new Set(["S" + n + "E" + e, "E" + e, srcKey(si, e)])] : [srcKey(si, e)];
        for (const k of keys) if (S[k]) return S[k];
    }
    return null;
}
// the sources this series' own servers give for one episode (addresses only; the other kinds go to the extension that plays them)
const ssSources = (si, e) =>
    ssLinks()
        .filter(s => s.on !== false)
        .map(s => ({ name: s.name || "This series' server", url: fillPattern(s.value, si, e) }));
MODALS.seriesservers = function () {
    const L = ssList(),
        owners = ssOwners();
    return (
        head("Servers for " + esc(ssName())) +
        `<p class="hint">As many as you like. They belong to this series, so every episode tries them. If one is slow or broken, switch under the player (⇄), or the next one is tried by itself.</p>
    <div class="ssl">${L.length ? L.map((s, i) => `<div class="srvrow"><span class="pill">${s.kind === "held" ? "Extension" : "Address"}</span><span class="sn" title="${esc(s.value)}"><b>${esc(s.name)}</b></span><button class="btn sm ghost" data-act="ss-del" data-k="${i}" aria-label="Remove">✕</button></div>`).join("") : `<p class="hint">None yet.</p>`}</div>
    <div class="fields"><div class="field full"><label for="ss-in">Paste links or addresses, one per line</label><textarea id="ss-in" rows="4" spellcheck="false" autofocus placeholder="http://nas.local/videos/{title}/Season {season}/{title} S{s2}E{e2}.mp4"></textarea></div>
      <div class="field"><label for="ss-name">Name (optional)</label><input id="ss-name" placeholder="e.g. Living-room NAS"></div></div>
    <div class="bar"><button class="btn gold" data-act="ss-add">Add</button></div>
    ${owners.length ? "" : `<p class="hint">Only addresses work without an extension; other kinds of link need the extension that plays them, switched on in Settings › Extensions.</p>`}`
    );
};
async function ssClick(act, t, k) {
    if (act === "ss-open") {
        if (W.show) openModal("seriesservers", {});
        return true;
    }
    if (act === "ss-add") {
        const raw = ($("#ss-in") || {}).value || "",
            name = (($("#ss-name") || {}).value || "").trim(),
            key = ssKey(),
            held = [],
            links = [],
            bad = [];
        for (const ln of raw
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(Boolean))
            ssOwnerFor(ln)
                ? held.push(ln)
                : /^https?:\/\//i.test(ln) && isOwnSource(ln)
                  ? links.push(ln)
                  : bad.push(ln);
        if (!held.length && !links.length) {
            toast(
                raw.trim() && /^https?:/im.test(raw)
                    ? NOT_OWN_SOURCE
                    : "Paste a link, or an address that starts with http"
            );
            return true;
        }
        if (held.length) {
            const o = ssOwnerFor(held[0]);
            if (!o) {
                toast("Switch on the extension that plays these links");
                return true;
            }
            const have = new Set(ssHeldBy(o).map(s => s.value)),
                add = held
                    .filter(v => !have.has(v))
                    .map(v => ({ value: v, name: held.length === 1 ? name : "", at: nowISO() }));
            o.data = {
                ...(o.data || {}),
                series: { ...((o.data || {}).series || {}), [key]: [...ssHeldBy(o), ...add] },
            };
            await extSave(o);
        }
        if (links.length) {
            const have = new Set(ssLinks().map(s => s.value)),
                add = links
                    .filter(v => !have.has(v))
                    .map(v => ({ value: v, name: links.length === 1 ? name : "", on: true }));
            meta.settings.seriesServers = { ...(meta.settings.seriesServers || {}), [key]: [...ssLinks(), ...add] };
            markDirty();
        }
        toast(
            `Added ${held.length + links.length} server${held.length + links.length === 1 ? "" : "s"}${bad.length ? `; ${bad.length} line${bad.length === 1 ? "" : "s"} skipped` : ""}`
        );
        ssRefreshPlayer();
        renderOverlay(true);
        if (ui.page === "watch" && W.view === "show") renderMain();
        return true;
    }
    if (act === "ss-del") {
        const s = ssList()[Number(k)],
            key = ssKey();
        if (!s) return true;
        if (s.kind === "held") {
            const o = extGet(s.owner);
            if (o) {
                o.data = {
                    ...(o.data || {}),
                    series: { ...((o.data || {}).series || {}), [key]: ssHeldBy(o).filter(x => x.value !== s.value) },
                };
                await extSave(o);
            }
        } else {
            meta.settings.seriesServers = {
                ...(meta.settings.seriesServers || {}),
                [key]: ssLinks().filter(x => x.value !== s.value),
            };
            markDirty();
        }
        if (W.player && s.kind === "link") {
            const u = fillPattern(s.value, W.player.si, W.player.e),
                n = W.player.srcs.length;
            W.player.srcs = W.player.srcs.filter(x => x.url !== u);
            if (W.player.srcs.length !== n) {
                W.player.k = 0;
                renderPlayer();
            }
        }
        renderOverlay(true);
        if (ui.page === "watch" && W.view === "show") renderMain();
        return true;
    }
    return false;
}
// after servers change while something is open: add the new ones to what the player is offering
function ssRefreshPlayer() {
    const p = W.player;
    if (!p) return;
    const had = p.srcs.length;
    for (const x of ssSources(p.si, p.e)) if (isOwnSource(x) && !p.srcs.some(y => y.url === x.url)) p.srcs.push(x);
    if (!had && p.srcs.length) {
        p.k = 0;
        renderPlayer();
    } else if (p.srcs.length !== had) renderPlayer();
    if (typeof extAddSources === "function") extAddSources(p);
}
