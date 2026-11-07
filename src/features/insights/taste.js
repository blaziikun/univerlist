// src/features/insights/taste.js
// ─────────────────────────────────────────────────────────────────
//  Your taste, read closely: what lifts your scores, what sinks them, and where to go next
//
//  Everything here is worked out from your own scores, genres and themes (AniList's tags, TMDB and IGDB's keywords);
//  "find more" then asks AniList for the best-rated things carrying that exact mix, so the crowd's view comes in only
//  at the end.
// ─────────────────────────────────────────────────────────────────

function tasteModel(A) {
    const R = A.filter(b => b.rating),
        mean = R.length ? R.reduce((a, b) => a + b.rating, 0) / R.length : 0,
        sorted = R.map(b => b.rating).sort((a, b) => a - b);
    const q = p => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0),
        hi = q(0.75),
        lo = q(0.3);
    const feat = b => [...(b.genres || []).map(g => "g:" + g), ...(b.themes || []).map(t => "t:" + t)];
    const F = new Map();
    for (const b of R)
        for (const f of feat(b)) {
            const e = F.get(f) || { n: 0, sum: 0, items: [] };
            e.n++;
            e.sum += b.rating;
            e.items.push(b);
            F.set(f, e);
        }
    const lift = [...F.entries()]
        .filter(([, e]) => e.n >= 3)
        .map(([f, e]) => ({
            f,
            name: f.slice(2),
            kind: f[0],
            n: e.n,
            avg: e.sum / e.n,
            lift: e.sum / e.n - mean,
            items: e.items.sort((a, b) => b.rating - a.rating),
        }));
    return { R, mean, hi, lo, feat, lift };
}
function tasteNuance(M) {
    // inside the genres you watch most: which themes your best share, and which your weakest share
    const out = [];
    for (const g of M.lift
        .filter(x => x.kind === "g" && x.n >= 6)
        .sort((a, b) => b.n - a.n)
        .slice(0, 4)) {
        const H = g.items.filter(b => b.rating >= M.hi),
            L = g.items.filter(b => b.rating <= M.lo);
        if (H.length < 2 || L.length < 2) continue;
        const fr = S => {
            const c = new Map();
            for (const b of S) for (const t of b.themes || []) c.set(t, (c.get(t) || 0) + 1 / S.length);
            return c;
        };
        const fh = fr(H),
            fl = fr(L),
            keys = new Set([...fh.keys(), ...fl.keys()]);
        const d = [...keys].map(t => [t, (fh.get(t) || 0) - (fl.get(t) || 0)]).sort((a, b) => b[1] - a[1]);
        const up = d
                .filter(x => x[1] > 0.25)
                .slice(0, 3)
                .map(x => x[0]),
            down = d
                .filter(x => x[1] < -0.25)
                .slice(-3)
                .reverse()
                .map(x => x[0]);
        if (up.length || down.length)
            out.push({ genre: g.name, avg: g.avg, up, down, best: H.slice(0, 2), worst: L.slice(-2) });
    }
    return out;
}
function tastePairs(M) {
    // close cousins you scored far apart: the most telling pairs in your library
    const P = [],
        R = M.R.slice()
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 220);
    for (let i = 0; i < R.length; i++)
        for (let j = i + 1; j < R.length; j++) {
            const a = R[i],
                b = R[j];
            if (a.rating - b.rating < 2.5 || MEDIA[a.medium].group !== MEDIA[b.medium].group) continue;
            const fa = new Set(M.feat(a)),
                fb = M.feat(b),
                shared = fb.filter(f => fa.has(f));
            if (shared.length < 4) continue;
            P.push({
                a,
                b,
                shared,
                onlyA: [...fa].filter(f => f[0] === "t" && !fb.includes(f)).slice(0, 3),
                onlyB: fb.filter(f => f[0] === "t" && !fa.has(f)).slice(0, 3),
                s: shared.length + (a.rating - b.rating),
            });
        }
    const used = new Set();
    return P.sort((x, y) => y.s - x.s)
        .filter(p => {
            if (used.has(p.a.id) || used.has(p.b.id)) return false;
            used.add(p.a.id);
            used.add(p.b.id);
            return true;
        })
        .slice(0, 4);
}
function tasteClusters(M) {
    // the mixes that keep turning up among your favourites: pairs of genres and themes that travel together in your top quarter
    const top = M.R.filter(b => b.rating >= M.hi),
        c = new Map();
    for (const b of top) {
        const f = M.feat(b).filter(x => M.lift.some(l => l.f === x && l.lift > 0));
        for (let i = 0; i < f.length; i++)
            for (let j = i + 1; j < f.length; j++) {
                const k = [f[i], f[j]].sort().join("|");
                const e = c.get(k) || { n: 0, items: [] };
                e.n++;
                e.items.push(b);
                c.set(k, e);
            }
    }
    const used = new Set();
    return [...c.entries()]
        .filter(([, e]) => e.n >= 3)
        .sort((a, b) => b[1].n - a[1].n)
        .filter(([k]) => {
            const [x, y] = k.split("|");
            if (used.has(x) && used.has(y)) return false;
            used.add(x);
            used.add(y);
            return true;
        })
        .slice(0, 5)
        .map(([k, e]) => ({ parts: k.split("|"), n: e.n, items: e.items.slice(0, 4) }));
}
const featName = f => f.slice(2);
function tasteReadHTML() {
    const A = modeItems(),
        M = tasteModel(A);
    if (M.R.length < 12)
        return `<section class="panel span12 taste"><h3>Your taste</h3><p class="hint">Score at least a dozen things here and this turns into a reading of your taste: what lifts your scores, what sinks them, and the kinds of thing to go after next.</p></section>`;
    const likes = M.lift
            .filter(x => x.lift > 0.35)
            .sort((a, b) => b.lift * Math.sqrt(b.n) - a.lift * Math.sqrt(a.n))
            .slice(0, 8),
        cools = M.lift
            .filter(x => x.lift < -0.35)
            .sort((a, b) => a.lift * Math.sqrt(a.n) - b.lift * Math.sqrt(b.n))
            .slice(0, 6);
    const nu = tasteNuance(M),
        pairs = tastePairs(M),
        cl = tasteClusters(M),
        t = b =>
            `<button class="linkbtn" data-act="open" data-id="${esc(b.id)}">${esc(cleanTitle(titleOf(b)))}</button>`;
    const chip = x =>
        `<span class="tchip2 ${x.lift > 0 ? "up" : "down"}" title="${x.n} scored · average ${esc(fmtScore(x.avg))}">${esc(x.name)}<b>${x.lift > 0 ? "+" : ""}${(Math.round(x.lift * 10) / 10).toFixed(1)}</b></span>`;
    return `<section class="panel span12 taste"><h3>Your taste, read closely</h3><p class="hint">From ${M.R.length} things you've scored here (your average is ${esc(fmtScore(Math.round(M.mean * 10) / 10))}). Numbers show how far each lifts or lowers your score.</p>
    <div class="tgrid">
      <div><p class="label">What lifts your scores</p><div class="tchips">${likes.map(chip).join("") || `<span class="hint">Nothing stands out yet.</span>`}</div>
        <p class="label" style="margin-top:12px">What tends to sink them</p><div class="tchips">${cools.map(chip).join("") || `<span class="hint">Nothing consistently.</span>`}</div></div>
      <div><p class="label">The nuance</p>${nu.length ? nu.map(x => `<p class="tline"><b>${esc(x.genre)}</b>: ${[x.up.length ? `your best carry <em>${x.up.map(esc).join(", ")}</em>` : "", x.down.length ? `the ones you rate lowest lean on <em>${x.down.map(esc).join(", ")}</em>` : ""].filter(Boolean).join("; ")}. ${x.best.length ? `Think ${x.best.map(t).join(" and ")}` : ""}${x.worst.length ? ` over ${x.worst.map(t).join(" or ")}` : ""}.</p>`).join("") : `<p class="hint">Needs a few more scores inside your main genres.</p>`}</div>
    </div>
    ${
        pairs.length
            ? `<p class="label" style="margin-top:14px">Close cousins, far apart</p><div class="tpairs">${pairs
                  .map(
                      p => `<div class="tpair"><span>${t(p.a)} <b class="hi">${esc(fmtScore(p.a.rating, scaleOf(p.a)))}</b></span><span class="vs">vs</span><span>${t(p.b)} <b class="lo">${esc(fmtScore(p.b.rating, scaleOf(p.b)))}</b></span>
      <small>Both ${
          p.shared
              .filter(f => f[0] === "g")
              .slice(0, 3)
              .map(featName)
              .map(esc)
              .join(", ") || "share a lot"
      }. ${p.onlyA.length ? `Only the first has ${p.onlyA.map(featName).map(esc).join(", ")}` : ""}${p.onlyA.length && p.onlyB.length ? "; " : ""}${p.onlyB.length ? `only the second has ${p.onlyB.map(featName).map(esc).join(", ")}` : ""}.</small></div>`
                  )
                  .join("")}</div>`
            : ""
    }
    ${
        cl.length
            ? `<p class="label" style="margin-top:14px">Go after more of</p><div class="tclusters">${cl
                  .map(
                      (
                          c,
                          i
                      ) => `<div class="tcl"><b>${c.parts.map(featName).map(esc).join(" + ")}</b><small>${c.n} of your favourites, like ${c.items.slice(0, 3).map(t).join(", ")}</small>
      <button class="btn sm" data-act="taste-more" data-k="${i}">Find more</button>${(ui.tasteMore || {})[i] ? tasteMoreHTML((ui.tasteMore || {})[i]) : ""}</div>`
                  )
                  .join("")}</div>`
            : ""
    }</section>`;
}
function tasteMoreHTML(st) {
    if (st.busy) return `<p class="think">Asking AniList for the best-rated with this mix…</p>`;
    if (st.err) return `<p class="hint">${esc(st.err)}</p>`;
    return st.res.length
        ? `<div class="recs compact">${st.res
              .slice(0, 8)
              .map(
                  r =>
                      `<div class="rec">${coverHTML({ title: r.title, medium: r.medium, cover: r.cover })}<div class="rt"><b>${esc(r.title)}</b><small>${esc([MEDIA[r.medium].one, r.year, r.scores && r.scores.anilist ? r.scores.anilist + "%" : ""].filter(Boolean).join(" · "))}</small></div><button class="btn sm" data-act="taste-add" data-k="${esc(r.ext.anilist)}">+ Plan</button></div>`
              )
              .join("")}</div>`
        : `<p class="hint">Nothing new with exactly this mix.</p>`;
}
async function tasteMore(i) {
    const M = tasteModel(modeItems()),
        c = tasteClusters(M)[i];
    if (!c) return;
    ui.tasteMore = { ...(ui.tasteMore || {}), [i]: { busy: true, res: [] } };
    renderMain();
    const g = c.parts.filter(f => f[0] === "g").map(featName),
        tg = c.parts.filter(f => f[0] === "t").map(featName);
    try {
        const d = await AL.q(
            `query($g:[String],$t:[String]){ Page(perPage: 24){ media(genre_in:$g, tag_in:$t, sort:[SCORE_DESC], isAdult:false, averageScore_greater: 70){ ${AL_MEDIA} } } }`,
            { g: g.length ? g : undefined, t: tg.length ? tg : undefined }
        );
        const have = new Set([...items.values()].map(b => (b.ext || {}).anilist).filter(Boolean));
        const res = (d.Page.media || [])
            .map(m => ({ src: "anilist", ...alToFields(m) }))
            .filter(
                r => !have.has(r.ext.anilist) && (isUniversal() || inMode({ medium: r.medium, kind: r.kind || "" }))
            );
        ui.tasteMore[i] = { res };
        ui.tasteRes = { ...(ui.tasteRes || {}), ...Object.fromEntries(res.map(r => [r.ext.anilist, r])) };
    } catch (e) {
        ui.tasteMore[i] = {
            err: navigator.onLine ? "AniList didn't answer. Try again in a moment." : "This needs the internet.",
            res: [],
        };
    }
    renderMain();
}
function tasteClick(act, t, k) {
    if (act === "taste-more") {
        tasteMore(Number(k));
        return true;
    }
    if (act === "taste-add") {
        const r = (ui.tasteRes || {})[k];
        if (!r) return true;
        const data = { ...r, status: "want", copy: "none", rating: 0, source: "anilist" };
        for (const x of ["src", "recs", "cast", "votes", "popularity"]) delete data[x];
        addItem(data, "Add " + r.title);
        toast(`Planned: ${r.title}`, { label: "Undo", fn: undo });
        for (const st of Object.values(ui.tasteMore || {}))
            if (st.res) st.res = st.res.filter(x => x.ext.anilist !== r.ext.anilist);
        renderMain();
        return true;
    }
    return false;
}
