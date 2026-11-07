// src/features/import-export/smartimport.js
// ─────────────────────────────────────────────────────────────────
//  Smart import: a list from anywhere (any site's CSV, a pasted list) is looked up row by row
//
//  Each row is matched online, so it arrives with the right title, picture, year and ids. Matching forgives typos
//  (titles are compared by how alike they are, not letter by letter). Rows nothing matches are shown to you before
//  anything is created.
// ─────────────────────────────────────────────────────────────────

// ── scores in any form: 8, 8/10, 4.5/5, 85%, ★★★★½, ⭐⭐⭐, 👍 ──
const STAR_FULL = /[★⭐🌟✪✭]/gu,
    STAR_HALF = /½|⯪|☆½/u;
// what a score column is out of, from its header ("Rating (out of 5)", "Score /100") or, failing that, from its biggest value
function columnScale(header, values) {
    const h = String(header || "");
    const m = /(?:out of|\/)\s*(5|10|100)\b/i.exec(h);
    if (m) return m[1];
    if (/stars?/i.test(h)) return "5";
    const nums = values
        .map(v => String(v || "").trim())
        .filter(v => /^\d+(?:[.,]\d+)?$/.test(v))
        .map(v => parseFloat(v.replace(",", ".")));
    if (!nums.length) return "10";
    const max = Math.max(...nums);
    return max <= 5 && nums.some(n => n % 1) ? "5" : max <= 5 && nums.length > 4 ? "5" : max <= 10 ? "10" : "100";
}
// one score → [out of 10, the scale it was given in]
function parseAnyScore(v, colScale = "10") {
    const s = String(v == null ? "" : v).trim();
    if (!s) return [0, ""];
    const stars = (s.match(STAR_FULL) || []).length,
        half = STAR_HALF.test(s) ? 0.5 : 0;
    if (stars || (half && !/\d/.test(s))) return [Math.min(10, (stars + half) * 2), "5"];
    if (/^👍/u.test(s)) return [8, "10"];
    if (/^👎/u.test(s)) return [3, "10"];
    const frac = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+)/.exec(s);
    if (frac) {
        const n = parseFloat(frac[1].replace(",", ".")),
            d = +frac[2];
        if (d > 0 && n <= d) return [Math.round((n / d) * 100) / 10, d === 5 ? "5" : d === 100 ? "100" : "10"];
    }
    const pc = /(\d+(?:[.,]\d+)?)\s*%/.exec(s);
    if (pc) return [Math.min(10, Math.round(parseFloat(pc[1].replace(",", "."))) / 10), "100"];
    const n = parseFloat(s.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return [0, ""];
    const out = colScale === "5" ? n * 2 : colScale === "100" ? n / 10 : n;
    return [Math.min(10, Math.round(out * 10) / 10), colScale];
}
// "Anime", "Movie", "TV Series", "Book", "Video game"… in a column: what each row is, when one file mixes them
function mediumFromText(v) {
    const s = String(v || "").toLowerCase();
    if (!s) return "";
    if (/anime/.test(s)) return "anime";
    if (/manhwa|manhua|webtoon/.test(s)) return "manhwa";
    if (/manga/.test(s)) return "manga";
    if (/light novel/.test(s)) return "novel";
    if (/comic|graphic novel/.test(s)) return "comic";
    if (/game|ps\d|xbox|switch|nintendo|steam|pc\b/.test(s)) return "game";
    if (/album|music|\bep\b|single|vinyl|\blp\b|record/.test(s)) return "album";
    if (/movie|film/.test(s)) return "film";
    if (/tv|series|show|season|episode|drama/.test(s)) return "tv";
    if (/book|novel|audiobook|ebook|kindle/.test(s)) return "book";
    return "";
}

// ── how alike two titles are, 0 to 1 (typos, missing words and punctuation forgiven) ──
function grams(s) {
    const t =
            " " +
            norm(cleanTitle(s))
                .replace(/\b(the|a|an)\b/g, "")
                .replace(/\s+/g, " ")
                .trim() +
            " ",
        g = new Map();
    for (let i = 0; i < t.length - 1; i++) {
        const k = t.slice(i, i + 2);
        g.set(k, (g.get(k) || 0) + 1);
    }
    return g;
}
function titleLike(a, b) {
    if (!a || !b) return 0;
    if (norm(cleanTitle(a)) === norm(cleanTitle(b))) return 1;
    const A = grams(a),
        B = grams(b);
    let both = 0,
        n = 0;
    for (const [k, c] of A) {
        n += c;
        both += Math.min(c, B.get(k) || 0);
    }
    for (const c of B.values()) n += c;
    return n ? (2 * both) / n : 0;
}
// the best of a search's results for a row, or null when none is close enough
function bestOnline(x, R) {
    const sur = surname(x.creator || "");
    let best = null,
        top = 0;
    for (const r of R || []) {
        if (x.medium && r.medium && r.medium !== x.medium && !(x.medium === "book" && r.medium === "comic")) continue;
        let s = Math.max(
            ...[r.title, r.alt && r.alt.en, r.alt && r.alt.romaji, r.alt && r.alt.native]
                .filter(Boolean)
                .map(t => titleLike(x.title, t))
        );
        if (x.year && r.year) s += x.year === r.year ? 0.12 : Math.abs(x.year - r.year) <= 1 ? 0.04 : -0.15;
        if (sur && r.creator) s += norm(r.creator).includes(sur) ? 0.1 : -0.05;
        if (s > top) {
            top = s;
            best = r;
        }
    }
    return top >= 0.62 ? { r: best, sure: top >= 0.85 } : null;
}
// what a match brings, and what of yours it never overwrites
const MINE = ["rating", "scale", "status", "finishedAt", "startedAt", "notes", "tags", "prog", "repeat", "copy", "log"];
function withMatch(x, r) {
    const keep = Object.fromEntries(
        MINE.filter(k => x[k] != null && x[k] !== "" && !(Array.isArray(x[k]) && !x[k].length)).map(k => [k, x[k]])
    );
    return {
        ...r,
        src: undefined,
        recs: undefined,
        medium: r.medium || x.medium,
        kind: x.kind || r.kind || "",
        ...keep,
        typed: x.title,
    };
}

// ── the matching run: a few rows at a time, gently (AniList allows about 90 lookups a minute) ──
async function smartMatch(m) {
    const rows = m.rows,
        ctl = (m.ctl = new AbortController()),
        al = x => ["anime", "manga", "manhwa", "novel"].includes(x.medium);
    let i = 0;
    m.done = 0;
    m.running = true;
    const one = async x => {
        if (x.state) return; // already decided (library, matched or looked up by hand)
        if (findExisting(x.title, x.creator, x.medium, x.ext)) {
            x.state = "library";
            return;
        }
        try {
            let R = await searchMedium(x.medium, cleanTitle(x.title), ctl.signal),
                hit = bestOnline(x, R);
            // a typo in the first word sinks most searches: try the longest words on their own
            if (!hit) {
                const words = norm(cleanTitle(x.title))
                    .split(" ")
                    .filter(w => w.length > 3)
                    .sort((a, b) => b.length - a.length)
                    .slice(0, 2)
                    .join(" ");
                if (words && words !== norm(cleanTitle(x.title))) {
                    R = await searchMedium(x.medium, words, ctl.signal);
                    hit = bestOnline(x, R);
                }
            }
            if (hit) {
                x.match = hit.r;
                x.sure = hit.sure;
                x.state = "matched";
            } else x.state = "none";
        } catch (e) {
            if (e.name === "AbortError") throw e;
            x.state = "none";
            x.err = true;
        }
    };
    const worker = async () => {
        while (i < rows.length && !ctl.signal.aborted) {
            const x = rows[i++];
            await one(x);
            m.done++;
            smartRedraw();
            await sleep(al(x) ? 700 : 150);
        }
    };
    try {
        await Promise.all([worker(), worker()]);
    } catch (_) {}
    m.running = false;
    smartRedraw();
}
function smartRedraw() {
    if (ui.modal && ui.modal.kind === "smartmatch") {
        const y = ($(".modal") || {}).scrollTop;
        renderOverlay();
        const md = $(".modal");
        if (md && y) md.scrollTop = y;
    }
}
// start one: from the column matcher or a pasted list
function smartImport(kind, list) {
    if (!navigator.onLine || !list.length) {
        runImport({ kind, items: list });
        return;
    }
    openModal("smartmatch", { from: kind, rows: list.map(x => ({ ...x })), add: {} });
    smartMatch(ui.modal);
}
MODALS.smartmatch = function (m) {
    const R = m.rows,
        lib = R.filter(x => x.state === "library"),
        ok = R.filter(x => x.state === "matched"),
        none = R.filter(x => x.state === "none"),
        wait = R.filter(x => !x.state);
    const pct = R.length ? Math.round((m.done / R.length) * 100) : 100,
        nAdd = none.filter(x => m.add[R.indexOf(x)]).length;
    const line = x => {
        const i = R.indexOf(x),
            r = x.match;
        return `<div class="smrow${x.sure ? "" : " unsure"}"><span class="pc">${r && r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</span>
      <span class="t"><b>${esc(r.title)}</b><small>${esc([r.year, r.kind || MEDIA[r.medium || x.medium].one, r.creator].filter(Boolean).join(" · "))}${norm(r.title) !== norm(x.title) ? ` · you typed “${esc(x.title)}”` : ""}</small></span>
      ${x.rating ? `<span class="hint">${esc(fmtScore(x.rating, x.scale || undefined))}</span>` : ""}<button class="btn sm ghost" data-act="sm-unmatch" data-k="${i}" title="Not this one">✕</button></div>`;
    };
    return (
        head("Matching your list · " + esc(m.from || "")) +
        `
    <div class="smprog"><div class="prog"><span style="width:${pct}%"></span></div><span class="hint">${m.running ? `Looking up ${m.done} of ${R.length}…` : `Looked up all ${R.length}`} · ${plural(ok.length, "match", "matches")} · ${lib.length} already in your library · ${none.length} not found${wait.length && !m.running ? ` · ${wait.length} not looked up` : ""}</span></div>
    ${
        none.length
            ? `<div class="panel smnone"><h3>Not found online · ${none.length}</h3><p class="hint">Fix the spelling and look again, or tick the ones to add exactly as typed. Nothing here is added unless you tick it.</p>
      <div class="bar"><button class="linkbtn" data-act="sm-addall">Tick all</button><button class="linkbtn" data-act="sm-addnone">Untick all</button></div>
      ${none
          .map(x => {
              const i = R.indexOf(x);
              return `<div class="smrow"><label class="ctl"><input type="checkbox" data-smadd="${i}" ${m.add[i] ? "checked" : ""} aria-label="Add as typed"></label><input class="inp" data-smtitle="${i}" value="${esc(x.title)}"><span class="hint">${esc(MEDIA[x.medium].one)}${x.year ? " · " + x.year : ""}</span><button class="btn sm" data-act="sm-retry" data-k="${i}">Look again</button></div>`;
          })
          .join("")}</div>`
            : ""
    }
    ${
        ok.length
            ? `<details class="panel" ${ok.some(x => !x.sure) ? "open" : ""}><summary><h3>Matched · ${ok.length}${ok.some(x => !x.sure) ? ` <span class="hint">· ${ok.filter(x => !x.sure).length} worth a look</span>` : ""}</h3></summary><div class="smlist">${ok
                  .sort((a, b) => a.sure - b.sure)
                  .map(line)
                  .join("")}</div></details>`
            : ""
    }
    <div class="bar" style="margin-top:12px"><button class="btn gold" data-act="sm-import" ${m.running && !ok.length && !lib.length ? "disabled" : ""}>Import ${ok.length + lib.length + nAdd}${m.running ? " (stop looking)" : ""}</button>
      <button class="btn ghost" data-act="sm-raw">Import everything as typed</button></div>
    <p class="hint">Your scores, statuses, dates and notes are kept exactly; a match only brings the title, picture, year and links. Scores keep the scale they were given in.</p>`
    );
};
function smartClick(act, t, k) {
    const m = ui.modal;
    if (!m || m.kind !== "smartmatch") return false;
    const R = m.rows,
        i = Number(k);
    if (act === "sm-unmatch") {
        const x = R[i];
        x.match = null;
        x.state = "none";
        renderOverlay();
        return true;
    }
    if (act === "sm-addall" || act === "sm-addnone") {
        R.forEach((x, j) => {
            if (x.state === "none") m.add[j] = act === "sm-addall";
        });
        renderOverlay();
        return true;
    }
    if (act === "sm-retry") {
        const x = R[i],
            inp = $(`[data-smtitle="${i}"]`);
        if (inp) x.title = inp.value.trim() || x.title;
        x.state = "";
        x.match = null;
        t.disabled = true;
        (async () => {
            try {
                const hit = bestOnline(x, await searchMedium(x.medium, cleanTitle(x.title)));
                if (hit) {
                    x.match = hit.r;
                    x.sure = true;
                    x.state = "matched";
                } else x.state = "none";
            } catch (_) {
                x.state = "none";
            }
            renderOverlay();
        })();
        return true;
    }
    if (act === "sm-import" || act === "sm-raw") {
        if (m.ctl) m.ctl.abort();
        const list =
            act === "sm-raw"
                ? R.map(x => {
                      const { state, match, sure, err, typed, ...y } = x;
                      return y;
                  })
                : R.flatMap((x, j) => {
                      const { state, match, sure, err, ...y } = x;
                      return state === "matched"
                          ? [withMatch(y, match)]
                          : state === "library" || !state
                            ? [y]
                            : m.add[j]
                              ? [y]
                              : [];
                  });
        runImport({ kind: m.from || "your list", items: list });
        return true;
    }
    return false;
}
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset || t.dataset.smadd == null) return;
    const m = ui.modal;
    if (!m || m.kind !== "smartmatch") return;
    m.add[t.dataset.smadd] = t.checked;
    renderOverlay();
});
