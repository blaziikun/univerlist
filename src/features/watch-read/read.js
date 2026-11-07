// src/features/watch-read/read.js
// ─────────────────────────────────────────────────────────────────
//  Read (beta): open your own files (PDF, EPUB, CBZ/ZIP of pages, a folder of images) and read them here
//
//  Manga reads right to left page by page, manhwa scrolls down, books open in the browser's own PDF view or as EPUB
//  chapters. Finishing a chapter logs it.
// ─────────────────────────────────────────────────────────────────

const RD = {
    item: null,
    files: [],
    pages: null,
    idx: 0,
    kind: "",
    chap: null,
    chapters: null,
    ci: 0,
    opts: false,
    book: 0,
};
// every page picture of the open book that lives in memory (from a CBZ, an EPUB, a PDF, a server that needs a key) has
// an address made here, and closing the book lets them all go, so a long reading session doesn't pile up hundreds of MB
let readerURLs = [];
function readerURL(blob) {
    const u = URL.createObjectURL(blob);
    readerURLs.push(u);
    return u;
}
function readerDrop() {
    for (const u of readerURLs) URL.revokeObjectURL(u);
    readerURLs = [];
    RD.book++;
    RD.pages = null;
    RD.chapters = null;
}
const readable = b => ["book", "manga", "manhwa", "novel", "comic"].includes(b.medium);
// the Read page with a book or series open (stage.js draws the page itself, and this when something is open)
function readerPageHTML() {
    const it = items.get(RD.item);
    return `<div class="watch read">
    ${stageHeadHTML("read")}
    ${ui.readServers ? `<section class="panel wservers"><h3>Your reading servers<span class="r"><button class="btn sm ghost" data-act="rl-servers">Done</button></span></h3>${libsPanelHTML("rlibs")}</section>` : ""}
    <section class="wshow"><div class="wshade"></div><div class="wsh">${coverSrc({ id: RD.item, ...it }) ? `<img class="wposter" src="${esc(coverSrc({ id: RD.item, ...it }))}" alt="">` : ""}<div><p class="eyebrow">${esc([MEDIA[it.medium].one, it.creator].filter(Boolean).join(" · "))}</p><h2>${esc(titleOf(it))}</h2><p class="hint">${esc(progText(it))}</p>
        <div class="bar"><button class="btn sm gold" data-act="read-files">Open ${it.medium === "book" || it.medium === "novel" ? "the book (PDF or EPUB)" : "chapters (CBZ, ZIP, PDF or images)"}…</button><button class="btn sm ghost" data-act="open" data-id="${esc(RD.item)}">Open card</button><button class="btn sm ghost" data-act="read-home">← Back</button></div></div></div></section>
      ${RD.files.length ? `<section class="wrow"><h3>Opened this time</h3><div class="weps">${RD.files.map((f, i) => `<div class="wep"><span class="wnum">${f.ch ?? i + 1}</span><div class="wet"><b>${esc(fname(f))}</b><small>${esc(f.ch != null ? unitOf(it)[0] + " " + f.ch : "")}</small></div><div class="wea"><button class="btn sm gold" data-act="read-start" data-k="${i}">Read</button></div></div>`).join("")}</div></section>` : ""}${readServerListHTML(it)}
    <p class="hint wnote">Nothing is uploaded or copied: files you open stay on your computer, and chapters on your servers are read straight from them. Finishing a chapter logs it to the card.</p></div>`;
}
const fname = f => (f.file ? f.file.name : f.name || "");
function readFromItem(id) {
    if (!stageOn()) {
        stageOffNote();
        return;
    }
    closeCtx();
    closeModal();
    RD.item = id;
    RD.files = [];
    ui.rlPick = null;
    ui.page = "read";
    render();
    window.scrollTo(0, 0);
    readMatch(id);
}
function readPickFiles() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.multiple = true;
    inp.accept = ".pdf,.epub,.cbz,.zip,image/*";
    inp.onchange = () => {
        const F = [...inp.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        if (!F.length) return;
        if (F.every(f => f.type.startsWith("image/"))) {
            RD.files = [{ file: F[0], images: F, ch: null }];
            readStart(0);
            return;
        }
        RD.files = F.map(f => {
            const m =
                /(?:ch(?:apter)?|c|#|vol)[ ._-]*(\d+(?:\.\d+)?)/i.exec(f.name) ||
                /(\d+(?:\.\d+)?)(?!.*\d)/.exec(f.name.replace(/\.\w+$/, ""));
            return { file: f, ch: m ? parseFloat(m[1]) : null };
        });
        if (RD.files.length === 1) readStart(0);
        else renderMain();
    };
    inp.click();
}
async function readStart(i) {
    const f = RD.files[i];
    if (!f) return;
    RD.fi = i;
    RD.idx = 0;
    RD.ar = null;
    readerDrop();
    RD.ci = 0;
    // from a server: pages stream straight in; whole files (CBZ, EPUB, PDF) are fetched, then opened like your own
    if (f.remote && !f.file && !f.images) {
        try {
            const pg = await remotePages(f.remote);
            if (pg) {
                f.pages = pg;
            } else if (f.remote.file) {
                toast("Opening…");
                f.file = await remoteFile(f.remote);
            } else {
                toast("Nothing to read in that one.");
                return;
            }
        } catch (e) {
            toast(libReach(e, f.remote.lib));
            return;
        }
    }
    const name = fname(f).toLowerCase(),
        it = RD.item && items.get(RD.item),
        o = RS();
    RD.rtl = o.rtl != null ? o.rtl : !!(it && it.medium === "manga");
    RD.mode = o.mode || (it && it.medium === "manhwa" ? "scroll" : "paged");
    try {
        if (f.pages) {
            RD.kind = "images";
            RD.pages = f.pages;
        } else if (f.images) {
            RD.kind = "images";
            RD.pages = f.images.map(readerURL);
        } else if (/\.pdf$/.test(name)) {
            RD.kind = "pdf";
            RD.pages = [readerURL(f.file)];
        } else if (/\.(cbz|zip)$/.test(name)) {
            RD.kind = "images";
            const files = await unzip(await f.file.arrayBuffer());
            RD.pages = [...files.keys()]
                .filter(k => /\.(jpe?g|png|webp|gif|avif)$/i.test(k))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                .map(k =>
                    readerURL(
                        new Blob([files.get(k)], {
                            type: "image/" + k.split(".").pop().toLowerCase().replace("jpg", "jpeg"),
                        })
                    )
                );
        } else if (/\.epub$/.test(name)) {
            RD.kind = "epub";
            RD.chapters = await epubChapters(await unzip(await f.file.arrayBuffer()));
        } else {
            toast("That file type can't be read here.");
            return;
        }
    } catch (e) {
        console.warn(e);
        toast("Couldn't open that file.");
        return;
    }
    const at = loadReadPos();
    if (at && at.f === fname(f)) {
        RD.idx = at.i || 0;
        RD.ci = at.c || 0;
    }
    renderReader();
}
// EPUB: chapters in reading order, pictures rewritten to local addresses
async function epubChapters(files) {
    const T = k => new TextDecoder().decode(files.get(k)),
        find = p => [...files.keys()].find(k => k === p || k.endsWith("/" + p));
    const cont = T(find("META-INF/container.xml")),
        opfPath = /full-path="([^"]+)"/.exec(cont)[1],
        opf = new DOMParser().parseFromString(T(opfPath), "application/xml"),
        base = opfPath.includes("/") ? opfPath.replace(/[^/]+$/, "") : "";
    const man = {};
    for (const it of opf.querySelectorAll("manifest > item"))
        man[it.getAttribute("id")] = {
            href: decodeURIComponent(it.getAttribute("href")),
            type: it.getAttribute("media-type"),
        };
    const urls = {};
    // only pictures and style sheets get an address (a page saying it's "text/html; image" doesn't)
    for (const m of Object.values(man))
        if (/^(image\/[a-z0-9.+-]+|text\/css)$/i.test(m.type || "")) {
            const k = find(base + m.href) || find(m.href);
            if (k) urls[m.href.split("/").pop()] = readerURL(new Blob([files.get(k)], { type: m.type }));
        }
    return [...opf.querySelectorAll("spine > itemref")]
        .map(r => man[r.getAttribute("idref")])
        .filter(Boolean)
        .map(m => {
            const k = find(base + m.href) || find(m.href);
            if (!k) return null;
            let html = T(k).replace(/(src|href|xlink:href)="([^"]+)"/g, (s, a, u) =>
                urls[u.split("/").pop()] ? `${a}="${urls[u.split("/").pop()]}"` : s
            );
            return html;
        })
        .filter(Boolean);
}
// ── the reader: every choice is yours, remembered separately for manga, manhwa, comics and books ──
// Pictures: page by page (one page or two side by side, right to left or left to right) or one long scroll; fit, zoom, width, gaps,
// background, brightness, auto-scroll. Books (EPUB): font, size, spacing, width, light / sepia / dark. Reaching the end logs it.
const RD_DEF = {
    mode: "",
    rtl: null,
    spread: "single",
    coverAlone: true,
    fit: "both",
    zoom: 100,
    width: 900,
    gap: 0,
    bg: "black",
    bright: 100,
    tapNext: false,
    showBar: true,
    autoLog: true,
    scrollSpeed: 60,
    preload: 4,
    font: "serif",
    size: 19,
    line: 1.6,
    measure: 680,
    theme: "dark",
    justify: false,
};
const RD_BG = { black: "#000", dark: "#141416", grey: "#2a2a2e", white: "#f6f6f4", sepia: "#efe4cc" };
const RD_THEMES = { dark: ["#141416", "#e6e3dc"], sepia: ["#f4ead4", "#3b2f22"], light: ["#fbfbf8", "#1c1c1e"] };
const RD_FONTS = {
    serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};
// which set of choices applies: the kind of thing you're reading
const rdKind = () => {
    const it = RD.item && items.get(RD.item);
    if (RD.kind === "epub" || RD.kind === "pdf") return "book";
    const m = it && it.medium;
    return ["manga", "manhwa", "comic"].includes(m) ? m : "images";
};
const RS = () => {
    const R = meta.settings.reader || {},
        k = rdKind(),
        base = { ...RD_DEF, ...(R.all || {}) };
    // defaults that fit the kind: manga right to left page by page; manhwa one long scroll at a readable width
    if (k === "manga") Object.assign(base, { rtl: true, mode: "paged" });
    if (k === "manhwa") Object.assign(base, { mode: "scroll", fit: "width" });
    const legacy = {
        ...(R.mode ? { mode: R.mode } : {}),
        ...(R.rtl != null ? { rtl: R.rtl } : {}),
        ...(R.fit ? { fit: R.fit } : {}),
    }; // choices saved before they were per kind
    return { ...base, ...legacy, ...(R[k] || {}) };
};
function rdSet(patch) {
    const R = meta.settings.reader || {},
        k = rdKind();
    meta.settings.reader = { ...R, [k]: { ...(R[k] || {}), ...patch } };
    markDirty();
}
const readPosKey = () => "ul-read-" + (RD.item || "x");
const loadReadPos = () => {
    try {
        return JSON.parse(localStorage.getItem(readPosKey()) || "null");
    } catch (_) {
        return null;
    }
};
const saveReadPos = () => {
    try {
        localStorage.setItem(readPosKey(), JSON.stringify({ f: fname(RD.files[RD.fi]), i: RD.idx, c: RD.ci }));
    } catch (_) {}
};
// the pages shown together right now: one, or two side by side (the cover on its own if you like)
function rdSpread(i) {
    const o = RS(),
        n = RD.pages.length;
    if (RD.mode !== "paged" || o.spread === "single" || (o.spread === "auto" && innerWidth < innerHeight * 1.1))
        return [i];
    const start = o.coverAlone ? (i === 0 ? 0 : i - ((i - 1) % 2)) : i - (i % 2);
    return start === 0 && o.coverAlone ? [0] : [start, start + 1].filter(x => x < n);
}
function rdBookCSS(o) {
    const [bg, fg] = RD_THEMES[o.theme] || RD_THEMES.dark;
    return `<style>html{background:${bg}}body{background:${bg}!important;color:${fg}!important;font-family:${RD_FONTS[o.font] || RD_FONTS.serif}!important;font-size:${o.size}px!important;line-height:${o.line}!important;max-width:${o.measure}px;margin:0 auto!important;padding:48px 24px 96px!important;${o.justify ? "text-align:justify;hyphens:auto;" : ""}}p,div,span,li{font-family:inherit!important;line-height:inherit!important}a{color:inherit}img,svg{max-width:100%!important;height:auto!important}</style>`;
}
function rdOptsHTML(o) {
    const seg = (k, opts) =>
        `<div class="seg">${opts.map(([v, l]) => `<button data-act="rd-set" data-k="${k}" data-v="${v}" aria-pressed="${String(o[k]) === String(v)}">${l}</button>`).join("")}</div>`;
    const rng = (k, l, a, b, st, unit = "") =>
        `<label class="ctl rng">${l} <input type="range" min="${a}" max="${b}" step="${st}" data-ro="${k}" value="${o[k]}"><output>${o[k]}${unit}</output></label>`;
    const chk = (k, l) =>
        `<label class="ctl"><input type="checkbox" data-ro="${k}" ${o[k] ? "checked" : ""}> ${l}</label>`;
    const book = RD.kind === "epub",
        pics = RD.kind === "images";
    return `<div class="cin-opts panel rd-opts"><p class="ilab">Reader · ${esc({ manga: "manga", manhwa: "manhwa", comic: "comics", images: "pictures", book: "books" }[rdKind()])} <span class="hint">(remembered for all ${esc({ manga: "manga", manhwa: "manhwa", comic: "comics", images: "picture files", book: "books" }[rdKind()])})</span></p>
    ${
        pics
            ? `<div class="rdo-row"><span>Layout</span>${seg("mode", [
                  ["paged", "Page by page"],
                  ["scroll", "One long scroll"],
              ])}</div>
      ${
          RD.mode === "paged"
              ? `<div class="rdo-row"><span>Direction</span>${seg("rtl", [
                    ["true", "Right to left"],
                    ["false", "Left to right"],
                ])}</div>
        <div class="rdo-row"><span>Pages</span>${seg("spread", [
            ["single", "One"],
            ["double", "Two side by side"],
            ["auto", "Two when wide"],
        ])}</div>${o.spread !== "single" ? chk("coverAlone", "First page on its own") : ""}
        <div class="rdo-row"><span>Fit</span>${seg("fit", [
            ["both", "Whole page"],
            ["width", "Width"],
            ["height", "Height"],
            ["original", "Actual size"],
        ])}</div>${chk("tapNext", "Click anywhere to go to the next page")}`
              : `${rng("width", "Width", 360, 1800, 20, " px")}${rng("gap", "Gap between pages", 0, 60, 2, " px")}${rng("scrollSpeed", "Auto-scroll speed", 10, 400, 10, " px/s")}`
      }
      ${rng("zoom", "Zoom", 50, 300, 10, "%")}`
            : ""
    }
    ${
        book
            ? `<div class="rdo-row"><span>Page</span>${seg("theme", [
                  ["dark", "Dark"],
                  ["sepia", "Sepia"],
                  ["light", "Light"],
              ])}</div>
      <div class="rdo-row"><span>Font</span>${seg("font", [
          ["serif", "Serif"],
          ["sans", "Sans"],
          ["mono", "Mono"],
      ])}</div>
      ${rng("size", "Text size", 12, 36, 1, " px")}${rng("line", "Line spacing", 1.1, 2.4, 0.1)}${rng("measure", "Line length", 380, 1100, 20, " px")}${chk("justify", "Justified text")}`
            : ""
    }
    ${
        !book
            ? `<div class="rdo-row"><span>Background</span>${seg(
                  "bg",
                  Object.keys(RD_BG).map(k => [k, k[0].toUpperCase() + k.slice(1)])
              )}</div>${rng("bright", "Brightness", 40, 120, 5, "%")}`
            : ""
    }
    ${chk("showBar", "Show the progress bar")}${chk("autoLog", "Log my progress when I reach the end")}
    <p class="hint">Keys: ← → pages · space / shift-space · Home / End · + − zoom · D two pages · A auto-scroll · F full screen · Esc close</p></div>`;
}
function renderReader() {
    let el = $("#reader");
    if (!RD.pages && !RD.chapters) {
        if (el) el.remove();
        document.body.classList.remove("cinema-on");
        rdAuto(false);
        return;
    }
    if (!el) {
        el = document.createElement("div");
        el.id = "reader";
        document.body.append(el);
    }
    document.body.classList.add("cinema-on");
    const o = RS(),
        f = RD.files[RD.fi],
        n = RD.pages ? RD.pages.length : RD.chapters.length,
        it = RD.item && items.get(RD.item);
    RD.mode = RD.kind === "images" ? o.mode || "paged" : RD.mode;
    RD.rtl = o.rtl != null ? o.rtl === true || o.rtl === "true" : false;
    const at = RD.kind === "epub" ? RD.ci : RD.idx,
        title = `${it ? cleanTitle(titleOf(it)) : fname(f)}${f.ch != null ? " · " + (it ? unitOf(it)[0] : "chapter") + " " + f.ch : ""}`;
    const shown = RD.kind === "images" && RD.mode === "paged" ? rdSpread(RD.idx) : [RD.idx];
    let stage;
    if (RD.kind === "pdf") stage = `<iframe class="rdpdf" src="${esc(RD.pages[0])}" title="PDF"></iframe>`;
    else if (RD.kind === "epub") {
        const html = RD.chapters[RD.ci],
            css = rdBookCSS(o),
            doc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + css) : css + html;
        stage = `<iframe class="rdepub" sandbox="allow-same-origin" srcdoc="${esc(doc).replace(/"/g, "&quot;")}" title="Chapter"></iframe>`;
    } else if (RD.mode === "scroll")
        stage = `<div class="rdscroll" style="--rdw:${Math.round((o.width * o.zoom) / 100)}px;--rdgap:${o.gap}px">${RD.pages.map((u, i) => `<img src="${esc(u)}" alt="Page ${i + 1}" loading="${Math.abs(i - RD.idx) < 3 ? "eager" : "lazy"}" data-pg="${i}">`).join("")}<div class="rdend"><button class="btn gold" data-act="rd-done">Finished ${f.ch != null ? "chapter " + f.ch : "this"}</button>${RD.files[RD.fi + 1] ? `<button class="btn" data-act="rd-nextfile">Next file →</button>` : ""}</div></div>`;
    else {
        const imgs = (RD.rtl ? [...shown].reverse() : shown)
            .map(i => `<img src="${esc(RD.pages[i])}" alt="Page ${i + 1}" class="fit-${o.fit}" draggable="false">`)
            .join("");
        stage = `<div class="rdpage${RD.rtl ? " rtl" : ""}${shown.length > 1 ? " two" : ""}${o.tapNext ? " tapnext" : ""}" style="--rdz:${o.zoom / 100}">${o.tapNext ? `<button class="rdhalf all" data-act="rd-next" aria-label="Next page"></button>` : `<button class="rdhalf l" data-act="${RD.rtl ? "rd-next" : "rd-prev"}" aria-label="${RD.rtl ? "Next page" : "Previous page"}"></button>`}<div class="rdimgs">${imgs}</div>${o.tapNext ? "" : `<button class="rdhalf r" data-act="${RD.rtl ? "rd-prev" : "rd-next"}" aria-label="${RD.rtl ? "Previous page" : "Next page"}"></button>`}</div>`;
    }
    const pageWord =
        shown.length > 1 ? `Pages ${shown[0] + 1}–${shown[shown.length - 1] + 1} of ${n}` : `Page ${at + 1} of ${n}`;
    el.className = "cin rd-" + (RD.kind === "epub" ? "book" : RD.mode) + (o.hideUI === false ? "" : " autohide");
    el.style.setProperty(
        "--rdbg",
        RD.kind === "epub" ? (RD_THEMES[o.theme] || RD_THEMES.dark)[0] : RD_BG[o.bg] || "#000"
    );
    el.style.setProperty("--rdbright", (o.bright / 100).toFixed(2));
    el.innerHTML = `<div class="cin-top"><button class="x" data-act="rd-close" aria-label="Close (Esc)" title="Close (Esc)">✕</button><b>${esc(title)}</b><span class="spacer"></span>
      ${RD.kind === "images" && RD.mode === "scroll" ? `<button class="btn sm ghost" data-act="rd-auto" aria-pressed="${!!RD.auto}" title="Auto-scroll (A)">${RD.auto ? "❚❚ Auto-scroll" : "▶ Auto-scroll"}</button>` : ""}
      ${RD.kind === "images" ? `<button class="btn sm ghost" data-act="rd-zoom" data-k="-1" title="Zoom out (−)" aria-label="Zoom out">−</button><span class="hint rdz">${o.zoom}%</span><button class="btn sm ghost" data-act="rd-zoom" data-k="1" title="Zoom in (+)" aria-label="Zoom in">+</button>` : ""}
      <span class="hint rdat">${RD.kind === "pdf" ? "" : RD.kind === "epub" ? `Chapter ${at + 1} of ${n}` : pageWord}</span>
      ${it && (RD.kind === "pdf" || RD.kind === "epub") ? `<label class="ctl">${esc(unitOf(it)[0])} <input class="inp" id="rd-log" inputmode="numeric" style="width:70px" value="${it.prog || ""}"></label>` : ""}
      <button class="cb" data-act="rd-full" title="Full screen (F)" aria-label="Full screen">⛶</button><button class="cb" data-act="rd-opts" aria-pressed="${!!RD.opts}" title="Reader settings" aria-label="Reader settings">⚙</button></div>
    <div class="cin-stage rdstage">${stage}</div>
    ${RD.kind === "epub" ? `<div class="cin-bot"><button class="btn sm ghost" data-act="rd-prev" ${RD.ci ? "" : "disabled"}>← Chapter</button><span class="spacer"></span><button class="btn sm ghost" data-act="rd-next">${RD.ci < n - 1 ? "Chapter →" : "Finish"}</button></div>` : ""}
    ${o.showBar && RD.kind !== "pdf" ? `<div class="rdbar${RD.rtl && RD.mode === "paged" ? " rtl" : ""}" role="slider" aria-label="Where you are" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${at + 1}" tabindex="0" data-act="rd-seek"><span style="width:${(((at + shown.length) / n) * 100).toFixed(1)}%"></span></div>` : ""}
    ${RD.opts ? rdOptsHTML(o) : ""}`;
    saveReadPos();
    // scroll mode: back to where you were; track which page you're on; reaching the end logs it
    // pages that haven't arrived yet keep a page's shape (the first one's), so only the ones near you load, not the whole chapter at once
    if (RD.kind === "images" && RD.mode === "scroll")
        for (const im of el.querySelectorAll(".rdscroll img")) {
            if (im.complete && im.naturalWidth) {
                im.dataset.ok = 1;
                if (!RD.ar) RD.ar = im.naturalWidth + " / " + im.naturalHeight;
            } else
                im.addEventListener(
                    "load",
                    () => {
                        im.dataset.ok = 1;
                        if (!RD.ar) {
                            RD.ar = im.naturalWidth + " / " + im.naturalHeight;
                            el.style.setProperty("--rdar", RD.ar);
                        }
                    },
                    { once: true }
                );
        }
    if (RD.ar) el.style.setProperty("--rdar", RD.ar);
    if (RD.kind === "images" && RD.mode === "scroll") {
        const st = el.querySelector(".rdstage"),
            pg = el.querySelector(`.rdscroll img[data-pg="${RD.idx}"]`);
        if (pg && RD.idx)
            requestAnimationFrame(() => {
                st.scrollTop = pg.offsetTop - 60;
            });
        // which page you're on: the one across the upper third of the screen (pages still loading don't count); the end only counts once there's something to scroll
        let tick = 0;
        const track = () => {
            if (tick) return;
            tick = requestAnimationFrame(() => {
                tick = 0;
                const top = st.getBoundingClientRect().top + st.clientHeight / 3;
                let cur = RD.idx;
                for (const im of el.querySelectorAll(".rdscroll img")) {
                    if (!im.complete || !im.naturalHeight) break;
                    const r = im.getBoundingClientRect();
                    if (r.top <= top) cur = +im.dataset.pg;
                    else break;
                }
                if (cur !== RD.idx) {
                    RD.idx = cur;
                    saveReadPos();
                    const a2 = el.querySelector(".rdat");
                    if (a2) a2.textContent = `Page ${RD.idx + 1} of ${n}`;
                    const b = el.querySelector(".rdbar span");
                    if (b) b.style.width = (((RD.idx + 1) / n) * 100).toFixed(1) + "%";
                }
                const imgs = [...el.querySelectorAll(".rdscroll img")];
                if (
                    st.scrollHeight > st.clientHeight * 1.5 &&
                    imgs.every(i => i.complete && i.naturalHeight) &&
                    st.scrollTop + st.clientHeight >= st.scrollHeight - 80
                )
                    rdReachedEnd();
            });
        };
        st.addEventListener("scroll", track, { passive: true });
        if (RD.auto) rdAuto(true);
    }
    // the next pages, fetched before you get there
    if (RD.kind === "images")
        for (let k = 1; k <= o.preload; k++) {
            const nx = RD.pages[shown[shown.length - 1] + k];
            if (nx) {
                const im = new Image();
                im.src = nx;
            }
        }
    if (RD.kind === "images" && RD.mode === "paged" && shown[shown.length - 1] >= n - 1) rdReachedEnd();
    let idle;
    const wake = () => {
        el.classList.remove("idle");
        clearTimeout(idle);
        idle = setTimeout(() => {
            if (!RD.opts) el.classList.add("idle");
        }, 2600);
    };
    el.onpointermove = wake;
    wake();
}
// reaching the last page logs the chapter (once), with Undo; the Finished button still works
function rdReachedEnd() {
    if (!RS().autoLog || RD.logged === RD.fi + ":" + fname(RD.files[RD.fi])) return;
    const f = RD.files[RD.fi],
        it = RD.item && items.get(RD.item);
    if (!it) return;
    RD.logged = RD.fi + ":" + fname(f);
    const to = f.ch != null ? Math.max(it.prog || 0, f.ch) : (it.prog || 0) + 1;
    if (to === (it.prog || 0)) return;
    logProgress(RD.item, to);
    toast(`Logged ${(unitOf(it)[0] || "chapter").toLowerCase()} ${to}`, { label: "Undo", fn: undo });
}
// auto-scroll for long strips: steady, pauses while you hold the mouse down, stops at the end
function rdAuto(on) {
    cancelAnimationFrame(RD.autoRaf);
    RD.auto = on;
    if (!on) return;
    let last = performance.now();
    const step = t => {
        const st = $("#reader .rdstage");
        if (!st || !RD.auto) {
            RD.auto = false;
            return;
        }
        const dt = Math.min(0.1, (t - last) / 1000);
        last = t;
        if (!RD.hold) st.scrollTop += RS().scrollSpeed * dt;
        // the end: only once the pages are in (a redraw briefly empties them, which must not count as the end)
        if (
            st.scrollTop + st.clientHeight >= st.scrollHeight - 2 &&
            [...st.querySelectorAll("img")].every(i => i.complete && i.naturalHeight)
        ) {
            RD.auto = false;
            const b = $('#reader [data-act="rd-auto"]');
            if (b) {
                b.setAttribute("aria-pressed", "false");
                b.textContent = "▶ Auto-scroll";
            }
            return;
        }
        RD.autoRaf = requestAnimationFrame(step);
    };
    RD.autoRaf = requestAnimationFrame(step);
}
const rdAutoBtn = () => {
    const b = $('#reader [data-act="rd-auto"]');
    if (b) {
        b.setAttribute("aria-pressed", String(!!RD.auto));
        b.textContent = RD.auto ? "❚❚ Auto-scroll" : "▶ Auto-scroll";
    }
};
function readStep(d) {
    if (RD.kind === "epub") {
        const n = RD.chapters.length;
        if (RD.ci + d >= n) return readDone();
        RD.ci = Math.max(0, RD.ci + d);
        renderReader();
        return;
    }
    if (!RD.pages || RD.kind === "pdf") return;
    const n = RD.pages.length;
    if (RD.mode === "scroll") {
        const st = $("#reader .rdstage");
        if (st) st.scrollBy({ top: d * st.clientHeight * 0.85, behavior: "smooth" });
        return;
    }
    const shown = rdSpread(RD.idx),
        next = d > 0 ? shown[shown.length - 1] + 1 : Math.max(0, rdSpread(Math.max(0, shown[0] - 1))[0]);
    if (d > 0 && next >= n) return readDone();
    RD.idx = Math.max(0, Math.min(n - 1, next));
    renderReader();
}
function readDone() {
    const f = RD.files[RD.fi],
        it = RD.item && items.get(RD.item);
    if (it && RD.logged !== RD.fi + ":" + fname(f)) {
        const to = f.ch != null ? Math.max(it.prog || 0, f.ch) : (it.prog || 0) + 1;
        logProgress(RD.item, to);
    }
    try {
        localStorage.removeItem(readPosKey());
    } catch (_) {}
    if (RD.files[RD.fi + 1]) return readStart(RD.fi + 1);
    readerDrop();
    renderReader();
    if (ui.page === "read") renderMain();
    toast("That's the last one here.");
}
document.addEventListener(
    "keydown",
    e => {
        if (
            !$("#reader") ||
            ui.modal ||
            /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)
        )
            return;
        const k = e.key,
            paged = RD.mode === "paged" && RD.kind === "images",
            o = RS();
        let done = true;
        if (k === "Escape") {
            if (RD.opts) {
                RD.opts = false;
                renderReader();
            } else {
                readerDrop();
                renderReader();
            }
        } else if (k === "ArrowRight") readStep(RD.rtl && paged ? -1 : 1);
        else if (k === "ArrowLeft") readStep(RD.rtl && paged ? 1 : -1);
        else if ((k === "ArrowDown" || k === "ArrowUp") && RD.mode === "scroll" && RD.kind === "images") {
            const st = $("#reader .rdstage");
            if (st) st.scrollBy({ top: (k === "ArrowDown" ? 1 : -1) * 120 });
        } else if (k === " " || k === "PageDown") readStep(e.shiftKey ? -1 : 1);
        else if (k === "PageUp") readStep(-1);
        else if (k === "Home" && RD.pages) {
            RD.idx = 0;
            renderReader();
            if (RD.mode === "scroll") {
                const st = $("#reader .rdstage");
                if (st) st.scrollTop = 0;
            }
        } else if (k === "End" && RD.pages) {
            RD.idx = RD.pages.length - 1;
            renderReader();
            if (RD.mode === "scroll") {
                const st = $("#reader .rdstage");
                if (st) st.scrollTop = st.scrollHeight;
            }
        } else if ((k === "+" || k === "=") && RD.kind === "images") {
            rdSet({ zoom: Math.min(300, o.zoom + 10) });
            renderReader();
        } else if ((k === "-" || k === "_") && RD.kind === "images") {
            rdSet({ zoom: Math.max(50, o.zoom - 10) });
            renderReader();
        } else if (k.toLowerCase() === "d" && paged) {
            rdSet({ spread: o.spread === "single" ? "double" : "single" });
            renderReader();
        } else if (k.toLowerCase() === "a" && RD.mode === "scroll" && RD.kind === "images") {
            rdAuto(!RD.auto);
            rdAutoBtn();
        } else if (k.toLowerCase() === "f") {
            const r = $("#reader");
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            else if (r && r.requestFullscreen) r.requestFullscreen().catch(() => {});
        } else done = false;
        if (done) {
            e.preventDefault();
            e.stopPropagation();
        }
    },
    true
);
// holding the mouse down pauses auto-scroll
document.addEventListener("pointerdown", e => {
    if (RD.auto && e.target.closest && e.target.closest("#reader .rdstage")) RD.hold = true;
});
document.addEventListener("pointerup", () => {
    RD.hold = false;
});
document.addEventListener(
    "click",
    e => {
        const t = e.target.closest("[data-act]");
        if (
            !t ||
            (!t.dataset.act.startsWith("rd-") &&
                !["read-open", "read-home", "read-files", "read-start", "go-read"].includes(t.dataset.act))
        )
            return;
        const a = t.dataset.act,
            k = t.dataset.k;
        e.stopImmediatePropagation();
        if (a === "go-read") {
            ui.modeMenu = false;
            $$(".modemenu").forEach(x => x.remove());
            RD.item = null;
            ui.page = "read";
            render();
            window.scrollTo(0, 0);
        } else if (a === "read-open") readFromItem(t.dataset.id);
        else if (a === "read-home") {
            RD.item = null;
            RD.files = [];
            renderMain();
        } else if (a === "read-files") readPickFiles();
        else if (a === "read-start") readStart(Number(k));
        else if (a === "rd-close") {
            readerDrop();
            renderReader();
            renderMain();
        } else if (a === "rd-next") readStep(1);
        else if (a === "rd-prev") readStep(-1);
        else if (a === "rd-done") readDone();
        else if (a === "rd-nextfile") readStart(RD.fi + 1);
        else if (a === "rd-mode") {
            rdSet({ mode: k });
            renderReader();
        } else if (a === "rd-rtl") {
            rdSet({ rtl: !RD.rtl });
            renderReader();
        } else if (a === "rd-fit") {
            rdSet({ fit: RS().fit === "width" ? "height" : "width" });
            renderReader();
        } else if (a === "rd-set") {
            const v = t.dataset.v,
                cur = RS()[k];
            rdSet({ [k]: v === "true" ? true : v === "false" ? false : typeof cur === "number" ? +v : v });
            if (k === "mode") rdAuto(false);
            renderReader();
        } else if (a === "rd-opts") {
            RD.opts = !RD.opts;
            renderReader();
        } else if (a === "rd-zoom") {
            const o = RS();
            rdSet({ zoom: Math.max(50, Math.min(300, o.zoom + 10 * Number(k))) });
            renderReader();
        } else if (a === "rd-auto") {
            rdAuto(!RD.auto);
            rdAutoBtn();
        } else if (a === "rd-full") {
            const r = $("#reader");
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            else if (r && r.requestFullscreen) r.requestFullscreen().catch(() => {});
        } else if (a === "rd-seek" && RD.pages && RD.kind !== "pdf") {
            const r = t.getBoundingClientRect(),
                x = (e.clientX - r.left) / r.width,
                frac = t.classList.contains("rtl") ? 1 - x : x,
                n = RD.kind === "epub" ? RD.chapters.length : RD.pages.length,
                to = Math.max(0, Math.min(n - 1, Math.floor(frac * n)));
            if (RD.kind === "epub") RD.ci = to;
            else RD.idx = to;
            renderReader();
            if (RD.mode === "scroll") {
                const pg = $(`#reader .rdscroll img[data-pg="${to}"]`),
                    st = $("#reader .rdstage");
                if (pg && st) st.scrollTop = pg.offsetTop - 60;
            }
        }
    },
    true
);
document.addEventListener("input", e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.ro || t.type !== "range") return;
    const out = t.nextElementSibling;
    if (out) out.textContent = t.value + (out.textContent.replace(/^[\d.]+/, "") || "");
    rdSet({ [t.dataset.ro]: +t.value });
    clearTimeout(RD.rngT);
    RD.rngT = setTimeout(() => {
        const st = $("#reader .rdstage"),
            y = st ? st.scrollTop : 0;
        renderReader();
        const st2 = $("#reader .rdstage");
        if (st2 && RD.mode === "scroll") st2.scrollTop = y;
        const r = $(`#reader [data-ro="${t.dataset.ro}"]`);
        if (r) r.focus();
    }, 120);
});
document.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset && t.dataset.ro && t.type === "checkbox") {
        rdSet({ [t.dataset.ro]: t.checked });
        renderReader();
        return;
    }
    if (e.target.id === "rd-log" && RD.item) {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) logProgress(RD.item, v);
    }
});
