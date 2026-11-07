// src/features/library/tiers.js
// ─────────────────────────────────────────────────────────────────
//  Ranking, inside Lists: tier lists and ranked lists of things, characters, or cast & people
//
//  Entries come straight from your library, your characters and people, or the characters and cast of any title you
//  pull in.
// ─────────────────────────────────────────────────────────────────

const TIER_COLORS = ["#e5675a", "#ef9850", "#d3c257", "#6cc56f", "#5ea8f2", "#8e9bb3", "#b18ae8", "#e888b8"];
const TIER_WHAT = { items: "Things in my library", chars: "Characters", people: "Cast & people" };
const tierWhat = L => L.what || (L.chars ? "chars" : "items");
const listCount = l =>
    l.kind === "tier"
        ? (l.rows || []).reduce((a, r) => a + r.ids.length, 0)
        : (l.ids || []).filter(id => items.has(id)).length;
// one entry, whatever it is: { name, image, sub, rating, open }
function tierEnt(L, key) {
    const w = tierWhat(L);
    if (w === "items") {
        const b = items.get(key);
        return (
            b && {
                name: titleOf(b),
                image: coverSrc({ id: key, ...b }),
                sub: [b.kind || MEDIA[b.medium].one, b.year].filter(Boolean).join(" · "),
                rating: b.rating,
                item: key,
            }
        );
    }
    if (w === "chars") {
        const c = meta.chars.find(x => x.id === key);
        if (c) return { name: c.name, image: charImg(c), sub: ((c.media || [])[0] || {}).title || "", char: key };
    }
    if (w === "people") {
        const p = (meta.people || []).find(x => x.id === key);
        if (p)
            return {
                name: p.name,
                image: coverCache.src(p.imageData || p.image || ""),
                sub: (p.roles || []).slice(0, 2).join(", "),
            };
    }
    const x = (L.ents || {})[key];
    return x && { name: x.name, image: x.image ? coverCache.src(x.image) : "", sub: x.sub || "" };
}
function syncTierIds(L) {
    L.ids = tierWhat(L) === "items" ? L.rows.flatMap(r => r.ids) : [];
    return L;
}
function newTierList(p = {}) {
    const id = newListId(),
        rank = p.layout === "rank",
        rows = rank
            ? [{ label: "Ranked", color: "#8e9bb3", ids: [] }]
            : TIER_DEFAULT.map(([label, color]) => ({ label, color, ids: [] }));
    if (p.ids && p.ids.length) rows[0].ids = p.ids.slice();
    changeMeta(rank ? "New ranked list" : "New tier list", "lists", L => [
        ...L,
        syncTierIds({
            id,
            name: p.name || (rank ? "Untitled ranking" : "Untitled tier list"),
            kind: "tier",
            layout: rank ? "rank" : "tiers",
            what: p.what || (p.chars ? "chars" : "items"),
            mode: p.mode || "",
            onlyDone: p.onlyDone !== false,
            scores: true,
            size: "m",
            rows,
            ents: {},
            notes: {},
            created: nowISO(),
        }),
    ]);
    return id;
}
function setTier(lid, fn, label = "Edit tier list") {
    changeMeta(label, "lists", A => A.map(l => (l.id === lid ? syncTierIds(fn(clone(l))) : l)));
}
// move one or several entries into a tier (before a given entry if dropped on one), or back to the pool
function tierPlace(lid, keys, row, before) {
    keys = [...keys];
    tierSel.clear();
    setTier(
        lid,
        L => {
            L.rows.forEach(r => {
                r.ids = r.ids.filter(k => !keys.includes(k));
            });
            if (row !== "pool" && L.rows[row]) {
                const ids = L.rows[row].ids,
                    i = before ? ids.indexOf(before) : -1;
                i >= 0 ? ids.splice(i, 0, ...keys) : ids.push(...keys);
            }
            return L;
        },
        keys.length > 1 ? `Move ${keys.length}` : "Move"
    );
}
const tierSel = new Set();
let tierLast = null;
// what's still unplaced; anything skipped in quick rank waits at the end
function tierPool(L) {
    const P = tierPoolAll(L),
        S = new Set(L.skip || []);
    return S.size ? [...P.filter(k => !S.has(k)), ...P.filter(k => S.has(k))] : P;
}
function tierPoolAll(L) {
    const placed = new Set(L.rows.flatMap(r => r.ids)),
        q = norm(ui.tierQ || ""),
        mode = L.mode ? modeById(L.mode) : curMode(),
        w = tierWhat(L);
    const pulled = Object.keys(L.ents || {}).filter(
        k => !placed.has(k) && (!q || norm(L.ents[k].name + " " + (L.ents[k].sub || "")).includes(q))
    );
    if (w === "chars")
        return [
            ...meta.chars
                .filter(c => !placed.has(c.id) && charInMode(c, mode) && (!q || norm(c.name).includes(q)))
                .map(c => c.id),
            ...pulled,
        ];
    if (w === "people")
        return [
            ...(meta.people || [])
                .filter(
                    p =>
                        !p.alStudio &&
                        !(p.roles || []).includes("Studio") &&
                        !placed.has(p.id) &&
                        (!q || norm(p.name).includes(q))
                )
                .map(p => p.id),
            ...pulled,
        ];
    return all()
        .filter(
            b =>
                !placed.has(b.id) &&
                inMode(b, mode) &&
                (!L.onlyDone || b.status === "done" || b.rating) &&
                (!q || norm(titleOf(b) + " " + (b.creator || "")).includes(q))
        )
        .sort(
            (a, b) =>
                (b.rating || 0) - (a.rating || 0) ||
                (b.fav ? 1 : 0) - (a.fav ? 1 : 0) ||
                titleOf(a).localeCompare(titleOf(b))
        )
        .map(b => b.id);
}
function tierChipHTML(L, key) {
    const e = tierEnt(L, key);
    if (!e) return "";
    return `<button class="tchip${tierSel.has(key) ? " on" : ""}" draggable="true" data-tkey="${esc(key)}" data-act="tl-sel" data-k="${esc(key)}" title="${esc(e.name)}${e.sub ? " · " + esc(e.sub) : ""}${e.rating ? " · " + fmtScore(e.rating, scaleOf(e)) : ""}">${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false">` : `<span class="noimg">${esc(e.name.slice(0, 26))}</span>`}${L.scores !== false && e.rating ? `<span class="tsc">${esc(fmtScore(e.rating, scaleOf(e)))}</span>` : ""}<span class="tl">${esc(e.name)}</span></button>`;
}
function rankRowHTML(L, key, i) {
    const e = tierEnt(L, key);
    if (!e) return "";
    return `<div class="rkrow${tierSel.has(key) ? " on" : ""}" draggable="true" data-tkey="${esc(key)}" data-act="tl-sel" data-k="${esc(key)}"><span class="rkn">${i + 1}</span>${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false">` : `<span class="noimg"></span>`}
    <span class="rkt"><b>${esc(e.name)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ""}</span>${L.scores !== false && e.rating ? `<span class="rks">${esc(fmtScore(e.rating, scaleOf(e)))}</span>` : ""}</div>`;
}
const tierAvg = (L, r) => {
    const R = r.ids.map(k => (items.get(k) || {}).rating).filter(Boolean);
    return R.length ? fmtScore(R.reduce((a, b) => a + b, 0) / R.length) : "";
};
function tierListHTML(L) {
    const pool = tierPool(L),
        n = tierSel.size,
        w = tierWhat(L),
        rank = L.layout === "rank",
        poolMax = 200;
    const titles = w === "items" ? [] : [...new Set(all().map(b => titleOf(b)))].slice(0, 3000);
    const board = rank
        ? `<div class="rankboard" data-tz="0">${L.rows[0].ids.map((k, i) => rankRowHTML(L, k, i)).join("") || `<p class="hint rkempty">Drag entries here, or select some and press 1.</p>`}</div>`
        : `<div class="tierboard">${L.rows
              .map(
                  (
                      r,
                      i
                  ) => `<div class="tgap${i ? "" : " first"}"><button data-act="tl-addrow" data-k="${i}" title="Add a tier here">+ tier</button></div>
      <div class="trow" data-trow="${i}"><div class="tlabel" style="background:${esc(r.color)}" data-act="tl-place" data-k="${i}"><input value="${esc(r.label)}" data-tllabel="${i}" aria-label="Tier name"><small>${r.ids.length}${w === "items" && tierAvg(L, r) ? " · " + tierAvg(L, r) : ""}</small><input type="color" value="${esc(r.color)}" data-tlcolor="${i}" aria-label="Tier colour"></div>
        <div class="tzone" data-tz="${i}" data-act="tl-place" data-k="${i}">${r.ids.map(k => tierChipHTML(L, k)).join("")}</div>
        <div class="tops"><button class="btn sm ghost" data-act="tl-rowmove" data-k="${i}" data-d="-1" ${i === 0 ? "disabled" : ""} aria-label="Move tier up">↑</button><button class="btn sm ghost" data-act="tl-rowmove" data-k="${i}" data-d="1" ${i === L.rows.length - 1 ? "disabled" : ""} aria-label="Move tier down">↓</button><button class="btn sm ghost" data-act="tl-rowdel" data-k="${i}" aria-label="Delete tier">✕</button></div></div>`
              )
              .join("")}
      <div class="tgap last"><button data-act="tl-addrow" data-k="${L.rows.length}">+ tier</button></div></div>`;
    return `<div class="ph"><div class="ttl"><div class="eyebrow"><button class="linkbtn" data-act="go-list" data-k="">Lists</button> / ${esc(TIER_WHAT[w])}</div><h2><input class="h2in" id="tl-name" value="${esc(L.name)}" aria-label="Name"></h2></div><span class="spacer"></span>
      <div class="seg" role="group" aria-label="Layout"><button data-act="tl-layout" data-k="tiers" aria-pressed="${!rank}">Tiers</button><button data-act="tl-layout" data-k="rank" aria-pressed="${rank}">Ranked</button></div>
      <div class="seg" role="group" aria-label="Size">${[
          ["s", "S"],
          ["m", "M"],
          ["l", "L"],
      ]
          .map(
              ([k, l]) =>
                  `<button data-act="tl-size" data-k="${k}" aria-pressed="${(L.size || "m") === k}">${l}</button>`
          )
          .join("")}</div>
      <button class="btn ghost" data-act="tl-quick" title="Go through the unplaced one by one (Q)">⚡ Quick rank</button><button class="btn ghost" data-act="tl-png" title="Save as a picture">⤓ Image</button>
      <button class="btn ghost" data-act="tl-more" aria-label="More">⋯</button></div>
    ${
        ui.tlMore
            ? `<div class="panel tlmore"><div class="bar"><label class="ctl"><input type="checkbox" id="tl-scores" ${L.scores !== false ? "checked" : ""}> Show scores</label><label class="ctl"><input type="checkbox" id="tl-side" ${L.poolSide ? "checked" : ""}> Unplaced beside the board</label><button class="btn sm ghost" data-act="tl-clear">Move everything back</button>${ui.confirmListDel ? `<button class="btn sm danger" data-act="list-del-yes">Delete</button><button class="btn sm ghost" data-act="list-del-no">Keep</button>` : `<button class="btn sm danger" data-act="list-del">Delete</button>`}</div>
      <p class="hint">Keys: click or Shift-click to select, drag a box around several · 1–9 send them to that tier · 0 or Delete back to unplaced · Ctrl/⌘A selects all unplaced · Q quick rank · / filter · Esc clear.</p></div>`
            : ""
    }
    ${n ? `<div class="tselbar"><b>${n} selected</b>${rank ? `<button class="btn sm" data-act="tl-place" data-k="0">Add to the ranking</button>` : L.rows.map((r, i) => `<button class="btn sm" data-act="tl-place" data-k="${i}" style="border-left-color:${esc(r.color)}"><kbd>${i + 1}</kbd> ${esc(r.label)}</button>`).join("")}<button class="btn sm ghost" data-act="tl-place" data-k="pool"><kbd>0</kbd> Unplace</button><button class="linkbtn" data-act="tl-none">Clear</button></div>` : ""}
    <div class="tlwrap size-${L.size || "m"}${L.poolSide ? " side" : ""}">${board}
    <div class="panel tpool" data-tz="pool" data-act="tl-place" data-k="pool"><h3>Unplaced · ${pool.length} <span class="r"><input class="inp" id="tier-q" placeholder="Filter  /" value="${esc(ui.tierQ || "")}"></span></h3>
      <div class="bar tpbar">${
          w === "items"
              ? `<label class="ctl"><input type="checkbox" id="tl-onlydone" ${L.onlyDone ? "checked" : ""}> Only finished or scored</label>${selOf("tl-mode", [["", "From " + curMode().name], ...meta.modes.map(m => [m.id, "From " + m.name])], L.mode || "")}`
              : `<input class="inp" id="tl-pullq" list="tl-titles" placeholder="Pull in the ${w === "chars" ? "characters" : "cast"} of…" style="flex:1;min-width:200px"><datalist id="tl-titles">${titles.map(t => `<option value="${esc(t)}">`).join("")}</datalist><button class="btn sm" data-act="tl-pull">${ui.tlPulling ? "Pulling…" : "Pull in"}</button>`
      }
        <button class="linkbtn" data-act="tl-selall">Select all${pool.length > poolMax ? " " + poolMax : ""}</button></div>
      <div class="tzone pool" data-tz="pool">${
          pool
              .slice(0, poolMax)
              .map(k => tierChipHTML(L, k))
              .join("") ||
          `<p class="hint">${w === "items" ? "Everything's placed." : `Nothing here yet. Pull in the ${w === "chars" ? "characters" : "cast"} of a title above${w === "chars" && !meta.chars.length ? ", or favourite some characters" : ""}.`}</p>`
      }${pool.length > poolMax ? `<p class="hint">…and ${pool.length - poolMax} more. Filter to find them.</p>` : ""}</div></div></div>
    ${ui.tquick ? quickRankHTML(L, pool) : ""}`;
}
// ── quick rank: one at a time, a key per tier ──
function quickRankHTML(L, pool) {
    const k = pool[0];
    if (!k) {
        ui.tquick = null;
        return "";
    }
    const e = tierEnt(L, k),
        rank = L.layout === "rank";
    return `<div class="tquick" role="dialog" aria-label="Quick rank"><div class="tqcard">${e.image ? `<img src="${esc(e.image)}" alt="" referrerpolicy="no-referrer">` : `<span class="noimg big">${esc(e.name)}</span>`}<b>${esc(e.name)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ""}<span class="hint">${pool.length} left</span></div>
    <div class="tqbtns">${
        rank
            ? `<button class="btn" data-act="tq-place" data-k="0"><kbd>1</kbd> Add to the ranking</button>`
            : L.rows
                  .slice(0, 9)
                  .map(
                      (r, i) =>
                          `<button class="btn" data-act="tq-place" data-k="${i}" style="border-left:4px solid ${esc(r.color)}"><kbd>${i + 1}</kbd> ${esc(r.label)}</button>`
                  )
                  .join("")
    }
      <button class="btn ghost" data-act="tq-skip"><kbd>→</kbd> Skip</button><button class="btn ghost" data-act="tq-stop"><kbd>Esc</kbd> Stop</button></div></div>`;
}
function quickPlace(L, row) {
    const pool = tierPool(L),
        k = pool[0];
    if (!k) return;
    tierPlace(L.id, [k], row);
}
function quickSkip(L) {
    const pool = tierPool(L),
        k = pool[0];
    if (!k) return;
    setTier(
        L.id,
        X => {
            X.skip = [...(X.skip || []).filter(x => x !== k), k];
            return X;
        },
        "Skip"
    );
}
// ── pulling characters or cast from a title ──
async function tierPull(L) {
    const q = (($("#tl-pullq") || {}).value || "").trim();
    if (!q) {
        toast("Type a title from your library");
        return;
    }
    const hit = all().find(b => norm(titleOf(b)) === norm(q)) || all().find(b => norm(titleOf(b)).includes(norm(q)));
    if (!hit) {
        toast("That isn't in your library yet");
        return;
    }
    ui.tlPulling = true;
    renderMain();
    try {
        const cast = await fetchCast(hit.id),
            w = tierWhat(L),
            add = {};
        for (const c of cast) {
            if (w === "chars" && c.name) {
                add["x" + hash(norm(c.name) + "|" + hit.id).toString(36)] = {
                    name: c.name,
                    image: c.src === "tmdb" ? "" : c.image || "",
                    sub: titleOf(hit),
                };
            }
            if (w === "people" && c.va) {
                add["x" + hash(norm(c.va)).toString(36)] = {
                    name: c.va,
                    image: c.vaImage || (c.src === "tmdb" ? c.image : "") || "",
                    sub: c.name ? `${c.name} · ${titleOf(hit)}` : titleOf(hit),
                };
            }
        }
        const n = Object.keys(add).filter(k => !(L.ents || {})[k]).length;
        setTier(
            L.id,
            X => {
                X.ents = { ...(X.ents || {}), ...add };
                return X;
            },
            "Pull in"
        );
        toast(
            n
                ? `Pulled in ${plural(n, "entry", "entries")} from ${titleOf(hit)}`
                : cast.length
                  ? "They're already here"
                  : "Nothing found for that title"
        );
    } catch (_) {
        toast("Couldn't load them. Are you online?");
    }
    ui.tlPulling = false;
    renderMain();
}
// ── the picture ──
async function tierPNG(L) {
    const rank = L.layout === "rank",
        w = tierWhat(L),
        TW = 84,
        TH = w === "items" ? 126 : 112,
        LBL = 120,
        PAD = 10,
        COLS = 12,
        W_ = LBL + PAD + COLS * (TW + 6) + PAD;
    // fetched as a blob first, so the picture stays saveable (a plain cross-site <img> would lock the canvas)
    const load = async u => {
        if (!u) return null;
        try {
            const r = await fetch(u, { mode: "cors" });
            if (!r.ok) return null;
            const url = URL.createObjectURL(await r.blob()),
                im = new Image();
            im.src = url;
            await im.decode();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            return im;
        } catch (_) {
            return null;
        }
    };
    const rows = rank
        ? [{ label: "", color: "#8e9bb3", ids: L.rows[0].ids }]
        : L.rows.filter(r => r.ids.length || true);
    const lines = rows.map(r => Math.max(1, Math.ceil(r.ids.length / COLS))),
        H = 64 + lines.reduce((a, n) => a + n * (TH + 6) + 8, 0) + 30;
    const cv = document.createElement("canvas");
    cv.width = W_ * 2;
    cv.height = H * 2;
    const g = cv.getContext("2d");
    g.scale(2, 2);
    const css = getComputedStyle(document.body);
    g.fillStyle = css.getPropertyValue("--bg") || "#0b0d12";
    g.fillRect(0, 0, W_, H);
    g.fillStyle = css.getPropertyValue("--text") || "#eee";
    g.font = "600 22px system-ui, sans-serif";
    g.fillText(L.name, PAD, 38);
    toast("Drawing the picture…");
    let y = 60,
        rank1 = 0;
    for (const [ri, r] of rows.entries()) {
        const h = lines[ri] * (TH + 6);
        if (!rank) {
            g.fillStyle = r.color;
            g.fillRect(PAD, y, LBL - PAD, h);
            g.fillStyle = "#111";
            g.font = "700 22px system-ui, sans-serif";
            g.textAlign = "center";
            g.fillText(r.label, PAD + (LBL - PAD) / 2, y + h / 2 + 8, LBL - PAD * 2);
            g.textAlign = "left";
        }
        const imgs = await Promise.all(
            r.ids.map(k => {
                const e = tierEnt(L, k);
                return e ? load(e.image) : null;
            })
        );
        r.ids.forEach((k, i) => {
            const e = tierEnt(L, k) || { name: "?" },
                x = LBL + PAD + (i % COLS) * (TW + 6),
                yy = y + Math.floor(i / COLS) * (TH + 6),
                im = imgs[i];
            g.fillStyle = "#222";
            g.fillRect(x, yy, TW, TH);
            if (im) {
                const s = Math.max(TW / im.width, TH / im.height),
                    dw = im.width * s,
                    dh = im.height * s;
                g.save();
                g.beginPath();
                g.rect(x, yy, TW, TH);
                g.clip();
                g.drawImage(im, x + (TW - dw) / 2, yy + (TH - dh) / 2, dw, dh);
                g.restore();
            }
            if (!im || w !== "items") {
                g.fillStyle = "rgba(0,0,0,.66)";
                g.fillRect(x, yy + TH - 30, TW, 30);
                g.fillStyle = "#fff";
                g.font = "11px system-ui, sans-serif";
                g.fillText(e.name.slice(0, 16), x + 4, yy + TH - 17, TW - 8);
                if (e.name.length > 16) g.fillText(e.name.slice(16, 32), x + 4, yy + TH - 5, TW - 8);
            }
            if (rank) {
                rank1++;
                g.fillStyle = "rgba(0,0,0,.75)";
                g.fillRect(x, yy, 26, 20);
                g.fillStyle = "#fff";
                g.font = "700 12px system-ui, sans-serif";
                g.fillText(String(rank1), x + 5, yy + 14);
            }
        });
        y += h + 8;
    }
    g.fillStyle = "rgba(128,128,128,.8)";
    g.font = "11px system-ui, sans-serif";
    g.fillText("UniverList · " + today(), PAD, H - 10);
    cv.toBlob(b => {
        if (b) download(safeName(L.name) + ".png", b, "image/png");
        else toast("Couldn't make the picture");
    }, "image/png");
}
// ── clicks ──
async function tierClick(act, t, k, ev) {
    const L = meta.lists.find(x => x.id === ui.listId);
    if (!L) return false;
    switch (act) {
        case "tl-sel": {
            const zone = t.closest("[data-tz]"),
                keys = zone ? [...zone.querySelectorAll("[data-tkey]")].map(x => x.dataset.tkey) : [];
            if (ev && ev.shiftKey && tierLast && keys.includes(tierLast)) {
                const [a, b] = [keys.indexOf(tierLast), keys.indexOf(k)].sort((x, y) => x - y);
                keys.slice(a, b + 1).forEach(x => tierSel.add(x));
            } else tierSel.has(k) ? tierSel.delete(k) : tierSel.add(k);
            tierLast = k;
            renderMain();
            return true;
        }
        case "tl-place":
            if (!tierSel.size) return true;
            tierPlace(L.id, [...tierSel], k === "pool" ? "pool" : Number(k));
            return true;
        case "tl-none":
            tierSel.clear();
            renderMain();
            return true;
        case "tl-selall":
            tierPool(L)
                .slice(0, 200)
                .forEach(x => tierSel.add(x));
            renderMain();
            return true;
        case "tl-addrow":
            setTier(
                L.id,
                X => {
                    X.rows.splice(Number(k), 0, {
                        label: "New",
                        color: TIER_COLORS[X.rows.length % TIER_COLORS.length],
                        ids: [],
                    });
                    return X;
                },
                "Add tier"
            );
            setTimeout(() => {
                const i = $(`[data-tllabel="${Number(k)}"]`);
                i && (i.focus(), i.select());
            }, 30);
            return true;
        case "tl-rowdel":
            setTier(
                L.id,
                X => {
                    X.rows.splice(Number(k), 1);
                    return X;
                },
                "Delete tier"
            );
            return true;
        case "tl-rowmove":
            setTier(
                L.id,
                X => {
                    const i = Number(k),
                        j = i + Number(t.dataset.d);
                    if (j >= 0 && j < X.rows.length) [X.rows[i], X.rows[j]] = [X.rows[j], X.rows[i]];
                    return X;
                },
                "Move tier"
            );
            return true;
        case "tl-clear":
            setTier(
                L.id,
                X => {
                    X.rows.forEach(r => (r.ids = []));
                    return X;
                },
                "Clear"
            );
            return true;
        case "tl-layout":
            setTier(
                L.id,
                X => {
                    if (k === "rank" && X.layout !== "rank") {
                        X.tiersWas = X.rows;
                        X.rows = [{ label: "Ranked", color: "#8e9bb3", ids: X.rows.flatMap(r => r.ids) }];
                    } else if (k === "tiers" && X.layout === "rank") {
                        const ids = X.rows[0].ids,
                            was = X.tiersWas;
                        X.rows =
                            was && was.length
                                ? was.map(r => ({ ...r, ids: r.ids.filter(i => ids.includes(i)) }))
                                : TIER_DEFAULT.map(([label, color]) => ({ label, color, ids: [] }));
                        const left = ids.filter(i => !X.rows.some(r => r.ids.includes(i)));
                        X.rows[0].ids.push(...left);
                    }
                    X.layout = k;
                    return X;
                },
                "Change layout"
            );
            return true;
        case "tl-size":
            setTier(
                L.id,
                X => {
                    X.size = k;
                    return X;
                },
                "Size"
            );
            return true;
        case "tl-more":
            ui.tlMore = !ui.tlMore;
            renderMain();
            return true;
        case "tl-quick":
            ui.tquick = true;
            setTier(
                L.id,
                X => {
                    X.skip = [];
                    return X;
                },
                "Quick rank"
            );
            return true;
        case "tq-place":
            quickPlace(L, Number(k));
            return true;
        case "tq-skip":
            quickSkip(L);
            return true;
        case "tq-stop":
            ui.tquick = null;
            renderMain();
            return true;
        case "tl-png":
            tierPNG(L);
            return true;
        case "tl-pull":
            tierPull(L);
            return true;
    }
    return false;
}
// ── dragging: one entry, or every selected entry if you drag a selected one ──
let tdrag = null;
document.addEventListener(
    "dragstart",
    e => {
        const c = e.target.closest && e.target.closest("[data-tkey]");
        if (!c || !ui.listId) return;
        e.stopPropagation();
        const k = c.dataset.tkey;
        tdrag = tierSel.has(k) ? [...tierSel] : [k];
        c.classList.add("drag");
        try {
            e.dataTransfer.setData("text/plain", k);
            e.dataTransfer.effectAllowed = "move";
        } catch (_) {}
    },
    true
);
document.addEventListener(
    "dragover",
    e => {
        if (!tdrag) return;
        const z = e.target.closest("[data-tz]");
        if (!z) return;
        e.preventDefault();
        $$(".tzone.over,.tpool.over,.rankboard.over,.rkrow.over").forEach(x => x.classList.remove("over"));
        z.classList.add("over");
        const r = e.target.closest(".rkrow");
        if (r) r.classList.add("over");
    },
    true
);
document.addEventListener(
    "drop",
    e => {
        if (!tdrag) return;
        const z = e.target.closest("[data-tz]");
        const keys = tdrag;
        tdrag = null;
        $$(".over,.drag").forEach(x => x.classList.remove("over", "drag"));
        if (!z) return;
        e.preventDefault();
        e.stopPropagation();
        const before = e.target.closest("[data-tkey]"),
            bk =
                before && !keys.includes(before.dataset.tkey) && before.closest("[data-tz]") === z
                    ? before.dataset.tkey
                    : null;
        tierPlace(ui.listId, keys, z.dataset.tz === "pool" ? "pool" : Number(z.dataset.tz), bk);
    },
    true
);
document.addEventListener(
    "dragend",
    () => {
        if (tdrag) {
            tdrag = null;
            $$(".over,.drag").forEach(x => x.classList.remove("over", "drag"));
        }
    },
    true
);
// ── drag a box around several to select them ──
let marq = null;
document.addEventListener(
    "pointerdown",
    e => {
        if (e.button !== 0 || !ui.listId || e.pointerType === "touch") return;
        const z = e.target.closest(".tzone, .rankboard, .tpool");
        if (!z || e.target.closest("[data-tkey], button, input, select, label, a")) return;
        const L = meta.lists.find(x => x.id === ui.listId);
        if (!L || L.kind !== "tier") return;
        marq = { x: e.clientX, y: e.clientY, add: e.shiftKey || e.metaKey || e.ctrlKey, el: null, moved: false };
    },
    true
);
document.addEventListener(
    "pointermove",
    e => {
        if (!marq) return;
        const dx = e.clientX - marq.x,
            dy = e.clientY - marq.y;
        if (!marq.moved && Math.hypot(dx, dy) < 6) return;
        if (!marq.moved) {
            marq.moved = true;
            marq.el = document.createElement("div");
            marq.el.className = "marq";
            document.body.append(marq.el);
            if (!marq.add) tierSel.clear();
        }
        const r = {
            l: Math.min(e.clientX, marq.x),
            t: Math.min(e.clientY, marq.y),
            r: Math.max(e.clientX, marq.x),
            b: Math.max(e.clientY, marq.y),
        };
        Object.assign(marq.el.style, {
            left: r.l + "px",
            top: r.t + "px",
            width: r.r - r.l + "px",
            height: r.b - r.t + "px",
        });
        for (const c of $$("[data-tkey]")) {
            const b = c.getBoundingClientRect(),
                hit = b.left < r.r && b.right > r.l && b.top < r.b && b.bottom > r.t;
            c.classList.toggle("mq", hit);
        }
    },
    true
);
document.addEventListener(
    "pointerup",
    () => {
        if (!marq) return;
        const m = marq;
        marq = null;
        if (!m.moved) return;
        for (const c of $$("[data-tkey].mq")) {
            tierSel.add(c.dataset.tkey);
            c.classList.remove("mq");
        }
        m.el && m.el.remove();
        renderMain();
        const stop = ev => {
            ev.stopPropagation();
            ev.preventDefault();
        };
        document.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => document.removeEventListener("click", stop, true), 50);
    },
    true
);
// ── keys ──
document.addEventListener(
    "keydown",
    e => {
        if (e.target.dataset && e.target.dataset.tllabel != null && e.key === "Enter") {
            e.preventDefault();
            e.target.blur();
            return;
        }
        if (ui.page !== "profile" || ui.tab !== "lists" || !ui.listId || ui.modal) return;
        const L = meta.lists.find(x => x.id === ui.listId);
        if (!L || L.kind !== "tier") return;
        if (e.target.id === "tl-pullq" && e.key === "Enter") {
            e.preventDefault();
            tierPull(L);
            return;
        }
        if (e.target.closest("input, textarea, select")) return;
        const stop = () => {
            e.preventDefault();
            e.stopImmediatePropagation();
        };
        if (ui.tquick) {
            if (/^[1-9]$/.test(e.key)) {
                stop();
                const i = Number(e.key) - 1;
                if (L.layout === "rank" || L.rows[i]) quickPlace(L, L.layout === "rank" ? 0 : i);
                return;
            }
            if (e.key === "ArrowRight" || e.key.toLowerCase() === "s") {
                stop();
                quickSkip(L);
                return;
            }
            if (e.key === "Escape") {
                stop();
                ui.tquick = null;
                renderMain();
                return;
            }
            return;
        }
        if (/^[1-9]$/.test(e.key) && tierSel.size && !e.metaKey && !e.ctrlKey) {
            stop();
            const i = Number(e.key) - 1;
            if (L.layout === "rank") tierPlace(L.id, [...tierSel], 0);
            else if (L.rows[i]) tierPlace(L.id, [...tierSel], i);
            return;
        }
        if ((e.key === "0" || e.key === "Delete" || e.key === "Backspace") && tierSel.size) {
            stop();
            tierPlace(L.id, [...tierSel], "pool");
            return;
        }
        if (e.key === "Escape" && tierSel.size) {
            stop();
            tierSel.clear();
            renderMain();
            return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
            stop();
            tierPool(L)
                .slice(0, 200)
                .forEach(x => tierSel.add(x));
            renderMain();
            return;
        }
        if (e.key.toLowerCase() === "q" && !e.metaKey && !e.ctrlKey) {
            stop();
            tierClick("tl-quick", null, "", e);
            return;
        }
        if (e.key === "/") {
            stop();
            const i = $("#tier-q");
            i && i.focus();
            return;
        }
    },
    true
);
document.addEventListener("change", e => {
    const t = e.target,
        L = ui.listId && meta.lists.find(x => x.id === ui.listId);
    if (!L || L.kind !== "tier") return;
    if (t.id === "tl-name")
        changeMeta("Rename", "lists", A => A.map(l => (l.id === L.id ? { ...l, name: t.value.trim() || l.name } : l)));
    if (t.dataset.tllabel != null) {
        const i = Number(t.dataset.tllabel),
            v = t.value.trim();
        setTier(
            L.id,
            X => {
                X.rows[i].label = v || X.rows[i].label;
                return X;
            },
            "Rename tier"
        );
    }
    if (t.dataset.tlcolor != null) {
        const i = Number(t.dataset.tlcolor),
            v = t.value;
        setTier(
            L.id,
            X => {
                X.rows[i].color = v;
                return X;
            },
            "Tier colour"
        );
    }
    if (t.id === "tl-onlydone")
        setTier(L.id, X => {
            X.onlyDone = t.checked;
            return X;
        });
    if (t.id === "tl-scores")
        setTier(L.id, X => {
            X.scores = t.checked;
            return X;
        });
    if (t.id === "tl-side")
        setTier(L.id, X => {
            X.poolSide = t.checked;
            return X;
        });
    if (t.id === "tl-mode")
        setTier(L.id, X => {
            X.mode = t.value;
            return X;
        });
});
