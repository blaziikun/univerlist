// src/features/learning-centre/learning-curricula.js
// ─────────────────────────────────────────────────────────────────
//  The Learning Centre: Curricula, what different programmes teach in one course, side by side
//
//  Per course: topics (the common currency, grouped by area), the programmes you compare (each module teaches some
//  topics and sets some books), and your picks. The merged view shows every topic once, which programmes teach it (★
//  compulsory, ● offered) and every book they set for it, most-set first: click one to make it your book for that
//  topic. Nothing is built in: you add programmes by pasting their module list or fetching it from the university's
//  page (or bring them in with an import).
// ─────────────────────────────────────────────────────────────────

const CUR = () => ACS().curricula;
const curS = sid => {
    const c = CUR();
    return (c[sid] = c[sid] || { topics: [], books: {}, progs: [], chosen: {}, extra: {}, hide: [] });
};
function uniData(sid) {
    const S = curS(sid),
        books = { ...S.books };
    for (const p of S.progs)
        for (const m of p.modules) for (const b of m.books || []) if (Array.isArray(b)) books[b[0]] = [b[1], b[2]];
    for (const L of Object.values(S.extra || {})) for (const [k, t, a] of L) books[k] = [t, a];
    return { S, progs: S.progs, books };
}
const bookKey = (t, a) => "u" + slug(t + " " + (a || "")).slice(0, 40);
const curSid = () => {
    const L = LSUBS(),
        c = CUR();
    return (L.find(s => s.id === ui.uniSub) || L.find(s => (c[s.id] || {}).progs && c[s.id].progs.length) || L[0] || {})
        .id;
};
function curriculaHTML() {
    const L = LSUBS().filter(s => !s.hidden || s.id === ui.uniSub),
        sid = curSid();
    if (!sid)
        return `<div class="empty"><p>Add a course first.</p><p class="hint">Curricula compares what different programmes teach in one course, topic by topic.</p><button class="btn gold" data-act="tab" data-k="learn">Go to Courses</button></div>`;
    const { S, progs, books } = uniData(sid),
        view = ui.uniView || "merged",
        course = lcSub(sid);
    const shown = progs.filter(p => !S.hide.includes(p.id)),
        ab = p => {
            const c = String(p.uni || p.name)
                    .replace(/[^A-Za-z]/g, "")
                    .slice(0, 3)
                    .toUpperCase(),
                same = progs.filter(x => x.uni === p.uni);
            return c + (same.length > 1 ? same.indexOf(p) + 1 : "");
        };
    const top = `<div class="unihead"><div class="chips">${L.map(s => `<button class="chip" data-act="uni-sub" data-k="${esc(s.id)}" aria-pressed="${s.id === sid}">${esc(s.name)}${(CUR()[s.id] || {}).progs && CUR()[s.id].progs.length ? ` <small>${CUR()[s.id].progs.length}</small>` : ""}</button>`).join("")}</div><span class="spacer"></span>
      ${
          progs.length
              ? `<div class="seg">${[
                    ["merged", "Merged"],
                    ["side", "Side by side"],
                ]
                    .map(
                        ([k, l]) =>
                            `<button data-act="uni-view" data-k="${k}" aria-pressed="${view === k}">${l}</button>`
                    )
                    .join("")}</div>`
              : ""
      }
      <button class="btn sm" data-act="uni-paste">+ Paste a programme</button><button class="btn sm gold" data-act="uni-fetch" data-k="${esc(sid)}">Fetch a programme…</button></div>
    ${progs.length ? `<div class="uniprogs">${progs.map(p => `<label class="uniprog ${esc(p.kind || "")}${S.hide.includes(p.id) ? " off" : ""}"><input type="checkbox" data-unihide="${esc(p.id)}" ${S.hide.includes(p.id) ? "" : "checked"}><span class="ua">${esc(ab(p))}</span><span title="${esc(p.why || "")}"><b>${esc(p.uni || "")}</b> ${esc(p.name)}<small>${p.kind === "specialist" ? "Specialist · " : ""}${esc(p.why || "")}</small></span><button class="linkbtn" data-act="uni-del" data-k="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">remove</button></label>`).join("")}</div>` : ""}
    ${ui.uniPaste ? uniPasteHTML() : ""}${ui.uniTopics || !S.topics.length || !progs.length ? uniTopicsHTML(S) : `<p class="hint"><button class="linkbtn" data-act="uni-topics">Edit topics (${S.topics.length})</button></p>`}`;
    if (!progs.length)
        return `<div class="curr">${top}<div class="empty"><p>Nothing compared in ${esc(course ? course.name : "this course")} yet.</p><p class="hint">Add the topics you care about (or let the first programme you add create them), then add programmes: paste a module list, or fetch it from a university's page. Each module is matched to topics by name, and books set for it come with it.</p></div></div>`;
    if (view === "side")
        return `<div class="curr">${top}<div class="uniside">${shown
            .map(
                p =>
                    `<section class="panel"><h3>${esc(p.uni || "")} <small class="hint">${esc(p.name)}</small></h3>${p.modules
                        .map(
                            m =>
                                `<div class="unimod"><b>${m.core ? "★ " : ""}${esc(m.name)}</b><small>${(m.books || [])
                                    .map(k => {
                                        const bk = books[Array.isArray(k) ? k[0] : k];
                                        return bk ? esc(bk[0]) : "";
                                    })
                                    .filter(Boolean)
                                    .join(" · ")}</small></div>`
                        )
                        .join("")}</section>`
            )
            .join("")}</div></div>`;
    const areas = [...new Set(S.topics.map(t => t.area || "Topics"))];
    const row = t => {
        const where = shown.map(p => [p, p.modules.filter(m => (m.topics || []).includes(t.id))]),
            cands = new Map();
        for (const [p, M] of where)
            for (const m of M)
                for (const k of m.books || []) {
                    const key = Array.isArray(k) ? k[0] : k;
                    const e = cands.get(key) || { n: 0, mods: [] };
                    e.n++;
                    e.mods.push(`${p.uni}: ${m.name}`);
                    cands.set(key, e);
                }
        for (const [k] of S.extra[t.id] || []) if (!cands.has(k)) cands.set(k, { n: 0, mods: ["Added by you"] });
        const ch = S.chosen[t.id] || null,
            most = [...cands.entries()].sort((a, b) => b[1].n - a[1].n)[0],
            mostK = most && most[1].n > 1 ? most[0] : null,
            taught = where.filter(([, M]) => M.length).length;
        return `<tr class="${taught ? "" : "untaught"}"><td class="ut"><b>${esc(t.name)}</b><small>${taught} of ${shown.length}</small></td>${where.map(([p, M]) => `<td class="uc${M.length ? " on" : ""}${M.some(m => m.core) ? " core" : ""}" title="${esc(M.map(m => m.name).join(", ") || "Not taught")}">${M.length ? (M.some(m => m.core) ? "★" : "●") : ""}</td>`).join("")}
      <td class="ub">${[...cands.entries()]
          .sort((a, b) => b[1].n - a[1].n)
          .map(([k, e]) => {
              const bk = books[k];
              if (!bk) return "";
              const inLib = findExisting(bk[0], bk[1], "book");
              return `<button class="ubk${k === ch ? " on" : ""}${k === mostK ? " most" : ""}" data-act="uni-pick" data-k="${esc(t.id)}" data-b="${esc(k)}" title="${esc(e.mods.join(" · "))}"><b>${esc(bk[0])}</b> <small>${esc(bk[1])}</small>${e.n > 1 ? `<i>×${e.n}</i>` : ""}${inLib ? `<i class="own">in library</i>` : ""}</button>`;
          })
          .join("")}
        <input class="inp ubadd" placeholder="+ book (Title — Author)" data-uniadd="${esc(t.id)}"></td></tr>`;
    };
    const picked = S.topics.map(t => S.chosen[t.id]).filter(Boolean);
    return `<div class="curr">${top}
    <p class="hint">★ compulsory · ● offered. Each book shows how many programmes set it (×2…); hover for which modules. The most set isn't always the best to learn from alone: click the one that is, and it becomes your book for that topic (best for self-study).</p>
    <div class="unitable"><table><thead><tr><th>Topic</th>${shown.map(p => `<th title="${esc((p.uni || "") + " · " + p.name)}">${esc(ab(p))}</th>`).join("")}<th>Books they set · your pick for self-study</th></tr></thead>
      <tbody>${areas
          .map(
              a =>
                  `<tr class="uarea"><td colspan="${shown.length + 2}">${esc(a)}</td></tr>${S.topics
                      .filter(t => (t.area || "Topics") === a)
                      .map(row)
                      .join("")}`
          )
          .join("")}</tbody></table></div>
    <div class="bar" style="margin-top:12px"><button class="btn sm" data-act="uni-tolib" ${picked.length ? "" : "disabled"}>Add my ${picked.length} chosen books to the library</button><button class="btn sm gold" data-act="uni-topath" ${picked.length ? "" : "disabled"}>Add my picks to the course</button><span class="hint">Picking changes only your choice; what each programme sets stays as it is.</span></div></div>`;
}
function uniTopicsHTML(S) {
    return `<section class="panel unitopics"><h3>Topics <span class="hint">grouped by area · modules are matched to them by name</span>${S.topics.length ? `<button class="linkbtn" data-act="uni-topics" style="margin-left:auto">Done</button>` : ""}</h3>
    <div class="unitop">${S.topics.map(t => `<span class="topic"><input class="inp" data-unitopic="${esc(t.id)}" data-f="area" value="${esc(t.area || "")}" placeholder="Area" aria-label="Area" style="width:120px"><input class="inp" data-unitopic="${esc(t.id)}" data-f="name" value="${esc(t.name)}" aria-label="Topic" style="width:220px"><button class="linkbtn" data-act="uni-topic-del" data-k="${esc(t.id)}" aria-label="Remove">✕</button></span>`).join("")}</div>
    <div class="bar"><input class="inp" placeholder="+ topic: Area — Topic, e.g. Analysis — Real analysis (press Enter)" data-unitopicadd="1" style="flex:1;max-width:520px"></div></section>`;
}
function uniPasteHTML() {
    return `<section class="panel unipaste"><h3>Paste a programme</h3><p class="hint">Copy its module list from the university's page. One module per line; put books after a dash, separated by semicolons: <code>Algebraic Topology — Hatcher, Algebraic Topology; Bott &amp; Tu</code>. A ★ at the start marks it compulsory. Each module is matched to topics by name (and becomes a topic itself if nothing matches).</p>
    <div class="bar"><input class="inp" id="up-uni" placeholder="University" style="max-width:200px"><input class="inp" id="up-name" placeholder="Programme" style="max-width:260px"><input class="inp" id="up-why" placeholder="Why this one (optional)" style="flex:1"><label class="ctl"><input type="checkbox" id="up-spec"> Specialist</label></div>
    <textarea class="inp" id="up-text" rows="8" placeholder="★ Module — Book; Book"></textarea><div class="bar"><button class="btn sm gold" data-act="uni-save">Add</button><button class="btn sm ghost" data-act="uni-paste">Cancel</button></div></section>`;
}
// a module goes to every topic whose name shares a meaningful word with it; with none, it becomes a topic of its own
function uniMatchTopics(sid, name) {
    const S = curS(sid),
        W = norm(name)
            .split(" ")
            .filter(
                w =>
                    w.length > 3 &&
                    !["introduction", "advanced", "theory", "methods", "topics", "systems", "further", "part"].includes(
                        w
                    )
            );
    const sc = S.topics.map(t => [
            t.id,
            W.filter(w =>
                norm(t.name)
                    .split(" ")
                    .some(x => x === w || (w.length > 5 && x.startsWith(w.slice(0, 6))))
            ).length,
        ]),
        top = Math.max(0, ...sc.map(x => x[1]));
    if (top) return sc.filter(x => x[1] === top).map(x => x[0]);
    const id = "t" + acId();
    S.topics.push({
        id,
        name:
            String(name)
                .replace(/^[A-Z]{2,6}[ -]?\d{2,6}[A-Z]?\s*/, "")
                .trim() || name,
        area: "Topics",
    });
    return [id];
}
// a programme from fetched (or pasted) modules: { name, code, core, books: [[t, a]] }
function uniAddProgramme(sid, { uni, name, why, kind, url, modules }) {
    const S = curS(sid),
        known = (bt, ba) =>
            Object.entries(uniData(sid).books).find(
                ([, v]) =>
                    idTitle(v[0]) === idTitle(bt) ||
                    (idTitle(v[0]).startsWith(idTitle(bt) + " ") &&
                        (!ba || norm(v[1]).includes(norm(ba).split(" ").pop())))
            );
    const mods = modules.map(m => ({
        name: [m.code, m.name].filter(Boolean).join(" "),
        core: !!m.core,
        topics: uniMatchTopics(sid, m.name),
        books: (m.books || []).map(([bt, ba]) => {
            const k = known(bt, ba);
            if (k) return k[0];
            const key = bookKey(bt, ba);
            S.books[key] = [bt, ba || ""];
            return key;
        }),
    }));
    S.progs.push({
        id: "p" + acId(),
        uni: uni || "",
        name: name || "Programme",
        kind: kind || "mine",
        why: why || "",
        url: url || "",
        modules: mods,
    });
    markDirty();
    return mods.length;
}
function uniClick(act, t, k) {
    const sid = curSid(),
        S = sid && curS(sid);
    switch (act) {
        case "uni-sub":
            ui.uniSub = k;
            renderMain();
            return true;
        case "uni-jump":
            ui.uniSub = k;
            goTab("curricula");
            scrollTo(0, 0);
            return true;
        case "uni-view":
            ui.uniView = k;
            renderMain();
            return true;
        case "uni-paste":
            ui.uniPaste = !ui.uniPaste;
            renderMain();
            return true;
        case "uni-topics":
            ui.uniTopics = !ui.uniTopics;
            renderMain();
            return true;
        case "uni-topic-del":
            if (S) {
                S.topics = S.topics.filter(x => x.id !== k);
                for (const p of S.progs) for (const m of p.modules) m.topics = (m.topics || []).filter(x => x !== k);
                delete S.chosen[k];
                markDirty();
                renderMain();
            }
            return true;
        case "uni-fetch":
            openModal("lcimport", { cur: k, want: "modules", step: "link", url: "" });
            return true;
        case "uni-pick":
            if (S) {
                S.chosen[k] = t.dataset.b;
                markDirty();
                renderMain();
            }
            return true;
        case "uni-del":
            if (S) {
                const before = clone(S.progs);
                S.progs = S.progs.filter(p => p.id !== k);
                markDirty();
                renderMain();
                toast("Removed", {
                    label: "Undo",
                    fn: () => {
                        S.progs = before;
                        markDirty();
                        renderMain();
                    },
                });
            }
            return true;
        case "uni-save": {
            if (!S) return true;
            const uni = ($("#up-uni") || {}).value.trim(),
                name = ($("#up-name") || {}).value.trim(),
                text = ($("#up-text") || {}).value;
            if (!uni || !text.trim()) {
                toast("Add the university and at least one module.");
                return true;
            }
            const modules = text
                .split("\n")
                .map(l => l.trim())
                .filter(Boolean)
                .map(l => {
                    const core = /^★/.test(l);
                    l = l.replace(/^★\s*/, "");
                    const [m, b = ""] = l.split(/\s+[—–-]\s+/);
                    return {
                        name: m,
                        core,
                        books: b
                            .split(";")
                            .map(x => x.trim())
                            .filter(Boolean)
                            .map(x =>
                                x.includes(",") && x.indexOf(",") < x.length / 2
                                    ? [x.slice(x.indexOf(",") + 1).trim(), x.slice(0, x.indexOf(","))]
                                    : [x, ""]
                            ),
                    };
                });
            const n = uniAddProgramme(sid, {
                uni,
                name,
                why: ($("#up-why") || {}).value.trim(),
                kind: ($("#up-spec") || {}).checked ? "specialist" : "mine",
                modules,
            });
            ui.uniPaste = false;
            renderMain();
            toast(`Added ${uni}: ${plural(n, "module")}`);
            return true;
        }
        case "uni-tolib": {
            if (!S) return true;
            const { books } = uniData(sid),
                course = lcSub(sid);
            let n = 0;
            for (const tp of S.topics) {
                const kk = S.chosen[tp.id],
                    bk = kk && books[kk];
                if (!bk || findExisting(bk[0], bk[1], "book")) continue;
                addItem(
                    {
                        medium: "book",
                        kind: "Academic",
                        title: bk[0],
                        creator: bk[1],
                        subject: course ? course.name : "",
                        status: "want",
                        copy: "none",
                    },
                    "Add " + bk[0]
                );
                n++;
            }
            toast(n ? `Added ${plural(n, "book")} to the Learning Centre` : "They're all in your library already");
            renderMain();
            return true;
        }
        // your picks join the course's reading order: one thread per area, in the order the topics are listed; each book waits
        // for the one before it in its area to be underway. Books already in the course stay as they are.
        case "uni-topath": {
            if (!S) return true;
            const { books } = uniData(sid),
                course = lcSub(sid),
                areas = [...new Set(S.topics.map(t => t.area || "Topics"))];
            if (!course) return true;
            const P = coursePath(course),
                before = P.books.length;
            if (!before) P.view = "map";
            P.threads = [...new Set([...(P.threads || []), ...areas])];
            for (const a of areas) {
                let prev = null;
                for (const tp of S.topics.filter(x => (x.area || "Topics") === a)) {
                    const kk = S.chosen[tp.id],
                        bk = kk && books[kk];
                    if (!bk) continue;
                    // already in the course (picked before, or on a reading list under another id): that one is used
                    const had = P.books.find(b => b.id === kk || norm(b.t) === norm(bk[0]));
                    if (had) {
                        prev = had.id;
                        continue;
                    }
                    P.books.push({
                        id: kk,
                        t: bk[0],
                        a: bk[1],
                        th: a,
                        st: "todo",
                        note: "",
                        where: tp.name,
                        after: prev ? [{ k: prev, s: "start" }] : [],
                    });
                    prev = kk;
                }
            }
            markDirty();
            ui.pwId = P.id;
            ui.learnSub = P.sub;
            goTab("learn");
            const added = P.books.length - before;
            toast(
                added
                    ? `Added ${plural(added, "pick")} to ${course.name}`
                    : `Your picks are all in ${course.name} already`
            );
            return true;
        }
    }
    return false;
}
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset) return;
    const sid = curSid();
    if (!sid) return;
    const S = curS(sid);
    if (t.dataset.unihide) {
        const id = t.dataset.unihide;
        S.hide = t.checked ? S.hide.filter(x => x !== id) : [...new Set([...S.hide, id])];
        markDirty();
        renderMain();
    }
    if (t.dataset.unitopic) {
        const x = S.topics.find(y => y.id === t.dataset.unitopic);
        if (x && (t.value.trim() || t.dataset.f === "area")) {
            x[t.dataset.f] = t.value.trim();
            markDirty();
        }
    }
    if (t.dataset.uniadd) {
        const v = t.value.trim();
        if (!v) return;
        const [bt, ba = ""] = v.split(/\s+[—–-]\s+/),
            k = bookKey(bt, ba);
        S.extra[t.dataset.uniadd] = [...(S.extra[t.dataset.uniadd] || []), [k, bt, ba]];
        S.chosen[t.dataset.uniadd] = k;
        markDirty();
        renderMain();
    }
});
document.addEventListener(
    "keydown",
    e => {
        const t = e.target;
        if (!t || !t.dataset || !t.dataset.unitopicadd || e.key !== "Enter") return;
        e.preventDefault();
        const sid = curSid(),
            v = t.value.trim();
        if (!sid || !v) return;
        const [a, n] = v.includes("—") || / - /.test(v) ? v.split(/\s+[—–-]\s+/) : ["Topics", v];
        curS(sid).topics.push({ id: "t" + acId(), name: (n || a).trim(), area: n ? a.trim() : "Topics" });
        markDirty();
        renderMain();
        keepFocus("[data-unitopicadd]");
    },
    true
);
function curriculaMini() {
    const rows = LSUBS()
        .map(s => [s, CUR()[s.id]])
        .filter(([, c]) => c && c.topics.length);
    if (!rows.length)
        return `<p class="hint">No comparison yet. <button class="linkbtn" data-act="tab" data-k="curricula">Open Curricula</button></p>`;
    return `<div class="lminis">${rows
        .map(([s, c]) => {
            const n = c.topics.filter(t => c.chosen[t.id]).length;
            return `<button class="lmini" data-act="uni-jump" data-k="${esc(s.id)}"><span>${esc(s.name)}</span><span class="lbar"><i style="width:${(n / c.topics.length) * 100}%"></i></span><small>${n}/${c.topics.length} picked</small></button>`;
        })
        .join("")}</div>`;
}
BLOCKS.courses = {
    name: "Curricula",
    d: "The books you picked from the programmes you compare",
    w: 8,
    html: c => curriculaMini(),
};
// imports: two curricula of the same course meet (programmes, topics and books join; your picks win)
function lcMergeCurricula(cur, inc) {
    const out = { ...cur };
    for (const [sid, c] of Object.entries(inc || {})) {
        const m = out[sid];
        if (!m) {
            out[sid] = c;
            continue;
        }
        const by = (a, b) => [...a, ...(b || []).filter(x => !a.some(y => y.id === x.id))];
        out[sid] = {
            topics: by(m.topics, c.topics),
            books: { ...(c.books || {}), ...m.books },
            progs: by(m.progs, c.progs),
            chosen: { ...(c.chosen || {}), ...m.chosen },
            extra: { ...(c.extra || {}), ...m.extra },
            hide: [...new Set([...(m.hide || []), ...(c.hide || [])])],
        };
    }
    return out;
}
