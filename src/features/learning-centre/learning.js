// src/features/learning-centre/learning.js
// ─────────────────────────────────────────────────────────────────
//  The Learning Centre: an official extension (Settings › Extensions › Built in) with a space of its own
//
//  It starts empty. Everything in it is yours: subjects (with your level in each field, if you like) and paths. A path
//  is one way through a subject, from the university you choose for it (a different one per path if you like):
//    stages (years, terms…) → modules (code, name, credits, core or option) → readings, in reading order
//  Each reading can wait for others ("once Spivak is underway", "once Rudin is done"), so the path knows what you can
//  start now, what's waiting and what finishing a book unlocks. A reading's progress comes from your library when it's
//  there. Module lists and reading lists can be fetched from a university's own pages (learning-import below), checked,
//  then saved.
// ─────────────────────────────────────────────────────────────────

const PW_COLORS = [
    "#d4ad55",
    "#7aa7f0",
    "#6fcf97",
    "#e0896a",
    "#b394ee",
    "#4fc3b3",
    "#e58ac0",
    "#c9c26a",
    "#9fb3c8",
    "#ef7f7f",
];
const PW_ST = [
    ["todo", "To read"],
    ["reading", "Reading"],
    ["done", "Done"],
    ["skip", "Skipping"],
];
const PW_RANK = { todo: 0, skip: 0, reading: 1, done: 2 };
const LEVELS = [
    ["Not started", "–"],
    ["Foundations", "School and first-year level"],
    ["Undergraduate", "Finals of a strong bachelor's"],
    ["Master's", "A taught master's"],
    ["PhD", "Qualifying exams"],
    ["Research", "Original work"],
];
const acId = () => "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const ACS = () => {
    if (!meta.courses || meta.courses.v !== 2) meta.courses = lcConvertOld(meta.courses);
    meta.courses.curricula = meta.courses.curricula || {};
    lcOnePerCourse(meta.courses);
    return meta.courses;
}; // older data is converted, never dropped
const PWS = () => ACS().paths;
const LSUBS = () => ACS().subjects;
const lcSub = id => LSUBS().find(s => s.id === id);
const pwCur = () => PWS().find(p => p.id === ui.pwId) || null;
const pwBook = (P, k) => P.books.find(b => b.id === k);
const lcMod = (P, id) => (P.modules || []).find(m => m.id === id);
const lcLane = (P, b) => b.th || (lcMod(P, b.mod) || {}).name || "Readings";
// ── a course and its pathway are one thing ──
// The course is what you're learning (your level in its fields, the best books, where to learn it); its pathway is what
// you work through (reading order, years and modules, milestones). They're stored apart (meta.courses.subjects and
// .paths, so exports keep their shape), but there is exactly one pathway per course, made when it's first needed.
const coursePath = S => PWS().find(p => p.sub === S.id) || lcNewPath({ name: S.name, sub: S.id });
/** keeps it one pathway per course: older libraries and imports can have several, or some with no course. Nothing is
 * dropped: several become one (see lcAbsorb), and a pathway without a course becomes a course of its own */
function lcOnePerCourse(C) {
    const subs = new Set(C.subjects.map(s => s.id)),
        seen = new Set();
    if (C.paths.every(p => subs.has(p.sub) && !seen.has(p.sub) && seen.add(p.sub))) return; // the usual case: nothing to do
    for (const P of C.paths)
        if (!subs.has(P.sub)) {
            const name = P.name || P.programme || "Untitled";
            const S = { id: acId(), name, g: name.charAt(0).toUpperCase(), fields: {}, order: [], goal: 0 };
            C.subjects.push(S);
            subs.add(S.id);
            P.sub = S.id;
        }
    for (const S of C.subjects) {
        const [P, ...rest] = C.paths.filter(p => p.sub === S.id);
        if (!rest.length) continue;
        for (const Q of rest) lcAbsorb(P, Q);
        C.paths = C.paths.filter(p => !rest.includes(p));
        if (rest.some(Q => Q.id === ui.pwId)) ui.pwId = P.id;
    }
    markDirty();
}
const PW_ST_ORDER = ["todo", "skip", "reading", "done"];
/** pathway Q joins pathway P: its books, years, modules, threads and milestones become P's, and everything else about
 * it (its name, university, programme, link, summary, requirements) is kept in P.merged and shown on the course */
function lcAbsorb(P, Q) {
    const stageOf = {};
    for (const st of Q.stages || []) {
        const same = (P.stages || []).find(x => norm(x.name) === norm(st.name));
        if (same)
            stageOf[st.id] = same.id; // "Year 1" twice is one Year 1
        else P.stages = [...(P.stages || []), st];
    }
    P.modules = [...(P.modules || []), ...(Q.modules || []).map(m => ({ ...m, stage: stageOf[m.stage] || m.stage }))];
    for (const b of Q.books || []) {
        const had = P.books.find(x => x.id === b.id);
        if (!had) P.books.push(b);
        else if (PW_ST_ORDER.indexOf(b.st) > PW_ST_ORDER.indexOf(had.st)) had.st = b.st; // the same book: keep the further along
    }
    P.threads = [...new Set([...(P.threads || []), ...(Q.threads || [])])];
    P.goals = [...(P.goals || []), ...(Q.goals || [])];
    P.method = [P.method, Q.method].filter(x => x && x.trim()).join("\n");
    for (const f of ["uni", "programme", "url", "about"]) if (!P[f] && Q[f]) P[f] = Q[f];
    const { books, stages, modules, threads, goals, method, merged, ...rest } = Q;
    P.merged = [...(P.merged || []), rest, ...(merged || [])];
}
function lcNewPath(o = {}) {
    const P = {
        id: acId(),
        name: o.name || "New path",
        sub: o.sub || "",
        uni: o.uni || "",
        programme: o.programme || "",
        url: o.url || "",
        about: o.about || "",
        method: "",
        goals: [],
        view: "modules",
        threads: [],
        stages: [],
        modules: [],
        books: [],
        at: nowISO(),
    };
    PWS().push(P);
    markDirty();
    return P;
}

// ── from the old Academic (before it was the Learning Centre): its programmes, pathways and levels, as subjects and paths ──
// Subjects keep their old ids ("s-maths"), so the personal content file and your own converted data meet without duplicates.
const LC_OLD_SUBJECTS = {
    maths: ["Mathematics", "∑"],
    aero: ["Aeronautics & space", "✈"],
    astro: ["Astrophysics", "◉"],
    cs: ["Computer science", "⌨"],
    robotics: ["Robotics", "⚙"],
    culinary: ["Culinary arts", "♨"],
    architecture: ["Architecture & interiors", "⌂"],
    fashion: ["Fashion design", "✂"],
    music: ["Music", "♪"],
    philosophy: ["Philosophy", "¶"],
    theology: ["Theology & religion", "✶"],
    psychology: ["Psychology", "◎"],
};
const LC_OLD_BY_NAME = {
    Mathematics: "maths",
    Aerospace: "aero",
    Engineering: "aero",
    Astrophysics: "astro",
    "Computer science": "cs",
    Robotics: "robotics",
    Electronics: "cs",
};
function lcConvertOld(o) {
    if (o && o.v === 2) return o; // already today's kind
    const out = lcEmpty();
    if (!o || typeof o !== "object") return out;
    const subs = new Map(),
        sub = old => {
            if (!old) return "";
            const id = "s-" + old;
            if (!subs.has(id)) {
                const [name, g] = LC_OLD_SUBJECTS[old] || [old, old.charAt(0).toUpperCase()];
                subs.set(id, { id, name, g, fields: {}, order: [], goal: 0 });
            }
            return id;
        };
    const subOf = p =>
        sub(
            p.sub ||
                LC_OLD_BY_NAME[p.subject] ||
                (Object.entries(LC_OLD_SUBJECTS).find(([, v]) => v[0] === p.subject) || [])[0] ||
                ""
        );
    for (const [k, st] of Object.entries((o.learn || {}).subjects || {})) {
        const F = Object.entries(st.fields || {});
        if (!F.length && !st.goal) continue;
        const S = subs.get(sub(k));
        for (const [f, v] of F) {
            S.fields[f] = { lvl: v.lvl || 0 };
            S.order.push(f);
        }
        S.goal = st.goal || 0;
    }
    for (const p of o.paths || [])
        out.paths.push({
            ...p,
            sub: subOf(p),
            uni: p.uni || "",
            programme: "",
            url: "",
            stages: [],
            modules: [],
            view: ["map", "stages", "threads"].includes(p.view) ? p.view : "map",
            books: (p.books || []).map(b => ({ ...b, opt: b.opt || b.branch || undefined })),
        });
    for (const p of o.programmes || []) {
        const stages = [],
            modules = [],
            books = [];
        (p.years || []).forEach((y, i) => {
            const sid = acId() + i;
            stages.push({ id: sid, name: "Year " + (y.n || i + 1) });
            for (const m of y.modules || []) {
                const mid = m.id || acId();
                modules.push({
                    id: mid,
                    stage: sid,
                    code: m.code || "",
                    name: m.name,
                    credits: m.credits || "",
                    core: m.kind !== "option",
                    status: m.status || "planned",
                    grade: m.grade ?? "",
                    term: m.term || "",
                    topics: (m.topics || []).map(t =>
                        typeof t === "string" ? { t, done: false } : { t: t.t, done: !!t.done }
                    ),
                });
                for (const iid of m.readings || []) {
                    const it = items.get(iid);
                    if (it)
                        books.push({
                            id: "b" + acId(),
                            t: it.title,
                            a: it.creator || "",
                            mod: mid,
                            th: "",
                            st: "todo",
                            note: "",
                            after: [],
                            lib: iid,
                        });
                }
            }
        });
        out.paths.push({
            id: p.id,
            name: p.name,
            sub: subOf(p),
            uni: p.uni || "",
            programme: p.name,
            url: "",
            about: p.basis || "",
            method: "",
            goals: [],
            view: "modules",
            threads: [],
            stages,
            modules,
            books,
            at: nowISO(),
        });
    }
    out.subjects = [...subs.values()];
    // your Curricula picks, books you added and programmes you pasted: they meet the programmes again when your content file comes in
    for (const [k, c] of Object.entries(o.cur || {}))
        out.curricula["s-" + k] = {
            topics: [],
            books: {},
            progs: (c.mine || []).map(p => ({ ...p, kind: "mine" })),
            chosen: { ...(c.chosen || {}) },
            extra: { ...(c.extra || {}) },
            hide: [...(c.hide || [])],
        };
    return out;
}

// ── progress: from your library when the book is there, else from the path ──
let pwLibIdx = null;
function pwLibIndex() {
    if (pwLibIdx && pwLibIdx.n === items.size) return pwLibIdx.m;
    const m = new Map();
    for (const [id, b] of items)
        if (b.medium === "book" && !isSealed(b)) {
            for (const t of [b.title, titleOf(b)]) {
                const k = norm(String(t || "").split(":")[0]);
                if (k) {
                    if (!m.has(k)) m.set(k, []);
                    m.get(k).push(id);
                }
            }
        }
    pwLibIdx = { n: items.size, m };
    return m;
}
const pwSurnames = s =>
    norm(s)
        .split(" ")
        .filter(w => w.length > 2);
function pwLib(b) {
    if (b.lib && items.has(b.lib)) return b.lib;
    const C = pwLibIndex().get(norm(String(b.t).split(":")[0])) || [],
        sn = pwSurnames(b.a || "");
    return (
        C.find(id => {
            const c = items.get(id).creator || "";
            return !c || !sn.length || sn.some(w => norm(c).includes(w));
        }) || null
    );
}
function pwState(b) {
    if (b.st === "skip") return "skip";
    const lid = pwLib(b),
        L = lid ? items.get(lid) : null;
    const ls = !L
        ? "todo"
        : L.status === "done"
          ? "done"
          : ["active", "redo", "paused"].includes(L.status)
            ? "reading"
            : "todo";
    return PW_RANK[ls] > PW_RANK[b.st || "todo"] ? ls : b.st || "todo";
}
const pwPartDone = (b, i) => pwState(b) === "done" || !!((b.parts || [])[i] || {}).done;
function pwMet(P, c) {
    const x = pwBook(P, c.k);
    if (!x) return true;
    const s = pwState(x);
    return c.s === "start" ? s === "reading" || s === "done" : c.s === "part" ? pwPartDone(x, c.p || 0) : s === "done";
}
function pwBucket(P, b) {
    const s = pwState(b);
    if (b.ref) return "ref";
    if (s === "done" || s === "reading" || s === "skip") return s;
    return (b.after || []).every(c => pwMet(P, c)) ? "ready" : "waiting";
}
function pwStages(P) {
    const memo = {},
        seen = new Set();
    const d = k => {
        if (memo[k] != null) return memo[k];
        if (seen.has(k)) return 0;
        seen.add(k);
        const b = pwBook(P, k);
        const v = !b || !(b.after || []).length ? 0 : 1 + Math.max(...b.after.map(c => d(c.k)));
        seen.delete(k);
        return (memo[k] = v);
    };
    for (const b of P.books) d(b.id);
    return memo;
}
const pwShort = b => {
    const sur = (b.a || "").split(",")[0].trim().split(" ").pop();
    return b._dupe || !sur ? b.t : sur;
};
function pwCondText(P, c) {
    const x = pwBook(P, c.k);
    if (!x) return "";
    return `${pwShort(x)} ${c.s === "start" ? "is underway" : c.s === "part" ? `${((x.parts || [])[c.p || 0] || {}).t || "part " + ((c.p || 0) + 1)} is done` : "is done"}`;
}
function pwMark(P) {
    const n = {};
    for (const b of P.books) {
        const s = (b.a || "").split(",")[0].trim().split(" ").pop();
        n[s] = (n[s] || 0) + 1;
    }
    for (const b of P.books) {
        const s = (b.a || "").split(",")[0].trim().split(" ").pop();
        b._dupe = n[s] > 1 ? `${s} (${b.t.length > 28 ? b.t.slice(0, 26) + "…" : b.t})` : "";
    }
}
const pwLabel = b => {
    const sur = (b.a || "").split(",")[0].trim().split(" ").pop();
    return sur ? `${b.t} · ${sur}` : b.t;
};
const pwUnlocks = (P, b) => P.books.filter(x => (x.after || []).some(c => c.k === b.id));
const pwLanes = P => [...new Set([...(P.threads || []), ...P.books.map(b => lcLane(P, b))])];
const pwColor = (P, th) => PW_COLORS[Math.max(0, pwLanes(P).indexOf(th)) % PW_COLORS.length];
const PW_WORD = {
    done: "Done",
    reading: "Reading",
    ready: "Ready",
    waiting: "Waiting",
    ref: "Reference",
    skip: "Skipping",
};
function pathProgress(P) {
    const core = P.books.filter(b => !b.ref && !b.opt);
    return [core.filter(b => pwState(b) === "done").length, core.length];
}

function pwCard(P, b, opts = {}) {
    const bk = pwBucket(P, b),
        lid = pwLib(b),
        L = lid ? items.get(lid) : null,
        wait = (b.after || []).filter(c => !pwMet(P, c)),
        lane = lcLane(P, b);
    const pd = (b.parts || []).filter((x, i) => pwPartDone(b, i)).length;
    return `<button class="pwb ${bk}" data-act="pw-book" data-k="${esc(b.id)}" style="--th:${pwColor(P, lane)}">
    ${L && L.cover ? `<span class="pwc">${coverHTML({ id: lid, ...L })}</span>` : ""}
    <span class="pwt"><b>${esc(b.t)}</b><small>${esc(b.a || "")}${b.year ? " · " + esc(b.year) : ""}</small>
      <span class="pwm"><i class="pws">${PW_WORD[bk]}</i>${b.opt ? `<i>optional</i>` : ""}${b.free ? `<i class="pwfree">free</i>` : ""}${(b.parts || []).length ? `<i>${pd}/${b.parts.length} parts</i>` : ""}${opts.thread ? `<i class="pwth">${esc(lane)}</i>` : ""}</span>
      ${bk === "waiting" && wait.length ? `<span class="pww">After ${esc(wait.map(c => pwCondText(P, c)).join(" and "))}</span>` : ""}</span></button>`;
}

// ── Courses: what you're learning (a degree subject or a field of interest), each with fields you rate (optional) and its pathways ──
// two kinds, always shown apart on the Courses page: what you study (Academic) and what you're into (Interests)
const LC_KINDS = [
    ["sci", "Academic"],
    ["arts", "Interests"],
];
function subjLevel(S) {
    const V = Object.values(S.fields || {})
        .map(f => f.lvl || 0)
        .filter(v => v > 0);
    return V.length ? V.reduce((a, v) => a + v, 0) / V.length : 0;
}
const subjPaths = S => PWS().filter(p => p.sub === S.id);
// a course on the Courses page: the pathway card look, with its level, progress, programme and what you're reading
function lcCourseCard(S) {
    const P = PWS().find(p => p.sub === S.id),
        lv = subjLevel(S),
        [d, n] = P ? pathProgress(P) : [0, 0],
        tp = P ? lcTopics(P) : { n: 0, done: 0 },
        rd = P ? P.books.filter(b => pwState(b) === "reading") : [],
        mods = (P && P.modules) || [],
        cu = (ACS().curricula || {})[S.id];
    const level = lv ? LEVELS[Math.round(lv)][0] : "";
    return `<button class="lcpath" data-act="learn-open" data-k="${esc(S.id)}"><span class="lcph"><b>${esc(S.g || "∫")} ${esc(S.name)}</b>${level || S.goal ? `<i>${esc([level, S.goal ? "aiming for " + LEVELS[S.goal][0].toLowerCase() : ""].filter(Boolean).join(" · "))}</i>` : ""}</span>
    ${P && (P.uni || P.programme) ? `<small class="lcuni">${esc([P.uni, P.programme].filter(Boolean).join(" · "))}</small>` : ""}
    ${P && P.about ? `<span class="lcabout">${esc(P.about.length > 220 ? P.about.slice(0, 218) + "…" : P.about)}</span>` : ""}
    <span class="lbar"><i style="width:${n ? (d / n) * 100 : tp.n ? (tp.done / tp.n) * 100 : 0}%"></i></span>
    <small>${n ? `${d}/${n} books` : tp.n ? `${tp.done}/${tp.n} topics` : "nothing in it yet"}${mods.length ? ` · ${plural(mods.length, "module")}` : ""}${cu && cu.progs.length ? ` · ${plural(cu.progs.length, "programme")} compared` : ""}${
        rd.length
            ? " · reading " +
              esc(
                  rd
                      .map(b => b.t)
                      .slice(0, 2)
                      .join(", ")
              )
            : ""
    }</small></button>`;
}
function learnHTML() {
    const P = pwCur();
    if (P) ui.learnSub = P.sub; // a pathway opens as its course
    const S = ui.learnSub && lcSub(ui.learnSub);
    if (S) return courseHTML(S);
    ui.pwId = null;
    const L = LSUBS(),
        shown = L.filter(s => !s.hidden),
        hid = L.filter(s => s.hidden);
    return `<div class="learn"><div class="lhead"><div><h2 class="ltitle">Courses</h2><p class="hint">What you're learning: a degree subject or anything you're into. Each course is one place: your level in its fields, what to read in what order, its years and modules, and the programmes you compare in Curricula.</p></div><span class="spacer"></span>
      <button class="btn sm" data-act="lc-newpath" data-k="">From a university's page…</button></div>
    ${LC_KINDS.map(
        ([
            w,
            wl,
        ]) => `<section class="group"><div class="plaque lkindh"><h3>${esc(wl)}</h3></div><div class="lcov">${shown
            .filter(s => (s.kind || "sci") === w)
            .map(lcCourseCard)
            .join("")}
      <div class="lcpath lcnew"><b>+ ${w === "arts" ? "Interest" : "Course"}</b><input class="inp" placeholder="${w === "arts" ? "e.g. Music theory, Chess" : "e.g. Mathematics, Philosophy"}" data-learnnew="${w}" aria-label="New ${w === "arts" ? "interest" : "course"}"><small class="hint">Press Enter</small></div></div></section>`
    ).join("")}
    ${hid.length ? `<p class="hint">Hidden: ${hid.map(s => `<button class="linkbtn" data-act="learn-unhide" data-k="${esc(s.id)}">${esc(s.name)}</button>`).join(", ")}</p>` : ""}</div>`;
}
// one course: its title and settings, then its pathway (pathHTML), then your levels, the hub and Curricula
function courseHTML(S) {
    const F = S.order || Object.keys(S.fields || {}),
        P = coursePath(S),
        lv = subjLevel(S),
        cu = (ACS().curricula || {})[S.id];
    ui.pwId = P.id; // what the pathway's buttons act on
    return `<div class="learn"><div class="lhead"><button class="btn sm ghost" data-act="learn-open" data-k="">← All courses</button><span class="spacer"></span>
      <label class="ctl">${selOf("", LC_KINDS, S.kind || "sci", `data-learnsub="${esc(S.id)}" data-f="kind" aria-label="Kind"`)}</label>
      <label class="ctl">Aiming for ${selOf(
          "",
          LEVELS.map(([n], i) => [String(i), i ? n : "No goal"]),
          String(S.goal || 0),
          `data-learngoal="${esc(S.id)}"`
      )}</label>
      <button class="btn sm ghost" data-act="learn-hide" data-k="${esc(S.id)}">Hide</button>
      ${ui.learnDel === S.id ? `<button class="btn sm danger" data-act="learn-del-yes" data-k="${esc(S.id)}">Delete ${esc(S.name)} and everything in it</button><button class="btn sm ghost" data-act="learn-del-no">Keep</button>` : `<button class="btn sm ghost" data-act="learn-del" data-k="${esc(S.id)}">Delete</button>`}</div>
    <div class="lsubj"><input class="inp lgin" data-learnsub="${esc(S.id)}" data-f="g" value="${esc(S.g || "∫")}" maxlength="2" aria-label="Symbol"><div><h2><input class="h2in" data-learnsub="${esc(S.id)}" data-f="name" value="${esc(S.name)}" aria-label="Course name"></h2>
      <p class="hint">${lv ? `Around ${esc(LEVELS[Math.round(lv)][0].toLowerCase())} level across the fields you've rated` : F.length ? "Tap the level you're at in each field." : "Add its fields below to rate yourself in each (optional)."}${S.goal ? ` · aiming for ${esc(LEVELS[S.goal][0].toLowerCase())}` : ""}</p></div></div></div>
    ${pathHTML(P)}
    <div class="learn"><section class="panel"><h3 class="pwh">Your level in each field</h3><div class="lfields">${F.map(
        f => {
            const v = ((S.fields || {})[f] || {}).lvl || 0,
                gap = S.goal && v < S.goal;
            return `<div class="lfield${gap ? " gap" : ""}"><span class="lf">${esc(f)}</span><div class="ldots" role="group" aria-label="${esc(f)} level">${LEVELS.map(([n], i) => `<button class="ld${i <= v && v ? " on" : ""}${i === v ? " cur" : ""}" data-act="learn-lvl" data-k="${esc(S.id)}" data-f="${esc(f)}" data-l="${i}" title="${esc(n)}" aria-pressed="${i === v}"></button>`).join("")}</div><span class="ln">${esc(LEVELS[v][0])}</span><button class="linkbtn" data-act="learn-field-del" data-k="${esc(S.id)}" data-f="${esc(f)}" aria-label="Remove ${esc(f)}">✕</button></div>`;
        }
    ).join("")}
      <div class="bar"><input class="inp" placeholder="+ a field (press Enter)" data-learnfield="${esc(S.id)}" style="max-width:260px"></div></div>
      <p class="hint lscale">The scale: ${LEVELS.slice(1)
          .map(([n, d]) => `<b>${n}</b> ${esc(d.toLowerCase())}`)
          .join(" · ")}.</p></section>
    ${lcHubExtrasHTML(S)}
    <section class="panel"><h3 class="pwh">Curricula</h3>${cu && cu.progs.length ? `<p class="hint">${plural(cu.progs.length, "programme")} compared over ${plural(cu.topics.length, "topic")}; ${Object.keys(cu.chosen || {}).length} books picked.</p>` : `<p class="hint">Compare what different universities teach in ${esc(S.name.toLowerCase())}, topic by topic, and pick your book for each.</p>`}
      <div class="bar"><button class="btn sm" data-act="uni-jump" data-k="${esc(S.id)}">${cu && cu.progs.length ? "Open the comparison" : "Start comparing"}</button></div></section></div>`;
}
function learnMini() {
    const S = LSUBS()
        .filter(s => !s.hidden)
        .slice(0, 8);
    if (!S.length)
        return `<p class="hint">Nothing here yet. <button class="linkbtn" data-act="tab" data-k="learn">Add a course</button></p>`;
    return `<div class="lminis">${S.map(s => {
        const lv = subjLevel(s),
            P = subjPaths(s);
        return `<button class="lmini" data-act="learn-jump" data-k="${esc(s.id)}"><span>${esc(s.g || "∫")} ${esc(s.name)}</span><span class="lbar"><i style="width:${(lv / 5) * 100}%"></i></span><small>${
            lv
                ? esc(LEVELS[Math.round(lv)][0])
                : plural(
                      P.reduce((a, p) => a + p.books.length, 0),
                      "book"
                  )
        }</small></button>`;
    }).join("")}</div>`;
}

// ── a course's pathway: what you work through, inside the course's page ──
// topics across a pathway's modules: covered once ticked, or once their module is done
function lcTopics(P) {
    const T = {};
    for (const m of P.modules || [])
        for (const t of m.topics || []) {
            const e = T[t.t] || (T[t.t] = { done: false, mods: [] });
            e.done = e.done || t.done || m.status === "done";
            e.mods.push(m.name);
        }
    const L = Object.values(T);
    return { T, n: L.length, done: L.filter(e => e.done).length };
}
// a topic's area, from the course's curricula (when it lists a topic of that name), else "Topics"
function lcArea(P, t) {
    const cu = (ACS().curricula || {})[P.sub];
    const x = cu && cu.topics.find(y => norm(y.name) === norm(t));
    return x ? x.area || "Topics" : "Topics";
}
function lcProgrammeHTML(P) {
    const mods = P.modules || [];
    if (!mods.length) return "";
    const cov = lcTopics(P),
        cr = mods.reduce((a, m) => a + (+m.credits || 0), 0),
        crDone = mods.filter(m => m.status === "done").reduce((a, m) => a + (+m.credits || 0), 0);
    const graded = mods.filter(m => m.grade !== "" && m.grade != null && !isNaN(parseFloat(m.grade)) && +m.credits),
        avg = graded.length
            ? graded.reduce((a, m) => a + parseFloat(m.grade) * m.credits, 0) /
              graded.reduce((a, m) => a + +m.credits, 0)
            : null;
    const areas = {};
    for (const [t, e] of Object.entries(cov.T)) {
        const a = lcArea(P, t),
            x = areas[a] || (areas[a] = { n: 0, done: 0 });
        x.n++;
        if (e.done) x.done++;
    }
    return `<section class="panel lcprog"><div class="tiles"><div class="tile"><div class="v">${cov.done}/${cov.n}</div><div class="k">Topics covered</div></div><div class="tile"><div class="v">${crDone}/${cr}</div><div class="k">Credits done</div></div>
      <div class="tile"><div class="v">${mods.filter(m => m.status === "taking").length}</div><div class="k">Taking now</div></div><div class="tile"><div class="v">${avg != null ? avg.toFixed(1) : "–"}</div><div class="k">Credit-weighted mark</div></div></div>
    ${
        Object.keys(areas).length > 1
            ? `<div class="covbars">${Object.entries(areas)
                  .map(
                      ([a, x]) =>
                          `<div><span>${esc(a)}</span><span class="b"><span style="width:${Math.round((x.done / x.n) * 100)}%"></span></span><span class="v">${x.done}/${x.n}</span></div>`
                  )
                  .join("")}</div>`
            : ""
    }</section>`;
}
// what another pathway (another university's programme, say) teaches that this one does or doesn't
function lcCompareHTML(P) {
    const others = PWS().filter(x => x.id !== P.id && (x.modules || []).some(m => (m.topics || []).length));
    if (!others.length || !(P.modules || []).length) return "";
    const O = others.find(x => x.id === ui.lcCmp),
        mine = lcTopics(P).T,
        theirs = O ? [...new Set(O.modules.flatMap(m => (m.topics || []).map(t => t.t)))] : [];
    return `<section class="panel"><h3 class="pwh">Compare with another programme</h3><div class="bar">${selOf("lc-cmp", [["", "Choose…"], ...others.map(x => [x.id, x.name])], ui.lcCmp || "")}</div>
    ${O ? `<p class="hint">${theirs.filter(t => mine[t]).length} of ${theirs.length} topics in ${esc(O.name)} are in this one.</p><div class="topics">${theirs.map(t => `<span class="topic ${mine[t] ? (mine[t].done ? "on" : "mid") : "gap"}" title="${mine[t] ? "In " + esc(mine[t].mods.join(", ")) : "Not in this programme"}">${esc(t)}</span>`).join("")}</div><p class="hint">Filled: covered · outlined: here, not done yet · faded: not here.</p>` : ""}</section>`;
}
const PW_VIEWS = [
    ["modules", "Modules"],
    ["map", "Map"],
    ["stages", "Stages"],
    ["threads", "Threads"],
];
// the old Pathways tab, in libraries that still have it: pathways are inside their course now
function pathsHTML() {
    return learnHTML();
}
function pathHTML(P) {
    pwMark(P);
    const B = P.books,
        main = B.filter(b => !b.ref),
        core = main.filter(b => !b.opt),
        by = k => main.filter(b => pwBucket(P, b) === k),
        stg = pwStages(P);
    const reading = by("reading"),
        ready = by("ready"),
        waiting = by("waiting"),
        refs = B.filter(b => b.ref);
    const cdone = core.filter(b => pwState(b) === "done").length,
        pct = core.length ? Math.round((cdone / core.length) * 100) : 0;
    const view = PW_VIEWS.some(([k]) => k === P.view)
        ? P.view
        : P.view === "order"
          ? "stages"
          : (P.modules || []).length
            ? "modules"
            : "map";
    const lanes = pwLanes(P).filter(th => main.some(b => lcLane(P, b) === th));
    const nexts = reading
        .map(b => [
            b,
            pwUnlocks(P, b).filter(
                x => pwBucket(P, x) === "waiting" && (x.after || []).filter(c => !pwMet(P, c)).every(c => c.k === b.id)
            ),
        ])
        .filter(([, u]) => u.length);
    const maxS = Math.max(0, ...main.map(b => stg[b.id] || 0)),
        stageName = i => (i === 0 ? "Start" : `Stage ${i + 1}`);
    let body = "";
    if (view === "modules") body = lcModulesHTML(P);
    else if (view === "map") {
        body = `<div class="pwmap" style="--cols:${maxS + 1}"><div class="pwmh"><span></span>${Array.from({ length: maxS + 1 }, (_, i) => `<span>${stageName(i)}</span>`).join("")}</div>
      ${lanes
          .map(
              th => `<div class="pwrow" style="--th:${pwColor(P, th)}"><div class="pwlane"><b>${esc(th)}</b><small>${main.filter(b => lcLane(P, b) === th && pwState(b) === "done").length}/${main.filter(b => lcLane(P, b) === th).length}</small></div>
        ${Array.from(
            { length: maxS + 1 },
            (_, i) =>
                `<div class="pwcell">${main
                    .filter(b => lcLane(P, b) === th && (stg[b.id] || 0) === i)
                    .map(b => pwCard(P, b))
                    .join("")}</div>`
        ).join("")}</div>`
          )
          .join("")}</div>`;
    } else if (view === "stages") {
        body = Array.from({ length: maxS + 1 }, (_, i) => {
            const L = main.filter(b => (stg[b.id] || 0) === i);
            return L.length
                ? `<section class="group"><div class="plaque"><h3>${stageName(i)}</h3><span class="n">${L.length}</span></div><div class="pwgrid">${L.map(b => pwCard(P, b, { thread: true })).join("")}</div></section>`
                : "";
        }).join("");
    } else {
        body = lanes
            .map(th => {
                const L = main.filter(b => lcLane(P, b) === th).sort((a, c) => (stg[a.id] || 0) - (stg[c.id] || 0));
                return `<section class="group" style="--th:${pwColor(P, th)}"><div class="plaque pwplq"><h3>${esc(th)}</h3><span class="n">${L.filter(b => pwState(b) === "done").length}/${L.length}</span></div><div class="pwgrid">${L.map(b => pwCard(P, b)).join("")}</div></section>`;
            })
            .join("");
    }
    const goals = (P.goals || [])
        .slice()
        .sort((a, c) => !!a.done - !!c.done || String(a.date || "9").localeCompare(String(c.date || "9")));
    const days = d => {
        if (!d) return "";
        const n = Math.round((Date.parse(d) - Date.now()) / 864e5);
        return n === 0 ? "today" : n > 0 ? `in ${n} day${n === 1 ? "" : "s"}` : `${-n} day${n === -1 ? "" : "s"} ago`;
    };
    const merged = P.merged || [];
    return `<div class="ph pwhead"><div class="ttl">
      <div class="lcmeta"><input class="inp" data-pw="uni" value="${esc(P.uni || "")}" placeholder="University" aria-label="University"><input class="inp" data-pw="programme" value="${esc(P.programme || "")}" placeholder="Programme or course" aria-label="Programme">
        <input class="inp" data-pw="url" value="${esc(P.url || "")}" placeholder="Its page (link)" aria-label="Link">${P.url ? `<a class="link" href="${esc(safeUrl(P.url))}" target="_blank" rel="noopener">Open ↗</a>` : ""}</div>
      <textarea class="inp ldesc pwabout" data-pw="about" rows="2" placeholder="A summary: what this course is for, where it gets you">${esc(P.about || "")}</textarea></div><span class="spacer"></span>
      <div class="seg" role="group" aria-label="Layout">${PW_VIEWS.map(([k, l]) => `<button data-act="pw-view" data-k="${k}" aria-pressed="${view === k}">${l}</button>`).join("")}</div>
      <button class="btn sm" data-act="pw-add">+ Book</button><button class="btn sm gold" data-act="lc-import" data-k="${esc(P.id)}">Fetch from a link…</button></div>
    ${
        merged.length
            ? `<p class="hint lcmerged">Brought together here: ${merged
                  .map(
                      x =>
                          `<b>${esc(x.name || x.programme || "a pathway")}</b>${x.uni || x.programme ? ` (${esc([x.uni, x.programme].filter(Boolean).join(" · "))})` : ""}${safeUrl(x.url) ? ` <a class="link" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">↗</a>` : ""}${x.about ? `: ${esc(x.about)}` : ""}`
                  )
                  .join("; ")}</p>`
            : ""
    }
    ${lcProgrammeHTML(P)}${lcGradHTML(P)}
    ${
        main.length || !(P.modules || []).length
            ? `<div class="pwnow">
      <section class="panel pwring"><div class="ring" style="--p:${pct}"><b>${pct}%</b><small>${cdone} of ${core.length}${core.length < main.length ? " core" : ""}</small></div>
        <div class="pwcounts"><span class="reading"><b>${reading.length}</b> reading</span><span class="ready"><b>${ready.length}</b> ready</span><span class="waiting"><b>${waiting.length}</b> waiting</span></div>
        <div class="covbars">${lanes
            .slice(0, 12)
            .map(th => {
                const L = main.filter(b => lcLane(P, b) === th),
                    d = L.filter(b => pwState(b) === "done").length;
                return `<div style="--th:${pwColor(P, th)}"><span>${esc(th)}</span><span class="b"><span style="width:${L.length ? Math.round((d / L.length) * 100) : 0}%"></span></span><span class="v">${d}/${L.length}</span></div>`;
            })
            .join("")}</div></section>
      <section class="panel"><h3 class="pwh">Reading now</h3>${reading.length ? `<div class="pwlist">${reading.map(b => pwCard(P, b, { thread: true })).join("")}</div>` : `<p class="hint">${main.length ? "Nothing started yet. Pick from what's ready." : "No books yet: add them, or fetch a reading list."}</p>`}</section>
      <section class="panel"><h3 class="pwh">Ready to start</h3>${
          ready.length
              ? `<div class="pwlist">${ready
                    .slice(0, 6)
                    .map(b => pwCard(P, b, { thread: true }))
                    .join("")}</div>${ready.length > 6 ? `<p class="hint">and ${ready.length - 6} more</p>` : ""}`
              : `<p class="hint">${waiting.length ? "Everything left is waiting on something you're reading." : "Nothing left to start."}</p>`
      }
        ${nexts.length ? `<div class="pwnext">${nexts.map(([b, u]) => `<p><span class="hint">Finishing</span> <b>${esc(pwShort(b))}</b> <span class="hint">unlocks</span> ${u.map(x => esc(pwShort(x))).join(", ")}</p>`).join("")}</div>` : ""}</section>
    </div>`
            : ""
    }
    <div class="pwbody v-${view}">${body}</div>
    ${refs.length ? `<section class="group"><div class="plaque"><h3>Keep for reference</h3><span class="n">${refs.length}</span></div><div class="pwgrid">${refs.map(b => pwCard(P, b, { thread: true })).join("")}</div></section>` : ""}
    ${lcCompareHTML(P)}
    <div class="dash pwfoot">
      <section class="panel span6"><h3 class="pwh">How to work through it</h3>${
          (P.method || "").trim()
              ? `<ul class="pwrules">${P.method
                    .split("\n")
                    .map(s => s.trim())
                    .filter(Boolean)
                    .map(s => `<li>${esc(s)}</li>`)
                    .join(
                        ""
                    )}</ul><details class="pwmed"><summary class="hint">Edit these</summary><textarea class="inp pwmethod" data-pw="method" rows="6">${esc(P.method)}</textarea></details>`
              : `<textarea class="inp pwmethod" data-pw="method" rows="5" placeholder="Your rules, one per line: how carefully, which exercises, when to move on"></textarea>`
      }</section>
      <section class="panel span6"><h3 class="pwh">Milestones</h3>
        ${goals.length ? `<div class="pwgoals">${goals.map(g => `<label class="pwgoal${g.done ? " on" : ""}"><input type="checkbox" data-pwgoal="${esc(g.id)}" ${g.done ? "checked" : ""}><span>${esc(g.t)}</span>${g.date ? `<small>${esc(fmtDate(g.date))} · ${days(g.date)}</small>` : ""}<button class="linkbtn" data-act="pw-goal-del" data-k="${esc(g.id)}" aria-label="Remove">✕</button></label>`).join("")}</div>` : `<p class="hint">Exams, deadlines, "finish Part I by spring".</p>`}
        <div class="bar"><input class="inp" id="pw-goal-t" placeholder="Add a milestone" style="flex:1"><input class="inp" type="date" id="pw-goal-d" style="width:150px"><button class="btn sm" data-act="pw-goal-add">Add</button></div></section>
    </div>`;
}
// the Modules view: stages (years, terms) in order, their modules, each with its topics, status, mark and readings in order.
// A module opens to edit; closed, it shows what matters at a glance.
const LC_STATUS = [
    ["planned", "Planned"],
    ["taking", "Taking"],
    ["done", "Done"],
    ["dropped", "Dropped"],
];
function lcModulesHTML(P) {
    const st = P.stages || [],
        mods = P.modules || [],
        none = mods.filter(m => !st.some(s => s.id === m.stage)),
        loose = P.books.filter(b => !b.ref && !lcMod(P, b.mod));
    const lib = ui.lcOpen
        ? all()
              .filter(x => x.medium === "book")
              .sort((a, c) => titleOf(a).localeCompare(titleOf(c)))
        : [];
    const where = t => {
        const cu = (ACS().curricula || {})[P.sub],
            tp = cu && cu.topics.find(y => norm(y.name) === norm(t));
        if (!tp) return "";
        return cu.progs
            .flatMap(p => p.modules.filter(m => (m.topics || []).includes(tp.id)).map(m => `${p.uni}: ${m.name}`))
            .join(" · ");
    };
    const modHTML = m => {
        const R = P.books.filter(b => b.mod === m.id && !b.ref),
            T = m.topics || [],
            td = T.filter(t => t.done).length,
            open = ui.lcOpen === m.id,
            waits = lcModWaits(P, m);
        return `<div class="lcmod ${m.status || "planned"}${m.core === false ? " opt" : ""}${open ? " open" : ""}" style="--th:${pwColor(P, m.name)}"><div class="lcmh">
        <button class="lcmt" data-act="lc-open" data-k="${esc(m.id)}" aria-expanded="${open}"><b>${esc([m.code, m.name].filter(Boolean).join(" "))}</b><small>${esc([m.credits ? m.credits + " credits" : "", m.term, m.core === false ? "option" : "core", m.grade !== "" && m.grade != null ? "mark " + m.grade : ""].filter(Boolean).join(" · "))}</small></button>
        ${selOf("", LC_STATUS, m.status || "planned", `data-lcm="${esc(m.id)}" data-f="status" aria-label="Status"`)}
        <span class="lcrb h"><button class="linkbtn" data-act="lc-mod-up" data-k="${esc(m.id)}" aria-label="Move up">↑</button><button class="linkbtn" data-act="lc-mod-down" data-k="${esc(m.id)}" aria-label="Move down">↓</button></span></div>
      ${waits.length && !lcModDone(m) ? `<p class="lcwait">Waits on ${waits.map(x => `<b>${esc(x.name)}</b>`).join(", ")}</p>` : ""}
      ${T.length ? `<div class="prog"><span style="width:${Math.round((td / T.length) * 100)}%"></span></div>` : ""}${lcSpreadHTML(P, m)}
      ${
          open
              ? `<div class="lcmb"><div class="bar"><input class="inp" data-lcm="${esc(m.id)}" data-f="name" value="${esc(m.name)}" placeholder="Name" style="flex:2;min-width:180px" aria-label="Name"><input class="inp" data-lcm="${esc(m.id)}" data-f="code" value="${esc(m.code || "")}" placeholder="Code" style="width:100px" aria-label="Code">
          <input class="inp" data-lcm="${esc(m.id)}" data-f="credits" value="${esc(m.credits || "")}" placeholder="Credits" style="width:76px" aria-label="Credits"><input class="inp" data-lcm="${esc(m.id)}" data-f="term" value="${esc(m.term || "")}" placeholder="Term" style="width:96px" aria-label="Term"><input class="inp" data-lcm="${esc(m.id)}" data-f="grade" value="${esc(m.grade ?? "")}" placeholder="Mark %" style="width:76px" aria-label="Mark">
          <label class="ctl"><input type="checkbox" data-lcm="${esc(m.id)}" data-f="core" ${m.core === false ? "" : "checked"}> Core</label>${st.length ? selOf("", [["", "No stage"], ...st.map(s => [s.id, s.name])], m.stage || "", `data-lcm="${esc(m.id)}" data-f="stage" aria-label="Stage"`) : ""}</div>
        <p class="label">Topics · ${td}/${T.length} <span class="hint">in reading order · "Topic &lt; what it needs" to add one that waits</span></p><div class="topics">${T.map(
            (t, i) => {
                const tw = lcTopicWaits(P, t);
                return `<label class="topic${t.done ? " on" : ""}${tw.length ? " wait" : ""}" title="${esc([tw.length ? "Needs " + tw.join(", ") : "", where(t.t) || ""].filter(Boolean).join(" · "))}"><input type="checkbox" data-lctopic="${esc(m.id)}" data-i="${i}" ${t.done ? "checked" : ""}>${esc(t.t)}<button class="linkbtn" data-act="lc-topic-del" data-k="${esc(m.id)}" data-i="${i}" aria-label="Remove">✕</button></label>`;
            }
        ).join("")}
          <input class="inp" placeholder="+ topic (press Enter)" data-lctopicadd="${esc(m.id)}" style="width:190px"></div>
        ${
            mods.length > 1
                ? `<p class="label">Needs first <span class="hint">modules to finish before this one</span></p><div class="topics">${mods
                      .filter(x => x.id !== m.id)
                      .map(
                          x =>
                              `<label class="topic${(m.after || []).includes(x.id) ? " on" : ""}"><input type="checkbox" data-lcmafter="${esc(m.id)}" data-k="${esc(x.id)}" ${(m.after || []).includes(x.id) ? "checked" : ""}>${esc([x.code, x.name].filter(Boolean).join(" "))}</label>`
                      )
                      .join("")}</div>`
                : ""
        }
        ${
            T.some(t => where(t.t))
                ? `<details><summary class="hint">Where else this is taught</summary><ul class="equiv">${T.filter(t =>
                      where(t.t)
                  )
                      .map(t => `<li><b>${esc(t.t)}</b>: ${esc(where(t.t))}</li>`)
                      .join("")}</ul></details>`
                : ""
        }
        <div class="bar"><button class="btn sm ghost" data-act="lc-import" data-k="${esc(P.id)}" data-m="${esc(m.id)}">Fetch its reading list…</button><input class="inp" list="lc-libs" placeholder="Link a book from your library…" data-lclink="${esc(m.id)}" style="flex:1"><datalist id="lc-libs">${lib.map(x => `<option value="${esc(titleOf(x))} · ${esc(MEDIA[x.medium].one)}">`).join("")}</datalist>
          <button class="btn sm ghost danger" data-act="lc-mod-del" data-k="${esc(m.id)}">Remove module</button></div></div>`
              : ""
      }
      ${R.length || open ? `<ol class="lcreads">${R.map(b => `<li>${pwCard(P, b)}<span class="lcrb"><button class="linkbtn" data-act="lc-read-up" data-k="${esc(b.id)}" aria-label="Earlier">↑</button><button class="linkbtn" data-act="lc-read-down" data-k="${esc(b.id)}" aria-label="Later">↓</button></span></li>`).join("")}</ol>` : ""}
      ${open ? `<div class="bar lcadd"><input class="inp" placeholder="+ reading: title, author (press Enter)" data-lcaddread="${esc(m.id)}"></div>` : ""}</div>`;
    };
    const stageHTML = (
        s,
        L
    ) => `<section class="group lcstage"><div class="plaque">${s ? `<input class="inp h3in" data-lcs="${esc(s.id)}" value="${esc(s.name)}" aria-label="Stage name"><button class="chip lcspec" data-act="lc-stage-spec" data-k="${esc(s.id)}" aria-pressed="${!!s.spec}" title="A specialised stage: Part III, a master's year, a research year">${s.spec ? "Specialised" : "+ specialised"}</button><span class="lcrb h"><button class="linkbtn" data-act="lc-stage-up" data-k="${esc(s.id)}" aria-label="Move up">↑</button><button class="linkbtn" data-act="lc-stage-down" data-k="${esc(s.id)}" aria-label="Move down">↓</button><button class="linkbtn danger" data-act="lc-stage-del" data-k="${esc(s.id)}" aria-label="Delete stage">✕</button></span>` : `<h3>${st.length ? "No stage" : "Modules"}</h3>`}<span class="n">${L.length}</span>
      <span class="spacer"></span><button class="btn sm ghost" data-act="lc-mod-add" data-k="${s ? esc(s.id) : ""}">+ Module</button></div><div class="lcmods">${L.map(modHTML).join("")}</div></section>`;
    return `${st
        .map(s =>
            stageHTML(
                s,
                mods.filter(m => m.stage === s.id)
            )
        )
        .join("")}${none.length || !st.length ? stageHTML(null, none) : ""}
    ${loose.length ? `<section class="group"><div class="plaque"><h3>Other readings</h3><span class="n">${loose.length}</span></div><ol class="lcreads">${loose.map(b => `<li>${pwCard(P, b)}</li>`).join("")}</ol></section>` : ""}
    <div class="bar"><button class="btn sm" data-act="lc-stage-add">+ Stage (a year, term or part)</button><input class="inp" placeholder="+ reading outside any module (press Enter)" data-lcaddread="" style="flex:1;max-width:420px"></div>`;
}
function pathsMini() {
    const P = pwCur() || PWS()[0];
    if (!P)
        return `<p class="hint">No course yet. <button class="linkbtn" data-act="tab" data-k="learn">Start one</button></p>`;
    const main = P.books.filter(b => !b.ref),
        d = main.filter(b => pwState(b) === "done").length,
        rd = main.filter(b => pwBucket(P, b) === "reading"),
        ry = main.filter(b => pwBucket(P, b) === "ready");
    return `<p class="hint">${esc((lcSub(P.sub) || P).name)} · ${d}/${main.length} books</p><div class="prog"><span style="width:${main.length ? Math.round((d / main.length) * 100) : 0}%"></span></div>
    <div class="pwlist mini">${[...rd, ...ry]
        .slice(0, 5)
        .map(b => pwCard(P, b, { thread: true }))
        .join("")}</div><button class="linkbtn" data-act="learn-path" data-k="${esc(P.id)}">Open the course</button>`;
}
BLOCKS.paths = {
    name: "Reading next",
    d: "What you're reading in a course, and what's ready next",
    w: 8,
    html: c => pathsMini(),
};
BLOCKS.learn = { name: "Courses", d: "Your courses, and your level in each", w: 8, html: c => learnMini() };

// ── a course from a university's page (or more of one: what you type fills in what it doesn't have yet) ──
MODALS.lcnew = function (m) {
    return (
        head("From a university's page") +
        `<div class="fields">
      <div class="field"><label for="lcn-sub">Course</label>${selOf("lcn-sub", [...LSUBS().map(s => [s.id, s.name]), ["+", "A new course…"]], m.sub || "+")}</div>
      <div class="field"><label for="lcn-subnew">New course's name</label><input id="lcn-subnew" placeholder="e.g. Aeronautics (only for a new one)" autofocus></div>
      <div class="field"><label for="lcn-uni">University</label><input id="lcn-uni" placeholder="e.g. Imperial College London"></div>
      <div class="field"><label for="lcn-prog">Programme or course</label><input id="lcn-prog" placeholder="e.g. Aeronautical Engineering MEng"></div>
      <div class="field full"><label for="lcn-url">Link to its programme or module list</label><input id="lcn-url" placeholder="https://…"></div>
      <div class="field full"><label for="lcn-about">Summary (optional)</label><textarea id="lcn-about" rows="2" placeholder="What it's for, where it gets you"></textarea></div></div>
    <div class="bar"><button class="btn gold" data-act="lc-create" data-k="fetch">Fetch from the link</button><button class="btn" data-act="lc-create" data-k="">Just save these</button></div>
    <p class="hint">Everything can be changed afterwards, and more can be fetched any time (a reading list per module, say).</p>`
    );
};
function lcSubFromForm() {
    const sub = ($("#lcn-sub") || {}).value || "",
        nn = (($("#lcn-subnew") || {}).value || "").trim();
    if (sub !== "+") return sub;
    if (!nn) return "";
    const S = { id: acId(), name: nn, g: nn.charAt(0).toUpperCase(), fields: {}, order: [], goal: 0 };
    LSUBS().push(S);
    return S.id;
}

// ── clicks and edits ──
function lcMove(L, i, d) {
    const j = i + d;
    if (i < 0 || j < 0 || j >= L.length) return false;
    [L[i], L[j]] = [L[j], L[i]];
    return true;
}
// the next reading of the same module, in order, or within the same group (for ↑↓)
function lcReadMove(P, b, d) {
    const same = P.books.filter(x => x.mod === b.mod && !x.ref),
        i = same.indexOf(b),
        o = same[i + d];
    if (!o) return;
    const a = P.books.indexOf(b),
        c = P.books.indexOf(o);
    [P.books[a], P.books[c]] = [P.books[c], P.books[a]];
}
function lcAddReading(P, mid, text) {
    const [t, a] = text.split(/\s*[,–—]\s*|\s+by\s+/i).map(s => s.trim());
    if (!t) return null;
    const id = "b" + acId(),
        b = { id, t, a: a || "", th: "", mod: mid || "", st: "todo", note: "", after: [] };
    P.books.push(b);
    return b;
}
function pwSetState(P, b, s) {
    b.st = s;
    const lid = pwLib(b);
    if (lid) {
        const L = items.get(lid);
        if (s === "reading" && !["active", "redo"].includes(L.status))
            patch(lid, { status: "active", startedAt: L.startedAt || nowISO() }, "Start " + titleOf(L));
        if (s === "done" && L.status !== "done")
            patch(lid, { status: "done", finishedAt: L.finishedAt || nowISO() }, "Finish " + titleOf(L));
        if (s === "todo" && ["active", "redo", "done"].includes(L.status))
            patch(lid, { status: "want" }, "Back to planned");
    }
    markDirty();
}
function learnClick(act, t, k) {
    const S = k && lcSub(k);
    switch (act) {
        case "learn-open":
            ui.learnSub = S ? k : null;
            ui.pwId = S ? coursePath(S).id : null;
            ui.learnDel = null;
            renderMain();
            scrollTo(0, 0);
            return true;
        case "learn-jump":
            ui.learnSub = k;
            ui.pwId = S ? coursePath(S).id : null;
            goTab("learn");
            return true;
        case "learn-lvl":
            if (S) {
                const f = t.dataset.f;
                S.fields[f] = { ...(S.fields[f] || {}), lvl: Number(t.dataset.l), at: nowISO() };
                markDirty();
                renderMain();
            }
            return true;
        case "learn-field-del":
            if (S) {
                delete S.fields[t.dataset.f];
                S.order = (S.order || []).filter(x => x !== t.dataset.f);
                markDirty();
                renderMain();
            }
            return true;
        case "learn-hide":
        case "learn-unhide":
            if (S) {
                S.hidden = act === "learn-hide" || undefined;
                if (S.hidden) ui.learnSub = ui.pwId = null;
                markDirty();
                renderMain();
            }
            return true;
        case "learn-del":
            ui.learnDel = k;
            renderMain();
            return true;
        case "learn-del-no":
            ui.learnDel = null;
            renderMain();
            return true;
        case "learn-del-yes": {
            const C = ACS(),
                before = clone(C);
            C.subjects = C.subjects.filter(s => s.id !== k);
            C.paths = C.paths.filter(p => p.sub !== k);
            ui.learnSub = ui.pwId = null;
            ui.learnDel = null;
            markDirty();
            renderMain();
            toast("Deleted", {
                label: "Undo",
                fn: () => {
                    meta.courses = before;
                    markDirty();
                    renderMain();
                },
            });
            return true;
        }
        // a pathway opens as its course; no pathway: back to all courses
        case "learn-path": {
            ui.pwId = k || null;
            const P = pwCur();
            ui.learnSub = P ? P.sub : null;
            if (ui.tab !== "learn") goTab("learn");
            else renderMain();
            scrollTo(0, 0);
            return true;
        }
    }
    return false;
}
function pathClick(act, t, k) {
    const P = pwCur(),
        m = ui.modal && ui.modal.kind === "pwbook" ? ui.modal : null,
        mp = m && PWS().find(p => p.id === m.pid),
        mb = mp && pwBook(mp, m.bid);
    const re = () => {
            if (m) renderOverlay();
            renderMain();
        },
        done = () => {
            markDirty();
            renderMain();
            return true;
        };
    switch (act) {
        case "pw-view":
            if (P) {
                P.view = k;
                return done();
            }
            return true;
        case "pw-add":
            if (P) {
                const b = lcAddReading(P, "", "New book");
                markDirty();
                renderMain();
                openModal("pwbook", { pid: P.id, bid: b.id, edit: true });
            }
            return true;
        case "pw-book": {
            const pid = mp ? mp.id : P && P.id;
            if (m) {
                m.bid = k;
                m.confirm = false;
                m.edit = false;
                renderOverlay(true);
            } else openModal("pwbook", { pid, bid: k });
            return true;
        }
        case "pw-st":
            if (mb) {
                pwSetState(mp, mb, k);
                re();
            }
            return true;
        case "pw-tolib":
            if (mb) {
                const S = lcSub(mp.sub),
                    id = addItem(
                        {
                            medium: "book",
                            kind: "Academic",
                            title: mb.t,
                            creator: mb.a || "",
                            subject: S ? S.name : "",
                            year: Number(mb.year) || undefined,
                            status: mb.st === "done" ? "done" : mb.st === "reading" ? "active" : "want",
                        },
                        "Add " + mb.t
                    );
                mb.lib = id;
                markDirty();
                re();
                toast(`Added ${mb.t} to your library`);
                if (typeof autoCovers === "function") setTimeout(() => autoCovers(), 300);
            }
            return true;
        case "pw-cond-add":
            if (mb) {
                const ck = ($("#pw-cond-k") || {}).value,
                    cs = ($("#pw-cond-s") || {}).value || "start";
                if (ck && ck !== mb.id && !(mb.after || []).some(c => c.k === ck)) {
                    mb.after = [...(mb.after || []), { k: ck, s: cs, p: cs === "part" ? 0 : undefined }];
                    markDirty();
                    re();
                }
            }
            return true;
        case "pw-cond-del":
            if (mb) {
                mb.after.splice(Number(k), 1);
                markDirty();
                re();
            }
            return true;
        case "pw-part-del":
            if (mb) {
                mb.parts.splice(Number(k), 1);
                if (!mb.parts.length) delete mb.parts;
                markDirty();
                re();
            }
            return true;
        case "pw-rm":
            if (m) {
                m.confirm = true;
                renderOverlay();
            }
            return true;
        case "pw-rm-no":
            if (m) {
                m.confirm = false;
                renderOverlay();
            }
            return true;
        case "pw-rm-yes":
            if (mb) {
                mp.books = mp.books.filter(x => x.id !== mb.id);
                for (const x of mp.books) x.after = (x.after || []).filter(c => c.k !== mb.id);
                markDirty();
                closeModal();
                renderMain();
            }
            return true;
        case "pw-goal-add":
            if (P) {
                const tt = ($("#pw-goal-t") || {}).value.trim(),
                    d = ($("#pw-goal-d") || {}).value;
                if (!tt) {
                    toast("Write the milestone first.");
                    return true;
                }
                P.goals = [...(P.goals || []), { id: acId(), t: tt, date: d || "", done: false }];
                return done();
            }
            return true;
        case "pw-goal-del":
            if (P) {
                P.goals = (P.goals || []).filter(g => g.id !== k);
                return done();
            }
            return true;
    }
    return false;
}
function lcClick(act, t, k) {
    if (lcHubClick(act, t, k)) return true;
    const P = pwCur();
    switch (act) {
        case "lc-newpath":
            openModal("lcnew", { sub: k || ui.learnSub || "" });
            return true;
        case "lc-create": {
            const val = id => (($(id) || {}).value || "").trim(),
                typed = {
                    uni: val("#lcn-uni"),
                    programme: val("#lcn-prog"),
                    url: val("#lcn-url"),
                    about: val("#lcn-about"),
                };
            const sub = lcSubFromForm();
            if (!sub) {
                toast("Pick a course, or name a new one.");
                return true;
            }
            const N = coursePath(lcSub(sub));
            // what you typed fills in what the course doesn't have yet; if it already has something else, that's kept too
            const clash = Object.keys(typed).some(f => typed[f] && N[f] && N[f] !== typed[f]);
            if (clash) N.merged = [...(N.merged || []), { name: typed.programme || typed.uni, ...typed, at: nowISO() }];
            else for (const f of Object.keys(typed)) if (typed[f]) N[f] = typed[f];
            markDirty();
            closeModal();
            ui.pwId = N.id;
            ui.learnSub = sub;
            if (ui.tab !== "learn") goTab("learn");
            else renderMain();
            if (k === "fetch")
                openModal("lcimport", { pid: N.id, url: typed.url || N.url, want: "auto", step: "link" });
            return true;
        }
        case "lc-import":
            openModal("lcimport", {
                pid: k,
                mid: t.dataset.m || "",
                url: t.dataset.m ? "" : (PWS().find(p => p.id === k) || {}).url || "",
                want: t.dataset.m ? "readings" : "auto",
                step: "link",
            });
            return true;
        case "lc-open":
            ui.lcOpen = ui.lcOpen === k ? null : k;
            renderMain();
            return true;
        case "lc-topic-del":
            if (P) {
                const md = lcMod(P, k);
                if (md) {
                    md.topics.splice(Number(t.dataset.i), 1);
                    markDirty();
                    renderMain();
                }
            }
            return true;
        case "lc-stage-add":
            if (P) {
                P.stages = [...(P.stages || []), { id: acId(), name: `Year ${(P.stages || []).length + 1}` }];
                markDirty();
                renderMain();
            }
            return true;
        case "lc-stage-del":
            if (P) {
                P.stages = P.stages.filter(s => s.id !== k);
                for (const m of P.modules) if (m.stage === k) m.stage = "";
                markDirty();
                renderMain();
            }
            return true;
        case "lc-stage-up":
        case "lc-stage-down":
            if (
                P &&
                lcMove(
                    P.stages,
                    P.stages.findIndex(s => s.id === k),
                    act.endsWith("up") ? -1 : 1
                )
            ) {
                markDirty();
                renderMain();
            }
            return true;
        case "lc-mod-add":
            if (P) {
                const nm = {
                    id: acId(),
                    stage: k || "",
                    code: "",
                    name: "New module",
                    credits: "",
                    core: true,
                    status: "planned",
                    grade: "",
                    term: "",
                    topics: [],
                };
                P.modules.push(nm);
                ui.lcOpen = nm.id;
                markDirty();
                renderMain();
            }
            return true;
        case "lc-mod-del":
            if (P) {
                const gone = new Set(P.books.filter(b => b.mod === k).map(b => b.id));
                P.modules = P.modules.filter(m => m.id !== k);
                P.books = P.books.filter(b => !gone.has(b.id));
                for (const b of P.books) b.after = (b.after || []).filter(c => !gone.has(c.k));
                markDirty();
                renderMain();
            }
            return true;
        case "lc-mod-up":
        case "lc-mod-down":
            if (P) {
                const m = lcMod(P, k),
                    same = P.modules.filter(x => x.stage === m.stage),
                    o = same[same.indexOf(m) + (act.endsWith("up") ? -1 : 1)];
                if (o) {
                    const a = P.modules.indexOf(m),
                        c = P.modules.indexOf(o);
                    [P.modules[a], P.modules[c]] = [P.modules[c], P.modules[a]];
                    markDirty();
                    renderMain();
                }
            }
            return true;
        case "lc-read-up":
        case "lc-read-down":
            if (P) {
                const b = pwBook(P, k);
                if (b) {
                    lcReadMove(P, b, act.endsWith("up") ? -1 : 1);
                    markDirty();
                    renderMain();
                }
            }
            return true;
    }
    return lcImportClick(act, t, k);
}
document.addEventListener("change", e => {
    const t = e.target;
    if (!t.dataset) return;
    const P = pwCur(),
        m = ui.modal && ui.modal.kind === "pwbook" ? ui.modal : null,
        mp = m && PWS().find(p => p.id === m.pid),
        mb = mp && pwBook(mp, m.bid);
    if (t.dataset.learngoal) {
        const S = lcSub(t.dataset.learngoal);
        if (S) {
            S.goal = Number(t.value);
            markDirty();
            renderMain();
        }
    }
    if (t.dataset.learnsub) {
        const S = lcSub(t.dataset.learnsub),
            v = t.value.trim();
        if (S && v) {
            S[t.dataset.f] = v;
            if (t.dataset.f === "name") for (const P of PWS()) if (P.sub === S.id) P.name = v;
            markDirty();
            renderMain();
        }
    }
    if (t.dataset.pw && P) {
        const f = t.dataset.pw,
            v = t.value;
        P[f] = f === "name" ? v.trim() || P.name : f === "about" || f === "method" ? v : v.trim();
        markDirty();
        if (f !== "about" && f !== "method") renderMain();
    }
    if (t.dataset.pwgoal && P) {
        const g = (P.goals || []).find(x => x.id === t.dataset.pwgoal);
        if (g) {
            g.done = t.checked;
            markDirty();
            renderMain();
        }
    }
    if (t.dataset.lcs && P) {
        const s = (P.stages || []).find(x => x.id === t.dataset.lcs);
        if (s && t.value.trim()) {
            s.name = t.value.trim();
            markDirty();
        }
    }
    if (t.dataset.lcm && P) {
        const md = lcMod(P, t.dataset.lcm),
            f = t.dataset.f;
        if (md) {
            md[f] = f === "core" ? t.checked : f === "name" ? t.value.trim() || md.name : t.value.trim();
            markDirty();
            renderMain();
        }
    }
    if (t.dataset.lctopic && P) {
        const md = lcMod(P, t.dataset.lctopic),
            x = md && (md.topics || [])[Number(t.dataset.i)];
        if (x) {
            x.done = t.checked;
            markDirty();
            renderMain();
        }
    }
    if (t.dataset.lclink && P) {
        const iid = idFromOption(t.value),
            it = iid && items.get(iid);
        if (it) {
            P.books.push({
                id: "b" + acId(),
                t: it.title,
                a: it.creator || "",
                mod: t.dataset.lclink,
                th: "",
                st: "todo",
                note: "",
                after: [],
                lib: iid,
            });
            markDirty();
            renderMain();
        }
    }
    if (t.id === "lc-cmp") {
        ui.lcCmp = t.value || null;
        renderMain();
    }
    if (!mb) return;
    if (t.dataset.pwb) {
        const f = t.dataset.pwb,
            v = t.value;
        mb[f] = f === "note" ? v : v.trim() || (f === "th" || f === "year" ? "" : mb[f]);
        if (f === "t" || f === "a") delete mb.lib;
        markDirty();
        renderOverlay();
        renderMain();
    }
    if (t.dataset.pwbmod != null) {
        mb.mod = t.value;
        markDirty();
        renderOverlay();
        renderMain();
    }
    if (t.dataset.pwbc) {
        mb[t.dataset.pwbc] = t.checked || undefined;
        markDirty();
        renderOverlay();
        renderMain();
    }
    if (t.dataset.pwpart != null) {
        const i = Number(t.dataset.pwpart);
        if (mb.parts && mb.parts[i]) {
            mb.parts[i].done = t.checked;
            markDirty();
            renderOverlay();
            renderMain();
        }
    }
    if (t.dataset.pwpartadd) {
        const v = t.value.trim();
        if (v) {
            mb.parts = [...(mb.parts || []), { t: v, done: false }];
            markDirty();
            renderOverlay();
        }
    }
    if (t.dataset.pwlink) {
        const iid = idFromOption(t.value);
        if (iid) {
            mb.lib = iid;
            markDirty();
            renderOverlay();
            renderMain();
        }
    }
});
// Enter in the "+ …" boxes adds straight away
document.addEventListener(
    "keydown",
    e => {
        const t = e.target;
        if (!t || !t.dataset || e.key !== "Enter") return;
        const P = pwCur(),
            v = (t.value || "").trim();
        if (t.dataset.learnnew) {
            e.preventDefault();
            if (!v) return;
            const S = { id: acId(), name: v, g: v.charAt(0).toUpperCase(), fields: {}, order: [], goal: 0 };
            if (t.dataset.learnnew === "arts") S.kind = "arts"; // made under Interests
            LSUBS().push(S);
            markDirty();
            ui.learnSub = S.id;
            renderMain();
            return;
        }
        if (t.dataset.learnfield) {
            e.preventDefault();
            const S = lcSub(t.dataset.learnfield);
            if (S && v && !S.fields[v]) {
                S.fields[v] = { lvl: 0 };
                S.order = [...(S.order || Object.keys(S.fields).filter(f => f !== v)), v];
                markDirty();
                renderMain();
                keepFocus(`[data-learnfield="${S.id}"]`);
            }
            return;
        }
        if (t.dataset.lctopicadd && P) {
            e.preventDefault();
            const md = lcMod(P, t.dataset.lctopicadd);
            const [tn, need = ""] = v.split(/\s*<\s*/),
                after = need.split(/\s*,\s*/).filter(Boolean);
            if (md && tn && !(md.topics || []).some(x => x.t === tn)) {
                md.topics = [...(md.topics || []), { t: tn, done: false, ...(after.length ? { after } : {}) }];
                markDirty();
                renderMain();
                keepFocus(`[data-lctopicadd="${md.id}"]`);
            }
            return;
        }
        if (t.dataset.lcaddread != null && P) {
            e.preventDefault();
            if (lcAddReading(P, t.dataset.lcaddread, v)) {
                markDirty();
                renderMain();
                keepFocus(`[data-lcaddread="${t.dataset.lcaddread}"]`);
            }
            return;
        }
        if (t.dataset.pwpartadd || t.id === "pw-goal-t") {
            e.preventDefault();
            if (t.id === "pw-goal-t") {
                const b = $('[data-act="pw-goal-add"]');
                b && b.click();
            } else t.dispatchEvent(new Event("change", { bubbles: true }));
        }
    },
    true
);

// ── one reading: progress, what it waits for and unlocks, parts, notes, its module, and its copy in your library ──
MODALS.pwbook = function (m) {
    const P = PWS().find(p => p.id === m.pid),
        b = P && pwBook(P, m.bid);
    if (!b) return head("Reading") + `<p class="hint">This reading was removed.</p>`;
    pwMark(P);
    const lid = pwLib(b),
        L = lid ? items.get(lid) : null,
        bk = pwBucket(P, b),
        st = pwState(b),
        un = pwUnlocks(P, b),
        md = lcMod(P, b.mod);
    const others = P.books.filter(x => x.id !== b.id),
        lib = all()
            .filter(x => x.medium === "book")
            .sort((a, c) => titleOf(a).localeCompare(titleOf(c)));
    return `<div class="pwmodal" style="--th:${pwColor(P, lcLane(P, b))}">${head(esc(b.t))}
    <p class="hint">${esc(b.a || "")}${b.year ? " · " + esc(b.year) : ""} · <span class="pwpill ${bk}">${PW_WORD[bk]}</span>${md ? ` · ${esc([md.code, md.name].filter(Boolean).join(" "))}` : ""}${b.free ? ` · free online` : ""}${b.opt ? " · optional" : ""}</p>
    ${b.where ? `<p class="pwwhere"><span class="label">Where it's taught</span> ${esc(b.where)}</p>` : ""}
    <div class="bar"><div class="seg">${PW_ST.map(([k, l]) => `<button data-act="pw-st" data-k="${k}" aria-pressed="${st === k}">${l}</button>`).join("")}</div></div>
    ${L ? `<p class="hint">In your library as <button class="linkbtn" data-act="open" data-id="${esc(lid)}">${esc(titleOf(L))}</button> (${esc(statusWord(L.status, "book"))}). Marking it here updates it there too.</p>` : `<div class="bar"><button class="btn sm" data-act="pw-tolib">Add to my library</button><input class="inp" list="pw-libs" placeholder="…or link a book you already have" data-pwlink="1" style="flex:1"><datalist id="pw-libs">${lib.map(x => `<option value="${esc(titleOf(x))} · ${esc(MEDIA[x.medium].one)}">`).join("")}</datalist></div>`}
    <div class="pwcols">
      <div><p class="label">Starts once</p>${(b.after || []).length ? `<ul class="pwconds">${b.after.map((c, i) => `<li class="${pwMet(P, c) ? "met" : ""}">${pwMet(P, c) ? "✓" : "○"} ${esc(pwCondText(P, c))} <button class="linkbtn" data-act="pw-cond-del" data-k="${i}" aria-label="Remove">✕</button></li>`).join("")}</ul>` : `<p class="hint">Nothing: start it any time.</p>`}
        <div class="bar">${selOf("pw-cond-k", [["", "Add: once…"], ...others.map(x => [x.id, pwLabel(x)])], "")}${selOf("pw-cond-s", [["start", "is underway"], ["done", "is done"], ...(others.filter(x => x.parts).length ? [["part", "part 1 is done"]] : [])], "start")}<button class="btn sm" data-act="pw-cond-add">Add</button></div></div>
      <div><p class="label">Unlocks</p>${un.length ? `<ul class="pwconds">${un.map(x => `<li><button class="linkbtn" data-act="pw-book" data-k="${esc(x.id)}">${esc(pwLabel(x))}</button></li>`).join("")}</ul>` : `<p class="hint">Nothing waits on this one.</p>`}</div>
    </div>
    <p class="label">Parts</p><div class="topics">${(b.parts || []).map((x, i) => `<label class="topic${pwPartDone(b, i) ? " on" : ""}"><input type="checkbox" data-pwpart="${i}" ${pwPartDone(b, i) ? "checked" : ""}>${esc(x.t)}<button class="linkbtn" data-act="pw-part-del" data-k="${i}" aria-label="Remove">✕</button></label>`).join("")}<input class="inp" placeholder="+ part or chapter" data-pwpartadd="1" style="max-width:220px"></div>
    <p class="label">Notes</p><textarea class="inp" data-pwb="note" rows="3" placeholder="What to watch out for, which exercises, where you are">${esc(b.note || "")}</textarea>
    <details${m.edit ? " open" : ""}><summary class="hint">Edit</summary><div class="pwedit">
      <label class="ctl">Title <input class="inp" data-pwb="t" value="${esc(b.t)}"></label><label class="ctl">Author <input class="inp" data-pwb="a" value="${esc(b.a || "")}"></label><label class="ctl">Year <input class="inp" data-pwb="year" value="${esc(b.year || "")}" style="width:80px"></label>
      <label class="ctl">Module ${selOf("", [["", "None"], ...(P.modules || []).map(x => [x.id, [x.code, x.name].filter(Boolean).join(" ")])], b.mod || "", 'data-pwbmod="1"')}</label>
      <label class="ctl">Thread <input class="inp" data-pwb="th" value="${esc(b.th || "")}" placeholder="its module, by default"></label>
      <label class="ctl"><input type="checkbox" data-pwbc="opt" ${b.opt ? "checked" : ""}> Optional</label><label class="ctl"><input type="checkbox" data-pwbc="ref" ${b.ref ? "checked" : ""}> Reference only</label><label class="ctl"><input type="checkbox" data-pwbc="free" ${b.free ? "checked" : ""}> Free online</label><label class="ctl"><input type="checkbox" data-pwbc="top" ${b.top ? "checked" : ""}> ★ Crème de la crème</label><label class="ctl"><input type="checkbox" data-pwbc="self" ${b.self ? "checked" : ""}> Best for self-study</label>
      ${m.confirm ? `<button class="btn sm danger" data-act="pw-rm-yes">Remove from path</button><button class="btn sm ghost" data-act="pw-rm-no">Keep</button>` : `<button class="btn sm ghost danger" data-act="pw-rm">Remove from path</button>`}</div></details></div>`;
};
