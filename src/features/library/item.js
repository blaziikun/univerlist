// src/features/library/item.js
// ─────────────────────────────────────────────────────────────────
//  The item card: actions and facts down the side, the detail in tabs
//
//  tab names follow the medium: a book has a Journal, a film a Diary, a game a Log
// ─────────────────────────────────────────────────────────────────

const journalName = b => ({ read: "Journal", watch: "Diary", play: "Log", listen: "Notes" })[MEDIA[b.medium].group];
function itemTabs(b) {
    const castable = ["anime", "tv", "film", "game"].includes(b.medium),
        chars = b.medium !== "album"; // an album has songs, not characters
    const nLinks = (b.links || []).filter(l => items.has(l.id)).length,
        nJ = (b.quotes || []).length + (b.journal || []).length;
    return [
        ["synopsis", "Synopsis"],
        chars ? ["chars", "Characters"] : null,
        castable ? ["cast", ["anime", "game"].includes(b.medium) ? "Voice cast" : "Cast"] : null,
        ["connect", `Connections${nLinks ? " · " + nLinks : ""}`],
        ["art", "Art"],
        ["journal", journalName(b) + (nJ ? " · " + nJ : "")],
    ].filter(Boolean);
}
const ownWord = (b, k) => {
    const [ph, dg] = copyWords(b.medium);
    return { none: "Don't own", physical: ph, digital: dg, both: ph + " + " + dg.toLowerCase() }[k] || k;
};
// scores, in the scale you chose (stored out of 10 underneath)
function rateWidget(b, opts = {}) {
    const r = b.rating || 0,
        sc = scaleOf(b),
        key = opts.key || "rate",
        crit = opts.crit ? ` data-crit="${esc(opts.crit)}"` : "",
        val = opts.value != null ? opts.value : r;
    if (sc === "5") {
        const v = val / 2;
        return `<div class="stars" role="group" aria-label="Score">${[1, 2, 3, 4, 5].map(n => `<span class="star${v >= n ? " on" : v >= n - 0.5 ? " half" : ""}"><button data-act="${key}" data-k="${n * 2 - 1}"${crit} aria-label="${n - 0.5} stars"></button><button data-act="${key}" data-k="${n * 2}"${crit} aria-label="${n} stars"></button>★</span>`).join("")}${val ? `<button class="linkbtn" data-act="${key}" data-k="0"${crit}>clear</button>` : ""}</div>`;
    }
    if (sc === "10")
        return `<div class="rate10">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button class="${Math.round(val) >= n ? "on" : ""}" data-act="${key}" data-k="${n}"${crit} aria-label="${n} out of 10">${n}</button>`).join("")}${val ? `<button class="linkbtn" data-act="${key}" data-k="0"${crit}>clear</button>` : ""}</div>`;
    const max = sc === "100" ? 100 : 10,
        shown = val ? (sc === "100" ? Math.round(val * 10) : val) : "",
        step = sc === "100" ? 1 : 0.1;
    return `<div class="rateslide"><input type="range" min="0" max="${max}" step="${step}" value="${shown || 0}" data-rate="${key}"${crit} aria-label="Score out of ${max}"><input class="inp rnum" inputmode="decimal" value="${shown}" data-ratenum="${key}"${crit} placeholder="–" aria-label="Score"><span class="hint">/ ${max}</span>${val ? `<button class="linkbtn" data-act="${key}" data-k="0"${crit}>clear</button>` : ""}</div>`;
}
const criteriaFor = b =>
    (meta.settings.criteria || {})[b.medium] || DEFAULT_CRITERIA[b.medium] || ["Story", "Enjoyment"];
function critHTML(b, full) {
    const C = criteriaFor(b),
        v = b.crit || {},
        scored = C.filter(k => v[k]);
    if (!full)
        return scored.length
            ? `<div class="critsum">${scored.map(k => `<span><small>${esc(k)}</small><i style="--w:${v[k] * 10}%"></i><b>${esc(fmtScore(v[k]))}</b></span>`).join("")}</div>`
            : "";
    const avg = scored.length ? scored.reduce((a, k) => a + v[k], 0) / scored.length : 0;
    return `<div class="crit">${C.map(k => `<div class="critrow"><span class="cl">${esc(k)}</span>${rateWidget(b, { key: "crit", crit: k, value: v[k] || 0 })}</div>`).join("")}
    <div class="bar"><label class="ctl"><input type="checkbox" id="crit-avg" ${b.critAvg ? "checked" : ""}> My score is the average of these${avg ? ` (${esc(fmtScore(Math.round(avg * 10) / 10))})` : ""}</label><button class="linkbtn" data-act="go-settings" data-k="ratings">Change the criteria</button></div></div>`;
}
MODALS.item = function (m) {
    const b = { id: m.id, ...items.get(m.id) },
        M = MEDIA[b.medium],
        words = STATUS_WORDS[M.group];
    if (m.editing)
        return (
            head("Edit details") +
            editFieldsHTML(b, "e-") +
            `<div class="bar"><button class="btn gold" data-act="save-edit">Save</button><button class="btn ghost" data-act="cancel-edit">Cancel</button></div>`
        );
    const tabs = itemTabs(b);
    if (!tabs.some(t => t[0] === m.tab)) m.tab = "synopsis";
    const seq = m.seq && m.seq.length ? m.seq : listOrder,
        pos = seq.indexOf(m.id),
        c = crowd(b),
        priv = vault.ids.has(b.id);
    const alt = [b.alt && b.alt.romaji, b.alt && b.alt.native, b.alt && b.alt.original].filter(
        x => x && x !== titleOf(b) && x !== b.title
    );
    const air =
        {
            RELEASING: "Releasing",
            FINISHED: "Finished",
            NOT_YET_RELEASED: "Not out yet",
            HIATUS: "On hiatus",
            CANCELLED: "Cancelled",
        }[b.airStatus] || "";
    const len =
        b.medium === "film"
            ? b.runtime
                ? b.runtime + " min"
                : ""
            : b.medium === "game"
              ? b.total
                  ? "~" + b.total + " h to beat"
                  : ""
              : b.total
                ? b.total + " " + unitOf(b)[1] + (b.runtime ? " · " + b.runtime + " min each" : "")
                : "";
    const facts = [
        [
            {
                book: "Author",
                manga: "Author",
                manhwa: "Author",
                novel: "Author",
                comic: "Writer",
                anime: "Studio",
                tv: "Created by",
                film: "Director",
                game: "Developer",
                album: "Artist",
            }[b.medium],
            b.creator,
        ],
        ["Released", b.season || b.year],
        ["Length", len],
        b.vols ? ["Volumes", b.vols] : null,
        ["Type", b.kind || M.one],
        air ? ["Status", air] : null,
        b.series ? ["Series", b.series + (b.seriesNo ? " #" + b.seriesNo : "")] : null,
        b.subject ? ["Subject", b.subject] : null,
        b.franchise ? ["Franchise", b.franchise] : null,
        callOf(b.id) ? ["Call no.", callOf(b.id)] : null,
    ].filter(x => x && x[1]);
    const plats = [...new Set([...(b.platforms || []), b.platform].filter(Boolean))];
    const tint = b.coverColor && b.coverColor !== "none" ? b.coverColor : b.color || "";
    return `<div class="item7"${tint ? ` style="--tint:${esc(tint)}"` : ""}>
    <aside class="iside">
      <button class="icover${boxAttr(b).cls}" data-act="item-tab" data-k="art" title="Artwork" style="${boxAttr(b).st}">${coverHTML(b)}</button>
      <div class="ibox"><label class="ilab" for="it-status">Status</label>${selOf(
          "it-status",
          STATUS.map(k => [k, words[k]]),
          b.status
      )}
        ${b.status === "done" ? `<button class="btn sm ghost wide" data-act="reread">${esc(verbOf(b.medium)[1])}</button>` : !["active", "redo"].includes(b.status) ? `<button class="btn sm gold wide" data-act="start" data-id="${esc(b.id)}">${esc(verbOf(b.medium)[0])}</button>` : ""}</div>
      <div class="ibox"><span class="ilab">Your score ${b.rating ? `<b class="bigscore">${esc(fmtScore(b.rating, scaleOf(b)))}</b>` : ""}</span>${rateWidget(b)}<label class="ctl iscale">Scale for this one ${selOf("it-scale", [["", "Your usual (" + (SCALES.find(x => x[0] === (meta.settings.ratingScale || "10d")) || SCALES[0])[1].split(",")[0] + ")"], ...SCALES], b.scale || "")}</label>${critHTML(b, false)}<button class="linkbtn" data-act="crit-open">${m.critOpen ? "Hide the detail" : "Rate in detail"}</button>${m.critOpen ? critHTML(b, true) : ""}</div>
      ${!stageOn() ? "" : ["anime", "tv", "film"].includes(b.medium) ? `<button class="btn gold wide playbtn" data-act="watch-open" data-id="${esc(b.id)}">${ICON.play} Watch</button>` : readable(b) ? `<button class="btn gold wide playbtn" data-act="read-open" data-id="${esc(b.id)}">❡ Read</button>` : ""}
      <div class="ibox irow"><button class="btn sm${b.fav ? " favon" : ""}" data-act="fav-toggle" data-id="${esc(b.id)}" aria-pressed="${!!b.fav}">${b.fav ? "♥ Favourite" : "♡ Favourite"}</button>
        ${meta.queue.includes(b.id) ? `<button class="btn sm" data-act="q-remove" data-id="${esc(b.id)}">✓ Up next</button>` : `<button class="btn sm" data-act="q-add" data-id="${esc(b.id)}">+ Up next</button>`}<button class="btn sm" data-act="list-pick" data-id="${esc(b.id)}">≡ Lists</button></div>
      <div class="ibox"><label class="ilab" for="it-copy">Ownership</label>${selOf(
          "it-copy",
          COPY.map(([k]) => [k, ownWord(b, k)]),
          b.copy || "none"
      )}
        ${b.copy === "none" ? `<label class="ctl"><input type="checkbox" id="it-buy" ${b.toBuy ? "checked" : ""}> Plan to buy</label>` : ""}
        ${
            ["manga", "manhwa", "novel"].includes(b.medium) && b.vols && ["physical", "both"].includes(b.copy)
                ? `<p class="ilab" style="margin-top:6px">Volumes you own <button class="linkbtn" data-act="vols-all">all</button> · <button class="linkbtn" data-act="vols-none">none</button></p><div class="volgrid">${Array.from(
                      { length: Math.min(120, b.vols) },
                      (_, i) => i + 1
                  )
                      .map(
                          v =>
                              `<button data-act="vol-tog" data-k="${v}" aria-pressed="${(b.volsOwned || []).includes(v)}">${v}</button>`
                      )
                      .join("")}</div>`
                : ""
        }
        ${
            b.medium === "game"
                ? `<label class="ilab" for="it-plat" style="margin-top:6px">Platform you play on</label><input class="inp" id="it-plat" list="it-plats" value="${esc(b.platform || "")}" placeholder="${esc(plats[0] || "e.g. Switch")}"><datalist id="it-plats">${plats
                      .concat(GAME_CASE.map(g => g[3]))
                      .filter((x, i, a) => a.indexOf(x) === i)
                      .map(p => `<option value="${esc(p)}">`)
                      .join("")}</datalist>`
                : ""
        }</div>
      <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
      <details class="imore"${m.moreOpen ? " open" : ""}><summary>More</summary>
        <div class="col"><button class="btn sm ghost" data-act="edit">Edit details</button><button class="btn sm ghost" data-act="parts-open">${partsOf(b).length ? "Parts" : "Combine with seasons or sequels"}</button>
          <label class="ctl imode">Lives in ${selOf("it-mode", [["auto", "where its type puts it"], ...meta.modes.filter(x => x.id !== "universal").map(x => [x.id, x.name])], b.modeHome || "auto")}</label>
          <label class="ctl imode">Title in ${selOf(
              "it-tlang",
              [
                  ["", "app setting"],
                  ["en", "English"],
                  ["romaji", "Romaji"],
                  ["native", "Native"],
                  ["original", "Original"],
              ],
              b.titleLang || ""
          )}</label><button class="btn sm ghost" data-act="item-refresh" ${m.refreshing ? "disabled" : ""}>${m.refreshing ? "Refreshing…" : "Refresh details & scores"}</button>
          <button class="btn sm ghost" data-act="item-hide">${b.hidden ? "Show in lists again" : "Hide from lists"}</button>
          ${meta.vault ? (priv ? `<button class="btn sm ghost" data-act="item-public">Move to main library</button>` : `<button class="btn sm ghost" data-act="item-private" ${vault.key ? "" : 'title="Unlock your private collection first"'}>🔒 Move to private</button>`) : ""}
          ${m.confirmDelete ? `<span class="err">Delete this?</span><button class="btn sm danger" data-act="delete-yes">Delete</button><button class="btn sm ghost" data-act="delete-no">Keep</button>` : `<button class="btn sm danger" data-act="delete">Delete</button>`}</div>
        ${m.refreshNote ? `<p class="hint">${esc(m.refreshNote)}</p>` : ""}</details>
    </aside>
    <div class="imain">
      <div class="ihead"><div class="navarrows"><button class="btn sm ghost" data-act="item-prev" ${pos <= 0 ? "disabled" : ""} aria-label="Previous (←)" title="Previous (←)">←</button><span class="hint pos">${pos >= 0 ? pos + 1 + " / " + seq.length : ""}</span><button class="btn sm ghost" data-act="item-next" ${pos < 0 || pos >= seq.length - 1 ? "disabled" : ""} aria-label="Next (→)" title="Next (→)">→</button><button class="x" data-act="close" aria-label="Close">✕</button></div>
        <div class="eyebrow">${esc(M.g)} ${esc([b.kind || M.one.charAt(0).toUpperCase() + M.one.slice(1), ...(b.genres || []).slice(0, 3)].join(" · "))}${b.hidden ? " · hidden" : ""}${priv ? " · 🔒 private" : ""}</div>
        <h2>${esc(titleOf(b))}</h2>${alt.length ? `<div class="alt">${esc(alt.join(" · "))}</div>` : ""}${b.creator ? `<div class="by">${esc(b.creator)}${b.year ? " · " + b.year : ""}</div>` : b.year ? `<div class="by">${b.year}</div>` : ""}
        <div class="scores">${b.rating ? `<span class="sc you"><small>You</small>${esc(fmtScore(b.rating, scaleOf(b)))}</span>` : ""}${c.parts.map(p => `<span class="sc"><small>${esc(p.label)}</small>${esc(p.show)}</span>`).join("")}${c.avg != null ? `<span class="sc avg"><small>Crowd</small>${c.avg}<i>/100</i></span>` : ""}</div></div>
      <div class="tabs itabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${m.tab === k}" data-act="item-tab" data-k="${k}">${esc(l)}</button>`).join("")}</div>
      <div class="ibody">${({ synopsis: synopsisTab, chars: charsTab, cast: castTab, connect: connectTab, art: artTab, journal: journalTab })[m.tab](b, m)}</div>
      ${m.error ? `<p class="err">${esc(m.error)}</p>` : ""}</div></div>`;
};
// ── Overview: where you are, the episodes, every time you came back to it ──
function overviewTab(b, m) {
    const log = (b.log || []).slice().reverse(),
        M = MEDIA[b.medium],
        [one, many, abbr] = unitOf(b),
        words = STATUS_WORDS[M.group];
    const reads = (b.reads || []).filter(r => r.finishedAt || r.startedAt);
    return `${
        b.medium !== "film"
            ? `<div class="sec"><p class="label">Progress</p>
      <div class="bar"><label class="ctl">${esc(one.charAt(0).toUpperCase() + one.slice(1))} <input class="inp" id="pg-now" inputmode="decimal" style="width:84px" value="${b.prog || 0}"></label><span class="hint">of</span>
        <input class="inp" id="pg-total" inputmode="numeric" style="width:84px" placeholder="${esc(many)}" value="${b.total || ""}">
        ${["manga", "manhwa", "novel"].includes(b.medium) ? `<label class="ctl">Vol <input class="inp" id="pg-vol" inputmode="numeric" style="width:60px" value="${b.vol || ""}"></label>` : ""}
        <button class="btn gold sm" data-act="log-save">Log</button>${M.steps.map(n => `<button class="btn sm" data-act="log-add" data-id="${esc(b.id)}" data-k="${n}">+${n}${b.medium === "game" ? " h" : ""}</button>`).join("")}</div>
      ${b.total ? `<div class="prog" style="margin-top:6px"><span style="width:${pct(b)}%"></span></div><p class="hint">${pct(b)}% · ${Math.max(0, b.total - (b.prog || 0))} ${esc(many)} left${b.medium !== "game" ? " · about " + fmtHours(Math.max(0, b.total - (b.prog || 0)) * minutesPerUnit(b)) : ""}${paceText(b)}</p>` : ""}</div>`
            : `<div class="sec"><p class="label">Watched?</p><div class="bar"><button class="btn gold sm" data-act="finish" data-id="${esc(b.id)}">${b.status === "done" ? "Log another watch" : "Mark watched today"}</button><span class="hint">${b.runtime ? b.runtime + " minutes" : ""}</span></div></div>`
    }
    ${episodesHTML(b, m)}${seasonsHTML(b)}
    ${
        b.medium === "game"
            ? `<div class="sec"><p class="label">How far</p><div class="status-seg wrap">${[
                  ["", "Not set"],
                  ["story", "Main story"],
                  ["extras", "Story + extras"],
                  ["full", "100%"],
                  ["endless", "Endless / multiplayer"],
              ]
                  .map(
                      ([k, l]) =>
                          `<button data-act="game-comp" data-k="${k}" aria-pressed="${(b.completion || "") === k}">${l}</button>`
                  )
                  .join("")}</div></div>`
            : ""
    }
    <div class="sec"><p class="label">Dates</p><div class="bar"><label class="ctl">Started <input class="inp" type="date" id="d-start" value="${esc(String(b.startedAt || "").slice(0, 10))}" style="width:auto"></label>
      <label class="ctl">${esc(words.done)} <input class="inp" type="date" id="d-finish" value="${esc(String(b.finishedAt || "").slice(0, 10))}" style="width:auto"></label>
      ${b.status === "dnf" ? `<label class="ctl">Dropped <input class="inp" type="date" id="d-drop" value="${esc(String(b.droppedAt || "").slice(0, 10))}" style="width:auto"></label>` : ""}</div></div>
    ${reads.length || b.repeat ? `<div class="sec"><p class="label">History · ${(b.repeat || 0) + 1} time${b.repeat ? "s" : ""}</p><div class="sessions">${reads.map((r, i) => `<div><span>${i + 1}</span><b>${esc(fmtDate(r.startedAt) || "?")} → ${esc(fmtDate(r.finishedAt) || "?")}</b>${r.rating ? `<span>${esc(fmtScore(r.rating, scaleOf(r)))}</span>` : ""}</div>`).join("")}<div><span>${reads.length + 1}</span><b>${esc(fmtDate(b.startedAt) || "?")} → ${b.status === "done" ? esc(fmtDate(b.finishedAt) || "?") : "now"}</b>${b.rating ? `<span>${esc(fmtScore(b.rating, scaleOf(b)))}</span>` : ""}</div></div></div>` : ""}
    <div class="sec"><p class="label">Sessions · ${log.length}${log.length ? " · ≈ " + fmtHours(log.reduce((a, s) => a + (s.min != null ? s.min : Math.max(0, s.to - s.from) * minutesPerUnit(b)), 0)) : ""}</p>${
        log.length
            ? `<div class="sessions">${log
                  .slice(0, 40)
                  .map(
                      (s, i) =>
                          `<div><span>${esc(fmtDate(s.date))}</span><b>${b.medium === "game" ? (s.to - s.from) + " h" : b.medium === "book" ? `p. ${s.from} → ${s.to}` : b.medium === "film" ? "Watched" : `${abbr} ${s.from} → ${s.to}`}</b><button class="linkbtn" data-act="log-del" data-k="${log.length - 1 - i}">remove</button></div>`
                  )
                  .join("")}</div>`
            : `<p class="hint">Nothing logged yet.</p>`
    }</div>`;
}
// reading pace from your own sessions
function paceText(b) {
    if (!["book", "novel", "manga", "manhwa", "comic"].includes(b.medium) || !(b.log || []).length || !b.total)
        return "";
    const L = b.log.filter(s => s.to > s.from),
        first = L.length ? Date.parse(L[0].date) : 0,
        days = Math.max(1, (Date.now() - first) / 864e5),
        per = (b.prog || 0) / days;
    if (per <= 0 || b.status === "done") return "";
    const left = Math.max(0, b.total - (b.prog || 0)),
        eta = new Date(Date.now() + (left / per) * 864e5);
    return ` · ${per >= 1 ? Math.round(per) : per.toFixed(1)} ${unitOf(b)[1]} a day · on pace for ${fmtDate(eta.toISOString())}`;
}
// episodes, ticked off one by one (TVmaze for shows, AniList for anime)
function episodesHTML(b, m) {
    if (!["tv", "anime"].includes(b.medium)) return "";
    const seen = new Set(b.epsSeen || []);
    if (b.medium === "anime") {
        const n = Math.min(500, b.total || 0);
        if (!n) return "";
        return `<div class="sec"><p class="label">Episodes · ${Math.min(b.prog || 0, n)} of ${n}</p><div class="epgrid">${Array.from(
            { length: n },
            (_, i) => i + 1
        )
            .map(
                e =>
                    `<button data-act="ep-to" data-k="${e}" aria-pressed="${(b.prog || 0) >= e}" title="Watched up to episode ${e}">${e}</button>`
            )
            .join("")}</div></div>`;
    }
    if (!b.ext.tvmaze)
        return b.ext.imdb
            ? `<div class="sec"><button class="btn sm" data-act="eps-load">Show episodes</button></div>`
            : "";
    if (!m.eps)
        return `<div class="sec"><div class="bar"><button class="btn sm" data-act="eps-load" ${m.busy === "eps" ? "disabled" : ""}>${m.busy === "eps" ? "Loading…" : "Track episodes"}</button><span class="hint">Season by season, from TVmaze.</span></div></div>`;
    const by = {};
    for (const e of m.eps) (by[e.s] = by[e.s] || []).push(e);
    const S = Object.keys(by)
            .map(Number)
            .sort((a, b) => a - b),
        cur = m.season || S.find(s => by[s].some(e => !seen.has(s + "x" + e.e))) || S[0];
    return `<div class="sec"><p class="label">Episodes · ${seen.size} of ${m.eps.length} watched</p>
    <div class="chips">${S.map(s => `<button class="chip" data-act="ep-season" data-k="${s}" aria-pressed="${s === cur}">S${s} <span class="cn">${by[s].filter(e => seen.has(s + "x" + e.e)).length}/${by[s].length}</span></button>`).join("")}</div>
    <div class="eplist">${by[cur]
        .map(e => {
            const k = cur + "x" + e.e,
                on = seen.has(k);
            return `<button class="ep${on ? " on" : ""}" data-act="ep-tog" data-k="${k}"><span class="en">${e.e}</span><span class="et">${esc(e.title || "Episode " + e.e)}<small>${esc(fmtDate(e.date))}${e.runtime ? " · " + e.runtime + " min" : ""}</small></span><span class="ck">${on ? "✓" : ""}</span></button>`;
        })
        .join("")}</div>
    <div class="bar"><button class="linkbtn" data-act="ep-seasonall" data-k="${cur}">Mark S${cur} watched</button></div></div>`;
}
// ── Synopsis: what it is first, then what kind of thing it is, then your own words ──
function synopsisTab(b, m) {
    const manual = MANUAL_SCORES[b.medium] || [];
    return `${partsOf(b).length || (["anime", "tv", "manga", "manhwa", "novel", "book", "comic", "game", "film"].includes(b.medium) && m.partsOpen) ? partsSectionHTML(b) : ""}${b.about ? `<div class="sec"><p class="synop">${esc(b.about)}</p></div>` : `<p class="hint">No summary yet. <button class="linkbtn" data-act="item-refresh">Fetch one</button> or add it in Edit details.</p>`}
    ${(b.genres || []).length ? `<div class="sec gensec"><span class="label">Genres</span><div class="chips">${b.genres.map(g => `<button class="chip" data-act="go-genre" data-k="${esc(g)}"${genreTip(g)}>${esc(g)}</button>`).join("")}</div></div>` : ""}
    ${(b.themes || []).length ? `<details class="sec themesec"><summary class="label">Themes · ${b.themes.length}</summary><div class="chips">${b.themes.map(g => `<span class="chip ghostchip">${esc(g)}</span>`).join("")}</div></details>` : ""}
    ${overviewTab(b, m)}
    ${sec("Why it's for you", b.why)}${b.favWhy ? sec("Why it's a favourite", b.favWhy) : ""}${b.cw ? `<div class="sec"><p class="label">Content note</p><p style="color:var(--warn)">${esc(b.cw)}</p></div>` : ""}
    <div class="sec"><p class="label">Tags</p><div class="tagedit">${(b.tags || []).map(t => `<span class="tag"><i style="background:${(meta.tags[t] || {}).color || "var(--muted)"}"></i>${esc(t)}<button data-act="untag" data-k="${esc(t)}" aria-label="Remove ${esc(t)}">✕</button></span>`).join("")}
      <input class="inp" id="tag-in" list="tag-opts" placeholder="Add a tag, press Enter"><datalist id="tag-opts">${Object.keys(
          meta.tags
      )
          .filter(t => !(b.tags || []).includes(t))
          .sort()
          .map(t => `<option value="${esc(t)}">`)
          .join("")}</datalist></div></div>
    <div class="sec"><p class="label">Notes</p><textarea id="notes" placeholder="Anything: where you heard of it, what you thought…">${esc(b.notes || "")}</textarea></div>
    ${manual.length ? `<div class="sec"><p class="label">Scores from sites without an API</p><div class="bar">${manual.map(k => `<label class="ctl">${esc(SCORE_DEF[k][0])} <input class="inp" data-mscore="${k}" inputmode="decimal" style="width:70px" value="${esc((b.scores || {})[k] ?? "")}" placeholder="${["mdl", "serializd"].includes(k) ? "/10" : "/5"}"></label>`).join("")}</div></div>` : ""}
    ${
        meta.settings.showLinks
            ? `<div class="sec"><p class="label">Elsewhere</p><p class="links">${linksOut(b)
                  .map(
                      ([l, u]) =>
                          `<a class="link" href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(l)} ↗</a>`
                  )
                  .join(" · ")}</p></div>`
            : ""
    }${
        // RAWG's terms ask for a visible credit, with a link, wherever its data is shown; IGDB gets the same
        b.ext && b.ext.rawg
            ? `<p class="hint credit">Game details from <a class="link" href="https://rawg.io/games/${esc(String(b.ext.rawgSlug || b.ext.rawg))}" target="_blank" rel="noopener">RAWG</a></p>`
            : b.ext && b.ext.igdb && b.ext.igdbSlug
              ? `<p class="hint credit">Game details from <a class="link" href="https://www.igdb.com/games/${esc(String(b.ext.igdbSlug))}" target="_blank" rel="noopener">IGDB</a></p>`
              : ""
    }`;
}
// ── Characters (who's in the story) and Cast (who plays or voices them) ──
const canFetchCast = b => !!(b.ext.anilist || ["tv", "film", "game", "book", "comic"].includes(b.medium));
function castSourceHTML(b, m) {
    if (!m.cast || b.ext.anilist) return "";
    const f = castFrom.get(m.id) || {};
    return `<div class="castsrc"><span class="hint">From ${esc(f.src || "the free sources")}${f.title ? ": " + esc(f.title) + (f.year ? " (" + f.year + ")" : "") : ""}.</span> <button class="linkbtn" data-act="cast-pick">${m.cast.length ? "Wrong title? Choose the right one" : "Find it by another name"}</button></div>
    ${
        m.castPick
            ? `<div class="panel castpick"><div class="bar"><input class="inp" id="cp-q" value="${esc(m.castPick.q)}" style="flex:1"><button class="btn sm" data-act="cast-pick-go">Search</button><button class="linkbtn" data-act="cast-pick-close">Close</button></div>
      ${m.castPick.busy ? `<p class="think">Looking…</p>` : m.castPick.res.length ? `<div class="cplist">${m.castPick.res.map((r, i) => `<button class="cprow" data-act="cast-pick-use" data-k="${i}"><b>${esc(r.title)}</b><small>${esc(r.sub)}</small></button>`).join("")}</div>` : `<p class="hint">Nothing found under that name.</p>`}</div>`
            : ""
    }`;
}
function charsTab(b, m) {
    const mineChars = meta.chars.filter(c =>
        (c.media || []).some(x => x.id === b.id || (x.alId && x.alId === (b.ext || {}).anilist))
    );
    const fav = c =>
        meta.chars.find(
            x =>
                (c.alId && x.alId === c.alId) ||
                (!c.alId && norm(x.name) === norm(c.name) && (x.media || []).some(y => y.id === b.id))
        );
    const list = (m.cast || []).filter(c => c.name);
    return `${mineChars.length ? `<div class="sec"><p class="label">Your favourites from this</p><div class="favrow">${mineChars.map(c => charTile(c)).join("")}</div></div>` : ""}
    ${
        canFetchCast(b)
            ? m.cast
                ? `<div class="sec"><p class="label">${list.length} characters</p><div class="castgrid">${list
                      .map(c => {
                          const i = m.cast.indexOf(c);
                          return `<div class="castc">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="noimg">${c.vaImage ? `<img class="vainset" src="${esc(c.vaImage)}" alt="" title="${esc(c.va || "")}" loading="lazy" referrerpolicy="no-referrer">` : ""}${esc((c.name || "?").charAt(0))}</span>`}<span class="t">${esc(c.name)}</span><span class="hint">${esc(c.src === "anilist" || !c.va ? c.role || "" : (c.role === "Voice" || b.medium === "game" ? "voiced by " : "played by ") + c.va)}</span>
        <button class="btn sm${fav(c) ? " favon" : ""}" data-act="cast-fav" data-k="${i}">${fav(c) ? "♥ Saved" : "♡ Favourite"}</button></div>`;
                      })
                      .join("")}</div></div>`
                : `<div class="bar"><button class="btn" data-act="cast-load" ${m.busy ? "disabled" : ""}>${m.busy === "cast" ? "Loading…" : "Show characters"}</button><span class="hint">From ${b.ext.anilist ? "AniList" : b.medium === "tv" ? "TVmaze" + (TMDB_ON() ? " or TMDB" : "") : TMDB_ON() && b.ext.tmdb ? "TMDB" : "Wikidata"}. No key needed.</span></div>`
            : `<p class="hint">No character list for this from the free sources. Add the ones you love yourself.</p>`
    }
    ${m.cast && !list.length ? `<p class="hint">No characters listed for this yet${b.medium === "game" ? ": Wikidata covers the bigger games best" : ""}. Add the ones you love yourself.</p>` : ""}${castSourceHTML(b, m)}
    <div class="bar"><button class="btn sm" data-act="char-add" data-from="${esc(b.id)}">+ Add a character from this</button>${list.length ? `<button class="btn sm ghost" data-act="cast-tolist" data-k="chars">Put these characters in a list…</button>` : ""}</div>`;
}
function castTab(b, m) {
    const pFav = n => n && (meta.people || []).some(p => norm(p.name) === norm(n) && p.fav),
        isVA = ["anime", "game"].includes(b.medium);
    const list = (m.cast || []).filter(c => c.va);
    if (!canFetchCast(b))
        return `<p class="hint">No cast list for this from the free sources${b.medium === "film" ? ". A free TMDB key adds film casts" : ""}.</p>`;
    if (!m.cast)
        return `<div class="bar"><button class="btn" data-act="cast-load" ${m.busy ? "disabled" : ""}>${m.busy === "cast" ? "Loading…" : isVA ? "Show the voice cast" : "Show the cast"}</button></div>`;
    return list.length
        ? `<div class="castgrid">${list
              .map(c => {
                  const i = m.cast.indexOf(c),
                      img = c.vaImage || (c.src === "tmdb" ? c.image : "");
                  return `<div class="castc">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="noimg">${esc(c.va.charAt(0))}</span>`}<span class="t">${esc(c.va)}</span><span class="hint">${c.name ? "as " + esc(c.name) : esc(c.role || "")}</span>
    <button class="btn sm ghost${pFav(c.va) ? " favon" : ""}" data-act="cast-person" data-k="${i}">${pFav(c.va) ? "♥ Saved" : "♡ " + (isVA ? "Voice actor" : "Actor")}</button></div>`;
              })
              .join(
                  ""
              )}</div><div class="bar"><button class="btn sm ghost" data-act="cast-tolist" data-k="people">Put this cast in a list…</button></div>${castSourceHTML(b, m)}`
        : `<p class="hint">No cast listed.</p>${castSourceHTML(b, m)}`;
}
// ── Journal / Diary / Log: quotes, moments and entries ──
function journalTab(b) {
    const [, , abbr] = unitOf(b),
        word = journalName(b),
        read = MEDIA[b.medium].group === "read";
    return `<div class="sec"><p class="label">New ${word.toLowerCase()} entry</p><textarea id="jr-text" placeholder="${read ? "What you're thinking as you go" : MEDIA[b.medium].group === "watch" ? "What you thought of it, this time" : "Where you are, what you think so far"}" style="min-height:70px"></textarea><div class="bar"><button class="btn sm gold" data-act="journal-add">Add entry</button></div>
      ${b.journal
          .slice()
          .reverse()
          .map(
              (j, i) =>
                  `<div class="entry"><small>${esc(fmtDate(j.date))} · <button class="linkbtn" data-act="journal-del" data-k="${b.journal.length - 1 - i}">remove</button></small><p>${esc(j.text)}</p></div>`
          )
          .join("")}</div>
    <div class="sec"><p class="label">${read ? "Save a quote" : "Save a quote or moment"}</p><textarea id="qt-text" placeholder="A line or scene worth keeping" style="min-height:60px"></textarea>
      <div class="bar"><label class="ctl">${esc(abbr || "At")} <input class="inp" id="qt-page" style="width:80px"></label><button class="btn sm gold" data-act="quote-add">Save</button></div>
      ${b.quotes
          .slice()
          .reverse()
          .map(
              (q, i) =>
                  `<div class="quote">${esc(q.text)}<small>${q.page ? esc(abbr) + " " + esc(q.page) + " · " : ""}${esc(fmtDate(q.date))} · <button class="linkbtn" data-act="quote-del" data-k="${b.quotes.length - 1 - i}">remove</button></small></div>`
          )
          .join("")}</div>`;
}
