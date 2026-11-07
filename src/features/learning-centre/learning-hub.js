// src/features/learning-centre/learning-hub.js
// ─────────────────────────────────────────────────────────────────
//  Learning Centre: a course is a hub
//
//  Everything about one course in one place: your level in its fields and how much of it you've actually finished
//  (mastery), its pathways (opened right here), what it takes to graduate from each programme, the best books (crème de
//  la crème), the few best places to learn it (universities, certifications and independent ones, each with a link to
//  check), and opportunities you're keeping an eye on. Modules can wait on other modules, and topics on other topics.
// ─────────────────────────────────────────────────────────────────

// ── mastery: what you've finished, not what you rate yourself ──
function lcMastery(S) {
    const P = subjPaths(S);
    let td = 0,
        tn = 0,
        bd = 0,
        bn = 0;
    for (const p of P) {
        const t = lcTopics(p);
        td += t.done;
        tn += t.n;
        const core = p.books.filter(b => !b.ref && !b.opt);
        bn += core.length;
        bd += core.filter(b => pwState(b) === "done").length;
    }
    const parts = [tn ? td / tn : null, bn ? bd / bn : null].filter(x => x != null);
    const pct = parts.length ? Math.round((parts.reduce((a, x) => a + x, 0) / parts.length) * 100) : 0;
    return { pct, td, tn, bd, bn, level: pct >= 95 ? 4 : pct >= 70 ? 3 : pct >= 35 ? 2 : pct > 0 ? 1 : 0 };
}
// ── modules waiting on modules, topics waiting on topics ──
const lcModDone = m => m && (m.status === "done" || m.status === "dropped");
function lcModWaits(P, m) {
    return (m.after || []).map(id => (P.modules || []).find(x => x.id === id)).filter(x => x && !lcModDone(x));
}
function lcTopicWaits(P, t) {
    if (!(t.after || []).length) return [];
    const T = lcTopics(P).T;
    return t.after.filter(n => T[n] && !T[n].done);
}
// how a module's topics spread over the course's areas (a thin bar of colours)
function lcSpreadHTML(P, m) {
    const T = m.topics || [];
    if (T.length < 2) return "";
    const c = {};
    for (const t of T) {
        const a = lcArea(P, t.t);
        c[a] = (c[a] || 0) + 1;
    }
    const E = Object.entries(c);
    if (E.length < 2) return "";
    return `<span class="lcspread" title="${esc(E.map(([a, n]) => `${a}: ${n}`).join(" · "))}">${E.map(([a, n]) => `<i style="flex:${n};background:${pwColor(P, a)}"></i>`).join("")}</span>`;
}
// ── graduation: core modules, how many options, how many credits ──
function lcGradHTML(P) {
    const mods = P.modules || [];
    if (!mods.length) return "";
    const R = P.req || {},
        core = mods.filter(m => m.core !== false),
        opt = mods.filter(m => m.core === false),
        cr = m => +m.credits || 0;
    const coreDone = core.filter(m => m.status === "done").length,
        optDone = opt.filter(m => m.status === "done").length,
        optTaking = opt.filter(m => ["taking", "done"].includes(m.status)).length;
    const crDone = mods.filter(m => m.status === "done").reduce((a, m) => a + cr(m), 0);
    const need = +R.options || 0,
        credits = +R.credits || 0;
    const ok = coreDone === core.length && (!need || optDone >= need) && (!credits || crDone >= credits);
    return `<section class="panel lcgrad"><h3 class="pwh">To graduate${ok ? ` <span class="pill active">all done</span>` : ""}</h3>
    <div class="lcreq"><div><b>${coreDone}/${core.length}</b><span>core modules</span></div>
      <div><b>${optDone}${need ? "/" + need : ""}</b><span>options${need ? " needed" : ""}${optTaking > optDone ? ` · ${optTaking - optDone} under way` : ""}</span></div>
      <div><b>${crDone}${credits ? "/" + credits : ""}</b><span>credits</span></div></div>
    <div class="bar"><label class="ctl">Options needed <input class="inp" type="number" min="0" data-lcreq="options" value="${esc(R.options || "")}" style="width:70px" aria-label="Options needed"></label>
      <label class="ctl">Credits needed <input class="inp" type="number" min="0" data-lcreq="credits" value="${esc(R.credits || "")}" style="width:80px" aria-label="Credits needed"></label>
      <span class="hint">From the programme's regulations: how many optional modules count, and the credits for the degree.</span></div></section>`;
}
// ── the best places to learn it: at most seven, of three kinds, each with a link to check ──
const SRC_KINDS = [
    ["uni", "University"],
    ["cert", "Certification"],
    ["indie", "Independent"],
];
const SRC_MAX = 7;
function lcSourcesHTML(S) {
    const L = S.sources || [],
        q = encodeURIComponent(S.name);
    const look = [
        ["Best universities for " + S.name, `https://www.google.com/search?q=${q}+best+university+programme+syllabus`],
        ["Recognised certifications", `https://www.google.com/search?q=${q}+professional+certification+accredited`],
        ["Learning it on your own", `https://www.google.com/search?q=best+way+to+self+study+${q}+curriculum`],
    ];
    return `<section class="panel lcsrc"><h3 class="pwh">Best places to learn it <span class="hint">${L.length}/${SRC_MAX}</span></h3>
    ${L.length ? `<div class="lcsrcs">${L.map(x => `<div class="lcsr"><span class="pill">${esc((SRC_KINDS.find(k => k[0] === x.kind) || SRC_KINDS[2])[1])}</span><b>${esc(x.name)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ""}${x.url ? `<a class="link" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">Check ↗</a>` : `<span class="hint">no link yet</span>`}<button class="linkbtn" data-act="lc-src-del" data-k="${esc(x.id)}" aria-label="Remove ${esc(x.name)}">✕</button></div>`).join("")}</div>` : `<p class="hint">The few places that teach ${esc(S.name.toLowerCase())} best: universities, certifications that count, and independent courses or books. Seven at most, so each one earns its place.</p>`}
    ${L.length < SRC_MAX ? `<div class="bar lcsrcadd">${selOf("lc-src-kind", SRC_KINDS, "uni", 'aria-label="Kind"')}<input class="inp" id="lc-src-name" placeholder="Name (e.g. Cambridge, Part III)" aria-label="Name"><input class="inp" id="lc-src-url" placeholder="https://… (to check it)" aria-label="Link"><input class="inp" id="lc-src-note" placeholder="Why it's here" aria-label="Why"><button class="btn sm" data-act="lc-src-add" data-k="${esc(S.id)}">Add</button></div>` : ""}
    <p class="hint">Look it up: ${look.map(([l, u]) => `<a class="link" href="${u}" target="_blank" rel="noopener noreferrer">${esc(l)} ↗</a>`).join(" · ")}</p></section>`;
}
// ── crème de la crème: the books you'd keep if you kept only a few (★ on any reading) ──
function lcCremeHTML(S) {
    const P = subjPaths(S),
        B = P.flatMap(p => p.books.filter(b => b.top).map(b => [p, b])),
        cu = (ACS().curricula || {})[S.id];
    const picks = cu
        ? cu.topics
              .map(t => cu.chosen[t.id])
              .filter(Boolean)
              .map(k => (cu.books || {})[k])
              .filter(Boolean)
        : [];
    if (!B.length && !picks.length)
        return `<section class="panel"><h3 class="pwh">Crème de la crème</h3><p class="hint">Star the best books in this course (open a book, then ★ Crème de la crème): the ones you'd keep if you could keep only a few. They gather here.</p></section>`;
    return `<section class="panel lccreme"><h3 class="pwh">Crème de la crème <span class="hint">${B.length}</span></h3>
    ${B.length ? `<div class="pwlist">${B.map(([p, b]) => pwCard(p, b, { thread: true })).join("")}</div>` : ""}
    ${
        picks.length
            ? `<p class="hint">Your picks in Curricula (best for self-study, topic by topic): ${picks
                  .slice(0, 12)
                  .map(([t, a]) => `<b>${esc(t)}</b>${a ? " " + esc(a) : ""}`)
                  .join(" · ")}${picks.length > 12 ? ` and ${picks.length - 12} more` : ""}</p>`
            : ""
    }</section>`;
}
// ── opportunities: competitions, schools, internships, grants; yours, never shared ──
function lcOppsHTML(S) {
    const O = (S.opps || [])
        .slice()
        .sort((a, b) => !!a.done - !!b.done || String(a.when || "9").localeCompare(String(b.when || "9")));
    return `<section class="panel lcopps"><h3 class="pwh">Opportunities <span class="hint">yours only: never in shared exports</span></h3>
    ${O.length ? `<div class="pwgoals">${O.map(o => `<label class="pwgoal${o.done ? " on" : ""}"><input type="checkbox" data-lcopp="${esc(o.id)}" ${o.done ? "checked" : ""}><span>${esc(o.t)}${o.note ? ` <small class="hint">${esc(o.note)}</small>` : ""}</span>${o.when ? `<small>${esc(fmtDate(o.when))}</small>` : ""}${o.url ? `<a class="link" href="${esc(safeUrl(o.url))}" target="_blank" rel="noopener noreferrer">↗</a>` : ""}<button class="linkbtn" data-act="lc-opp-del" data-k="${esc(o.id)}" aria-label="Remove">✕</button></label>`).join("")}</div>` : `<p class="hint">Competitions, summer schools, internships, grants: what you could apply for, and by when.</p>`}
    <div class="bar"><input class="inp" id="lc-opp-t" placeholder="Add one (e.g. Putnam, a research internship)" style="flex:2;min-width:180px" aria-label="Opportunity"><input class="inp" type="date" id="lc-opp-d" style="width:150px" aria-label="Deadline"><input class="inp" id="lc-opp-u" placeholder="Link" style="flex:1;min-width:120px" aria-label="Link"><button class="btn sm" data-act="lc-opp-add" data-k="${esc(S.id)}">Add</button></div></section>`;
}
// ── the levels, as a ladder: which of your fields sit where ──
function lcLadderHTML(S) {
    const F = S.order || Object.keys(S.fields || {});
    if (!F.length) return "";
    const at = i => F.filter(f => (((S.fields || {})[f] || {}).lvl || 0) === i);
    return `<div class="lcladder">${LEVELS.map(
        ([n, d], i) =>
            `<div class="lcrung${S.goal === i ? " goal" : ""}"><span class="ln"><b>${esc(n)}</b><small>${esc(d)}</small></span><span class="lfs">${
                at(i)
                    .map(f => `<span class="chip">${esc(f)}</span>`)
                    .join("") || `<span class="hint">–</span>`
            }</span></div>`
    )
        .reverse()
        .join("")}</div>`;
}
function lcHubExtrasHTML(S) {
    const M = lcMastery(S);
    return `<section class="panel lcmastery"><h3 class="pwh">Mastery <span class="hint">by what you've finished</span></h3>
      <div class="lcmrow"><div class="ring" style="--p:${M.pct}"><b>${M.pct}%</b><small>${M.level ? esc(LEVELS[M.level][0]) : "not started"}</small></div>
        <div class="lcmk"><p>${M.tn ? `<b>${M.td}/${M.tn}</b> topics covered` : "No topics yet"} · ${M.bn ? `<b>${M.bd}/${M.bn}</b> core books read` : "no core books yet"}</p>
          <p class="hint">Your own rating of each field is above; this is what the finished work says.${S.goal ? ` You're aiming for ${esc(LEVELS[S.goal][0].toLowerCase())}.` : ""}</p>
          <details><summary class="hint">Levels overview</summary>${lcLadderHTML(S) || `<p class="hint">Add fields to place them on the ladder.</p>`}</details></div></div></section>
        ${lcCremeHTML(S)}${lcSourcesHTML(S)}${lcOppsHTML(S)}`;
}
function lcHubClick(act, t, k) {
    const S = k && lcSub(k),
        P = pwCur();
    switch (act) {
        case "lc-src-add":
            if (S) {
                const name = ($("#lc-src-name") || {}).value.trim(),
                    url = ($("#lc-src-url") || {}).value.trim(),
                    note = ($("#lc-src-note") || {}).value.trim(),
                    kind = ($("#lc-src-kind") || {}).value || "uni";
                if (!name) {
                    toast("Name it first.");
                    return true;
                }
                if (url && !/^https:\/\//i.test(url)) {
                    toast("Links need to start with https://");
                    return true;
                }
                if ((S.sources || []).length >= SRC_MAX) {
                    toast(`Seven at most: take one out first.`);
                    return true;
                }
                S.sources = [...(S.sources || []), { id: acId(), kind, name, url, note }];
                markDirty();
                renderMain();
            }
            return true;
        case "lc-src-del": {
            const s = LSUBS().find(x => (x.sources || []).some(y => y.id === k));
            if (s) {
                s.sources = s.sources.filter(y => y.id !== k);
                markDirty();
                renderMain();
            }
            return true;
        }
        case "lc-opp-add":
            if (S) {
                const tt = ($("#lc-opp-t") || {}).value.trim(),
                    d = ($("#lc-opp-d") || {}).value,
                    u = ($("#lc-opp-u") || {}).value.trim();
                if (!tt) {
                    toast("Write it first.");
                    return true;
                }
                if (u && !/^https:\/\//i.test(u)) {
                    toast("Links need to start with https://");
                    return true;
                }
                S.opps = [...(S.opps || []), { id: acId(), t: tt, when: d || "", url: u, done: false }];
                markDirty();
                renderMain();
            }
            return true;
        case "lc-opp-del": {
            const s = LSUBS().find(x => (x.opps || []).some(y => y.id === k));
            if (s) {
                s.opps = s.opps.filter(y => y.id !== k);
                markDirty();
                renderMain();
            }
            return true;
        }
        case "lc-stage-spec":
            if (P) {
                const s = (P.stages || []).find(x => x.id === k);
                if (s) {
                    s.spec = !s.spec || undefined;
                    markDirty();
                    renderMain();
                }
            }
            return true;
    }
    return false;
}
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.lcopp) {
        const s = LSUBS().find(x => (x.opps || []).some(y => y.id === t.dataset.lcopp));
        if (s) {
            s.opps.find(y => y.id === t.dataset.lcopp).done = t.checked;
            markDirty();
            renderMain();
        }
    }
    if (t.dataset.lcreq) {
        const P = pwCur();
        if (P) {
            P.req = { ...(P.req || {}), [t.dataset.lcreq]: t.value === "" ? undefined : Math.max(0, +t.value) };
            markDirty();
            renderMain();
        }
    }
    if (t.dataset.lcmafter) {
        const P = pwCur(),
            m = P && (P.modules || []).find(x => x.id === t.dataset.lcmafter);
        if (m) {
            const id = t.dataset.k;
            m.after = t.checked ? [...new Set([...(m.after || []), id])] : (m.after || []).filter(x => x !== id);
            if (!m.after.length) delete m.after;
            markDirty();
            renderMain();
        }
    }
});
// Opportunities are personal: they never go into a pack of chosen parts (packs.js), only your own whole backup
// ("Download everything", the library folder: export-zip.js) and your synced library
const lcStripPersonal = C => ({
    ...C,
    subjects: (C.subjects || []).map(s => {
        const { opps, ...rest } = s;
        return rest;
    }),
});
