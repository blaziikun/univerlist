// src/features/watch-read/readlibs.js
// ─────────────────────────────────────────────────────────────────
//  Reading servers: Komga, Kavita, any OPDS catalogue (Calibre-web and others), or a shared folder of your own files
//
//  Your manga, manhwa, manhua and books are matched to your library by name; chapters and volumes come straight from
//  the server, nothing is copied here.
// ─────────────────────────────────────────────────────────────────

const RLIBS = () => (meta.settings.rlibs || []).filter(l => l.on !== false && l.url);
const OPNS = { pse: "http://vaemendis.net/opds-pse/ns" };
const chapNum = t => {
    const s = String(t || "");
    let m =
        /(?:ch(?:apter)?\.?|chap\.?|\bc|#|episode|ep\.?)\s*(\d+(?:\.\d+)?)/i.exec(s) ||
        /(?:vol(?:ume)?\.?|\bv)\s*(\d+(?:\.\d+)?)/i.exec(s) ||
        /(\d+(?:\.\d+)?)(?!.*\d)/.exec(s.replace(/\.\w{2,4}$/, "").replace(/\b(19|20)\d\d\b/g, ""));
    return m ? parseFloat(m[1]) : null;
};
// ── OPDS: one reader for Komga, Kavita, Calibre-web and every other catalogue ──
const OP = {
    root(l) {
        const b = libBase(l);
        return l.type === "kavita"
            ? `${b}/api/opds/${encodeURIComponent(libKey(l))}`
            : l.type === "komga"
              ? `${b}/opds/v1.2/catalog`
              : String(l.url).trim();
    },
    headers(l) {
        const k = libKey(l);
        if (!k || l.type === "kavita") return {};
        if (k.includes(":")) return { Authorization: "Basic " + btoa(unescape(encodeURIComponent(k))) };
        return l.type === "komga" ? { "X-API-Key": k } : {};
    },
    needsAuth: l => Object.keys(OP.headers(l)).length > 0,
    async get(l, url) {
        const r = await fetch(url, {
            headers: { Accept: "application/atom+xml, application/xml, text/xml, */*", ...OP.headers(l) },
        });
        if (!r.ok) throw new Error("http " + r.status);
        const x = new DOMParser().parseFromString(await r.text(), "application/xml");
        if (x.querySelector("parsererror")) throw new Error("http 404");
        return OP.parse(x, r.url || url);
    },
    parse(x, base) {
        const abs = h => {
                try {
                    return new URL(h, base).href;
                } catch (_) {
                    return h;
                }
            },
            link = (n, rel) =>
                [...n.children]
                    .filter(c => c.localName === "link")
                    .find(c => rel(c.getAttribute("rel") || "", c.getAttribute("type") || ""));
        const entries = [...x.getElementsByTagNameNS("*", "entry")].map(en => {
            const L = [...en.children].filter(c => c.localName === "link"),
                title = ((en.getElementsByTagNameNS("*", "title")[0] || {}).textContent || "").trim();
            const nav =
                L.find(
                    c =>
                        /kind=navigation|profile=opds-catalog/.test(c.getAttribute("type") || "") &&
                        !/acquisition/.test(c.getAttribute("rel") || "")
                ) || L.find(c => /subsection|collection/.test(c.getAttribute("rel") || ""));
            const acq = L.filter(c => /opds-spec\.org\/acquisition/.test(c.getAttribute("rel") || "")).map(c => ({
                href: abs(c.getAttribute("href")),
                type: c.getAttribute("type") || "",
            }));
            const ps = L.find(c => /opds-pse\/stream/.test(c.getAttribute("rel") || ""));
            const th = L.find(c => /opds-spec\.org\/image(\/thumbnail)?$/.test(c.getAttribute("rel") || ""));
            return {
                title,
                nav: nav && !acq.length ? abs(nav.getAttribute("href")) : null,
                acq,
                pse: ps
                    ? {
                          href: abs(ps.getAttribute("href")),
                          count: +(ps.getAttributeNS(OPNS.pse, "count") || ps.getAttribute("pse:count") || 0),
                      }
                    : null,
                thumb: th ? abs(th.getAttribute("href")) : "",
                num: chapNum(title),
            };
        });
        const top = x.documentElement,
            nx = link(top, r => r === "next"),
            sr = link(top, r => r === "search");
        return {
            title: ((top.getElementsByTagNameNS("*", "title")[0] || {}).textContent || "").trim(),
            entries,
            next: nx ? abs(nx.getAttribute("href")) : null,
            search: sr ? { href: abs(sr.getAttribute("href")), type: sr.getAttribute("type") || "" } : null,
        };
    },
    async test(l) {
        const f = await OP.get(l, OP.root(l));
        return f.title || "Connected";
    },
    async all(l, url, max = 30) {
        const out = [];
        let u = url,
            n = 0;
        while (u && n++ < max) {
            const f = await OP.get(l, u);
            out.push(...f.entries);
            u = f.next;
        }
        return out;
    },
    async search(l, q) {
        const root = await OP.get(l, OP.root(l));
        let tpl = null;
        if (root.search) {
            if (/opensearchdescription/.test(root.search.type)) {
                try {
                    const r = await fetch(root.search.href, { headers: OP.headers(l) });
                    const d = new DOMParser().parseFromString(await r.text(), "application/xml");
                    const u =
                        [...d.getElementsByTagNameNS("*", "Url")].find(x =>
                            /atom/.test(x.getAttribute("type") || "")
                        ) || d.getElementsByTagNameNS("*", "Url")[0];
                    if (u) tpl = new URL(u.getAttribute("template"), root.search.href).href;
                } catch (_) {}
            } else tpl = root.search.href;
        }
        if (tpl)
            return (
                await OP.get(
                    l,
                    tpl
                        .replace(/\{searchTerms\??\}|%7BsearchTerms(?:%3F)?%7D/gi, encodeURIComponent(q))
                        .replace(/\{[^}]+\?\}|%7B[^%]+%3F%7D/gi, "")
                )
            ).entries;
        // no search: walk the catalogue a little way down
        const seen = new Set(),
            found = [],
            queue = root.entries.filter(e => e.nav).map(e => e.nav);
        let n = 0;
        found.push(...root.entries);
        while (queue.length && n++ < 40) {
            const u = queue.shift();
            if (seen.has(u)) continue;
            seen.add(u);
            try {
                const f = await OP.get(l, u);
                found.push(...f.entries);
                f.entries.filter(e => e.nav).forEach(e => queue.push(e.nav));
            } catch (_) {}
        }
        return found.filter(e => titleScore(e.title, q) > 0.4);
    },
    // the chapters or volumes of one series
    async chapters(l, ref) {
        const E = await OP.all(l, ref);
        return E.filter(e => e.acq.length || e.pse).map(e => ({
            name: e.title,
            ch: e.num,
            pse: e.pse,
            file: pickAcq(e.acq),
            thumb: e.thumb,
        }));
    },
};
const pickAcq = A =>
    A.find(a => /cbz|comicbook\+zip|zip/.test(a.type)) ||
    A.find(a => /epub/.test(a.type)) ||
    A.find(a => /pdf/.test(a.type)) ||
    A[0] ||
    null;
// ── a shared folder of your own files ──
const RFD = {
    test: l => FD.test(l),
    series(idx) {
        const S = new Map(),
            add = (dir, ent) => {
                const key =
                    dir ||
                    ent.name.replace(/[\s._-]*(?:v(?:ol)?|ch(?:apter)?|c|#)?[\s._-]*\d+(?:\.\d+)?.*$/i, "").trim();
                if (!S.has(key))
                    S.set(key, {
                        ref: "s:" + key,
                        title: (key.split("/").pop() || key)
                            .replace(/[._]+/g, " ")
                            .replace(/\[[^\]]*\]/g, "")
                            .trim(),
                        items: [],
                    });
                S.get(key).items.push(ent);
            };
        const imgDirs = new Map();
        for (const f of idx.files) {
            const parts = f.split("/"),
                name = parts.pop(),
                dir = parts.join("/");
            if (READ_EXT.test(name))
                add(dir, {
                    name: name.replace(READ_EXT, ""),
                    ch: chapNum(name),
                    file: { href: FD.url(idx, f), type: name.split(".").pop().toLowerCase() },
                });
            else if (IMG_EXT.test(name)) {
                if (!imgDirs.has(dir)) imgDirs.set(dir, []);
                imgDirs.get(dir).push(f);
            }
        }
        for (const [dir, F] of imgDirs) {
            const parts = dir.split("/"),
                ch = parts.pop();
            add(parts.join("/"), {
                name: ch,
                ch: chapNum(ch),
                pages: F.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(f => FD.url(idx, f)),
            });
        }
        return [...S.values()].map(s => ({
            ...s,
            items: s.items.sort(
                (a, b) => (a.ch ?? 1e9) - (b.ch ?? 1e9) || a.name.localeCompare(b.name, undefined, { numeric: true })
            ),
        }));
    },
    async search(l, q) {
        const idx = await FD.crawl(l);
        return RFD.series(idx)
            .map(s => ({ title: s.title, nav: s.ref, sc: titleScore(s.title, q) }))
            .filter(s => s.sc > 0.4)
            .sort((a, b) => b.sc - a.sc);
    },
    async chapters(l, ref) {
        const idx = await FD.crawl(l);
        const s = RFD.series(idx).find(x => x.ref === ref);
        return s ? s.items.map(e => ({ name: e.name, ch: e.ch, pages: e.pages, file: e.file })) : [];
    },
    async browse(l) {
        const idx = await FD.crawl(l);
        return RFD.series(idx)
            .map(s => ({ title: s.title, nav: s.ref, n: s.items.length }))
            .sort((a, b) => a.title.localeCompare(b.title));
    },
};
const RAPI = l => (l.type === "folder" ? RFD : OP);
// ── matching a library item to your servers ──
const RLS = { item: null, list: [], note: "", busy: false, miss: false };
async function readMatch(id) {
    const libs = RLIBS(),
        it = items.get(id),
        exts = readExts();
    Object.assign(RLS, { item: id, list: [], note: "", miss: false });
    if ((!libs.length && !exts.length) || !it) return;
    RLS.busy = true;
    RLS.note = libs.length ? "Looking on your servers…" : "Looking through your extensions…";
    if (ui.page === "read") renderMain();
    const maps = (meta.readMap || {})[id] || {},
        names = [
            ...new Set([
                cleanTitle(titleOf(it)),
                cleanTitle(it.title),
                ...Object.values(it.alt || {})
                    .filter(Boolean)
                    .map(cleanTitle),
            ]),
        ],
        errs = [];
    for (const l of libs) {
        try {
            let ref = maps[l.id] && maps[l.id].ref;
            if (!ref) {
                let best = null;
                for (const q of names) {
                    for (const e of await RAPI(l).search(l, q)) {
                        if (!e.nav && !(e.acq || []).length) continue;
                        const sc = Math.max(...names.map(n => titleScore(e.title, n)));
                        if (!best || sc > best.sc) best = { e, sc };
                    }
                    if (best && best.sc >= 0.8) break;
                }
                if (best && best.sc >= 0.55) ref = best.e.nav || null;
                if (!ref && best && best.e.acq && best.e.acq.length && best.sc >= 0.8) {
                    RLS.list.push({
                        lib: l,
                        name: best.e.title,
                        ch: best.e.num,
                        file: pickAcq(best.e.acq),
                        pse: best.e.pse,
                    });
                    continue;
                }
            }
            if (!ref) continue;
            for (const c of await RAPI(l).chapters(l, ref)) RLS.list.push({ lib: l, ...c });
        } catch (e) {
            errs.push(libReach(e, l));
        }
    }
    // extensions that offer chapters (your own files on another machine, say): asked in turn, with every name the title goes by
    for (const id2 of exts) {
        const x = extGet(id2);
        if (!x) continue;
        try {
            const all = [
                ...new Set(
                    Object.values((x.data || {}).series || {})
                        .flat()
                        .map(s => s && s.value)
                        .filter(Boolean)
                ),
            ];
            const r = await extCall(
                id2,
                "read.sources",
                [
                    {
                        title: names[0],
                        alt: names.slice(1),
                        medium: it.medium,
                        ids: { ...(it.ext || {}) },
                        servers: { all },
                    },
                ],
                60000
            );
            const web = u => typeof u === "string" && /^https?:\/\//.test(u);
            for (const c of [].concat(r || []))
                if (c && (web(c.url) || (Array.isArray(c.pages) && c.pages.some(web))))
                    RLS.list.push({
                        lib: { id: "ext:" + id2, name: x.manifest.name, ext: true },
                        ext: true,
                        name: String(c.name || "Chapter").slice(0, 120),
                        ch: Number.isFinite(+c.ch) && c.ch !== null ? +c.ch : null,
                        vol: Number.isFinite(+c.vol) && c.vol !== null ? +c.vol : null,
                        file: web(c.url) ? { href: c.url, type: String(c.type || "cbz").toLowerCase() } : null,
                        pages: Array.isArray(c.pages) ? c.pages.filter(web) : undefined,
                        from: c.from ? String(c.from).slice(0, 40) : "",
                    });
        } catch (e) {
            errs.push(`${x.manifest.name} didn't answer`);
        }
    }
    RLS.list.sort(
        (a, b) => (a.ch ?? 1e9) - (b.ch ?? 1e9) || a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    RLS.busy = false;
    RLS.miss = !RLS.list.length;
    RLS.note = RLS.list.length
        ? `On ${[...new Set(RLS.list.map(x => x.lib.name || LIB_TYPES[x.lib.type]))].join(" and ")}: ${plural(RLS.list.length, (unitOf(it)[0] || "chapter").toLowerCase())}`
        : errs[0] || "Not found on your servers.";
    if (ui.page === "read") renderMain();
}
// extensions switched on that offer chapters
const readExts = () => [...EXT.frames.entries()].filter(([, F]) => F.jobs.has("read.sources")).map(([id]) => id);
function readServerListHTML(it) {
    if (!RLIBS().length && !readExts().length)
        return `<p class="hint">Add your Komga, Kavita or a shared folder under <button class="linkbtn" data-act="rl-servers">Your servers</button> and chapters show up here by themselves.</p>`;
    const prog = it.prog || 0,
        unit = unitOf(it)[0] || "Chapter";
    return `<section class="wrow"><h3>On your servers <span class="hint">${esc(RLS.note)}</span>${RLIBS().length ? ` <button class="linkbtn" data-act="rl-pick-open">${RLS.miss ? "Pick it…" : "Not the right one?"}</button>` : ""}</h3>
    ${ui.rlPick ? readPickHTML() : ""}
    ${
        RLS.list.length
            ? `<div class="bar" style="margin-bottom:8px">${(() => {
                  const nx = RLS.list.findIndex(x => x.ch == null || x.ch > prog);
                  return nx >= 0
                      ? `<button class="btn gold" data-act="rl-read" data-k="${nx}">${prog ? "Continue" : "Start"}: ${esc(RLS.list[nx].ch != null ? unit + " " + RLS.list[nx].ch : RLS.list[nx].name)}</button>`
                      : "";
              })()}</div>
      <div class="rlist">${RLS.list.map((c, i) => `<button class="rlrow${c.ch != null && c.ch <= prog ? " seen" : ""}" data-act="rl-read" data-k="${i}">${c.thumb ? `<img src="${esc(c.thumb)}" alt="" loading="lazy">` : `<span class="rln">${c.ch ?? "•"}</span>`}<span class="rlt"><b>${esc(c.name)}</b><small>${esc([c.pse ? plural(c.pse.count, "page") : c.pages ? plural(c.pages.length, "page") : c.file ? (c.file.type.split(/[/+]/).pop() || "file").toUpperCase() : "", c.lib.name].filter(Boolean).join(" · "))}</small></span>${c.ch != null && c.ch <= prog ? `<span class="hint">read</span>` : ""}</button>`).join("")}</div>`
            : ""
    }</section>`;
}
async function readPickOpen(q) {
    const it = items.get(RD.item);
    ui.rlPick = { q: q || cleanTitle(titleOf(it)), busy: true, res: [] };
    renderMain();
    for (const l of RLIBS()) {
        try {
            for (const e of await RAPI(l).search(l, ui.rlPick.q))
                if (e.nav)
                    ui.rlPick.res.push({ lib: l.id, libName: l.name, title: e.title, ref: e.nav, thumb: e.thumb });
        } catch (_) {}
    }
    ui.rlPick.busy = false;
    renderMain();
}
function readPickHTML() {
    const P = ui.rlPick;
    return `<div class="panel libpick"><div class="bar"><input class="inp" id="rl-q" value="${esc(P.q)}" style="flex:1"><button class="btn sm" data-act="rl-pick-go">Search</button><button class="linkbtn" data-act="rl-pick-close">Close</button></div>
    ${P.busy ? `<p class="think">Looking…</p>` : P.res.length ? `<div class="rlist">${P.res.map((r, i) => `<button class="rlrow" data-act="rl-pick" data-k="${i}">${r.thumb ? `<img src="${esc(r.thumb)}" alt="">` : `<span class="rln">≡</span>`}<span class="rlt"><b>${esc(r.title)}</b><small>${esc(r.libName)}</small></span></button>`).join("")}</div>` : `<p class="hint">Nothing with that name.</p>`}</div>`;
}
// ── browsing a server ──
const RB = { lib: null, stack: [], entries: null, busy: false, err: "" };
async function readBrowse(id, url, title) {
    const l = libById(id);
    if (!l) return;
    RB.lib = id;
    RB.busy = true;
    RB.err = "";
    renderMain();
    try {
        if (l.type === "folder") {
            if (!url) {
                RB.stack = [{ title: l.name, url: "" }];
                RB.entries = await RFD.browse(l);
            } else {
                RB.stack.push({ title, url });
                RB.entries = (await RFD.chapters(l, url)).map(c => ({ title: c.name, chap: c }));
            }
        } else {
            const u = url || OP.root(l);
            if (!url) RB.stack = [];
            RB.stack.push({ title: title || l.name, url: u });
            const f = await OP.get(l, u);
            RB.entries = f.entries.map(e =>
                e.nav
                    ? e
                    : { ...e, chap: { name: e.title, ch: e.num, pse: e.pse, file: pickAcq(e.acq), thumb: e.thumb } }
            );
        }
    } catch (e) {
        RB.err = libReach(e, l);
        RB.entries = [];
    }
    RB.busy = false;
    renderMain();
}
function readBrowseHTML() {
    const libs = RLIBS();
    if (!libs.length)
        return `<section class="wrow wsrvhint"><h3>Your own books and manga</h3><p class="hint">Add Komga, Kavita, Calibre-web (or any OPDS catalogue), or a shared folder from your NAS or cloud, and read everything on it here. Chapters are matched to your library by name. <button class="linkbtn" data-act="rl-servers">Add a server</button></p></section>`;
    const l = libById(RB.lib);
    return `<section class="wrow"><h3>On your servers <span class="chips inl">${libs.map(x => `<button class="chip" data-act="rl-browse" data-k="${esc(x.id)}" aria-pressed="${RB.lib === x.id}">${esc(x.name || LIB_TYPES[x.type])}</button>`).join("")}</span></h3>
    ${l && RB.stack.length > 1 ? `<div class="crumbs">${RB.stack.map((s, i) => (i < RB.stack.length - 1 ? `<button class="linkbtn" data-act="rl-up" data-k="${i}">${esc(s.title)}</button> / ` : `<b>${esc(s.title)}</b>`)).join("")}</div>` : ""}
    ${
        RB.busy
            ? `<p class="think">Reading the server…</p>`
            : RB.err
              ? `<p class="err">${esc(RB.err)}</p>`
              : RB.entries
                ? RB.entries.length
                    ? `<div class="rlist grid">${RB.entries
                          .slice(0, 300)
                          .map(
                              (e, i) =>
                                  `<button class="rlrow" data-act="${e.chap ? "rl-bread" : "rl-bopen"}" data-k="${i}">${e.thumb ? `<img src="${esc(e.thumb)}" alt="" loading="lazy">` : `<span class="rln">${e.chap ? (e.chap.ch ?? "•") : "≡"}</span>`}<span class="rlt"><b>${esc(e.title)}</b><small>${e.chap ? esc(e.chap.pse ? plural(e.chap.pse.count, "page") : e.chap.pages ? plural(e.chap.pages.length, "page") : "Read") : e.n ? plural(e.n, "file") : "Open"}</small></span></button>`
                          )
                          .join("")}</div>`
                    : `<p class="hint">Empty.</p>`
                : `<p class="hint">Pick a server to see what's on it.</p>`
    }</section>`;
}
// ── opening a chapter from a server in the reader ──
async function readRemote(list, i) {
    RD.files = list.map(c => ({ name: c.name, ch: c.ch, remote: c }));
    readStart(i);
}
async function remotePages(c) {
    const l = c.lib || libById(RB.lib);
    if (c.pages) return c.pages;
    if (c.pse && c.pse.count) {
        const urls = Array.from({ length: c.pse.count }, (_, n) =>
            c.pse.href.replace(/\{pageNumber\}|%7BpageNumber%7D/gi, n).replace(/\{maxWidth\}|%7BmaxWidth%7D/gi, 1600)
        );
        if (!l || !OP.needsAuth(l)) return urls;
        // servers that need a key on every request: fetch the pages ourselves, a few at a time
        const out = urls.map(() => "data:image/gif;base64,R0lGODlhAQABAAAAACw=");
        let i = 0;
        const book = RD.book;
        const one = async () => {
            while (i < urls.length && RD.book === book) {
                const n = i++;
                try {
                    const r = await fetch(urls[n], { headers: OP.headers(l) });
                    const blob = await r.blob();
                    if (RD.book !== book) return; // closed meanwhile
                    out[n] = readerURL(blob);
                    if (RD.pages === out && RD.idx === n) renderReader();
                } catch (_) {}
            }
        };
        await Promise.race([Promise.all([one(), one(), one()]), sleep(1500)]);
        return out;
    }
    return null;
}
async function remoteFile(c) {
    const l = c.lib || libById(RB.lib),
        r = await fetch(c.file.href, { headers: c.ext || !l || l.type === "folder" ? {} : OP.headers(l) });
    if (!r.ok) throw new Error("http " + r.status);
    const ext = /epub/.test(c.file.type)
        ? "epub"
        : /pdf/.test(c.file.type)
          ? "pdf"
          : /zip|cbz/.test(c.file.type)
            ? "cbz"
            : c.file.type || "cbz";
    return new File([await r.blob()], (c.name || "file").replace(/[\\/:*?"<>|]+/g, " ") + "." + ext);
}
document.addEventListener(
    "click",
    async e => {
        const t = e.target.closest("[data-act]");
        if (!t || !t.dataset.act.startsWith("rl-")) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const a = t.dataset.act,
            k = t.dataset.k;
        if (a === "rl-servers") {
            ui.readServers = !ui.readServers;
            renderMain();
        }
        if (a === "rl-browse") readBrowse(k);
        if (a === "rl-bopen") {
            const en = RB.entries[Number(k)];
            if (en) readBrowse(RB.lib, en.nav, en.title);
        }
        if (a === "rl-up") {
            const i = Number(k),
                s = RB.stack[i];
            RB.stack = RB.stack.slice(0, i);
            readBrowse(RB.lib, s.url || null, s.title);
        }
        if (a === "rl-bread") {
            const chaps = RB.entries.filter(x => x.chap).map(x => ({ ...x.chap, lib: libById(RB.lib) })),
                en = RB.entries[Number(k)];
            RD.item = RD.item || null;
            readRemote(
                chaps,
                chaps.findIndex(c => c.name === en.chap.name)
            );
        }
        if (a === "rl-read") readRemote(RLS.list, Number(k));
        if (a === "rl-pick-open") readPickOpen();
        if (a === "rl-pick-go") readPickOpen(($("#rl-q") || {}).value);
        if (a === "rl-pick-close") {
            ui.rlPick = null;
            renderMain();
        }
        if (a === "rl-pick") {
            const r = ui.rlPick.res[Number(k)];
            if (!r) return;
            meta.readMap = meta.readMap || {};
            meta.readMap[RD.item] = { ...(meta.readMap[RD.item] || {}), [r.lib]: { ref: r.ref, title: r.title } };
            markDirty();
            ui.rlPick = null;
            readMatch(RD.item);
        }
    },
    true
);
document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.id === "rl-q") {
        e.preventDefault();
        readPickOpen(e.target.value);
    }
});
