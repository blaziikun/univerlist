// src/features/core/modals.js
// ─────────────────────────────────────────────────────────────────
//  Overlays
// ─────────────────────────────────────────────────────────────────

let lastFocus = null;
function openModal(kind, data = {}) {
    if (!ui.modal) lastFocus = document.activeElement;
    ui.modal = { kind, ...data };
    renderOverlay(true);
}
function closeModal() {
    const m = ui.modal;
    if (m && m.ctl) m.ctl.abort();
    ui.modal = null;
    $("#overlay").innerHTML = "";
    if (lastFocus && lastFocus.focus && document.body.contains(lastFocus)) lastFocus.focus();
}
function overlayTyping() {
    const a = document.activeElement;
    return a && $("#overlay").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
}
const MODALS = {};
function renderOverlay(focus) {
    const m = ui.modal,
        ov = $("#overlay");
    if (!m) {
        ov.innerHTML = "";
        return;
    }
    if (m.kind === "item" && !items.has(m.id)) {
        closeModal();
        return;
    }
    if (m.kind === "palette") {
        ov.innerHTML = `<div class="scrim" data-act="close"></div><div class="palette" role="dialog" aria-modal="true" aria-label="Commands">${paletteHTML(m)}</div>`;
        const i = $("#pal-q");
        if (i) {
            i.focus();
            i.setSelectionRange(i.value.length, i.value.length);
        }
        return;
    }
    const fn = MODALS[m.kind];
    const active = document.activeElement && document.activeElement.id,
        prev = ov.querySelector(".modal"),
        st = prev ? prev.scrollTop : 0;
    ov.innerHTML = `<div class="scrim" data-act="close"></div><div class="modal${["item", "discover", "io", "covers", "add", "char", "favedit", "anilist", "profile-edit", "person", "paste", "csvmap", "coverpick", "lcimport", "smartmatch"].includes(m.kind) ? " wide" : ""}" role="dialog" aria-modal="true">${fn ? fn(m) : ""}</div>`;
    const md = ov.querySelector(".modal");
    if (!focus) md.scrollTop = st;
    if (focus) {
        const f = ov.querySelector("[autofocus]") || ov.querySelector(".x");
        f && f.focus({ preventScroll: true });
        md.scrollTop = 0;
    } else if (active) {
        const a = document.getElementById(active);
        if (a) a.focus({ preventScroll: true });
    }
}
const head = (t, extra = "") =>
    `<div class="mhead"><h3>${t}</h3>${extra}<button class="x" data-act="close" aria-label="Close">Close ✕</button></div>`;
const opt = (arr, v) =>
    arr
        .map(x => {
            const [k, l] = Array.isArray(x) ? x : [x, x];
            return `<option value="${esc(k)}"${String(k) === String(v ?? "") ? " selected" : ""}>${esc(l)}</option>`;
        })
        .join("");

const sec = (label, text) => (text ? `<div class="sec"><p class="label">${label}</p><p>${esc(text)}</p></div>` : "");
// short descriptions so a genre says what it means
const GENRE_DESC = {
    Fantasy: "Magic, invented worlds or the impossible treated as real.",
    "Science Fiction": "Stories built on science, technology or the future.",
    Dystopian: "A society gone wrong, usually by design.",
    Mystery: "A puzzle, usually a crime, solved over the story.",
    Thriller: "Suspense and danger; the pressure keeps rising.",
    Crime: "Criminals, investigators and the law.",
    Horror: "Built to unsettle or frighten.",
    Romance: "A relationship at the centre, with an emotionally satisfying end.",
    "Historical Fiction": "Invented stories set in a real past.",
    "Literary Fiction": "Character and language first; plot second.",
    Contemporary: "Set in the present-day, everyday world.",
    "Young Adult": "Teen protagonists and coming-of-age concerns.",
    Classics: "Long-lasting, widely studied works.",
    Adventure: "Journeys, quests and physical stakes.",
    Humor: "Written mainly to amuse.",
    "Magical Realism": "The ordinary world with one or two quietly magical things.",
    Mythology: "Myths, legends and folklore, retold or reimagined.",
    Paranormal: "Ghosts, psychics and the supernatural in the real world.",
    "Short Stories": "Collections of shorter pieces.",
    Poetry: "Verse.",
    "Graphic Novels": "Book-length comics.",
    Biography: "Someone's life, told by someone else.",
    Memoir: "A life, or part of it, told by the person who lived it.",
    History: "What happened and why.",
    Philosophy: "Questions about knowledge, mind, ethics and existence.",
    Psychology: "How minds and behaviour work.",
    Science: "Explaining the natural world.",
    Mathematics: "Proofs, problems and mathematical ideas.",
    "Self Help": "Practical advice for changing your own life.",
    Religion: "Faith, theology and spiritual practice.",
    Politics: "Power, government and policy.",
    Economics: "Markets, money and incentives.",
    Business: "Companies, work and management.",
    Technology: "Computing and how technology changes things.",
    Nature: "Animals, ecology and the outdoors.",
    "True Crime": "Real crimes, investigated.",
    Essays: "Short non-fiction pieces with a point of view.",
    Action: "Fights, chases and set pieces drive it.",
    Comedy: "Played for laughs.",
    Drama: "Serious, character-driven conflict.",
    "Slice of Life": "Everyday moments, little plot.",
    "Sci-Fi": "Science fiction: technology, space or the future.",
    Supernatural: "Spirits, curses and powers beyond nature.",
    Psychological: "Inside a character's head: perception, manipulation, breakdown.",
    Mecha: "Giant robots and their pilots.",
    Sports: "Training, rivals and competition.",
    Music: "Musicians and performance.",
    Ecchi: "Suggestive fan service.",
    "Mahou Shoujo": "Magical girls.",
    Isekai: "Transported to (or reborn in) another world.",
    Shounen: "Aimed at teen boys: action, growth, rivals.",
    Seinen: "Aimed at adult men: often darker or more complex.",
    Shoujo: "Aimed at teen girls: relationships and feelings.",
    Josei: "Aimed at adult women.",
    Animation: "Animated rather than live action.",
    Documentary: "Real events and people.",
    Family: "Made for all ages.",
    War: "Soldiers, battles and what war does.",
    Western: "The American frontier.",
    RPG: "Role-playing: stats, choices and a character who grows.",
    Shooter: "Aim and shoot.",
    Platformer: "Running and jumping through levels.",
    Puzzle: "Solve it to progress.",
    Strategy: "Plan, manage and outthink.",
    Indie: "Made by small independent teams.",
    Simulation: "Model a real activity or system.",
    Racing: "Speed and vehicles.",
    Fighting: "One-on-one combat.",
    "Visual Novel": "Story told through text, art and choices.",
};
const genreTip = g => (GENRE_DESC[g] ? ` title="${esc(GENRE_DESC[g])}"` : "");
function similarTo(b, n = 8) {
    const g = new Set([...(b.genres || []), ...(b.themes || [])].map(norm));
    if (!g.size) return [];
    const linked = new Set((b.links || []).map(l => l.id));
    return all()
        .filter(x => x.id !== b.id && !linked.has(x.id))
        .map(x => {
            const xs = [...(x.genres || []), ...(x.themes || [])].map(norm);
            const shared = xs.filter(v => g.has(v)).length;
            return {
                x,
                s:
                    shared / Math.sqrt(g.size * Math.max(1, xs.length)) +
                    (x.medium !== b.medium ? 0.15 : 0) +
                    (x.rating >= 8 ? 0.1 : 0),
                shared,
            };
        })
        .filter(r => r.shared >= 2)
        .sort((a, c) => c.s - a.s)
        .slice(0, n);
}
function connectTab(b, m) {
    const links = (b.links || []).filter(l => items.has(l.id));
    const byType = {};
    for (const l of links) (byType[l.type] = byType[l.type] || []).push(l);
    const byAl = new Map();
    for (const [id, x] of items) if (x.ext && x.ext.anilist) byAl.set(x.ext.anilist, id);
    const rel = b.rel || [];
    const creator = b.creator
        ? all()
              .filter(
                  x =>
                      x.id !== b.id &&
                      x.creator &&
                      surname(x.creator) === surname(b.creator) &&
                      norm(firstAuthor(x.creator)) === norm(firstAuthor(b.creator))
              )
              .slice(0, 10)
        : [];
    const sim = similarTo(b);
    const opts = all()
        .filter(x => x.id !== b.id)
        .sort((a, c) => titleOf(a).localeCompare(titleOf(c)))
        .map(x => `<option value="${esc(titleOf(x))} · ${esc(MEDIA[x.medium].one)}">`)
        .join("");
    return `<div class="sec"><p class="label">Linked in your stacks</p>
      ${
          links.length
              ? Object.entries(byType)
                    .map(
                        ([t, ls]) =>
                            `<div class="lgroup"><span class="hint">${esc(LINK_NAME[t] || t)}</span>${ls
                                .map(l => {
                                    const x = { id: l.id, ...items.get(l.id) };
                                    return `<div class="lrow">${coverHTML(x)}<button class="t" data-act="open" data-id="${esc(l.id)}">${mDot(x.medium)}${esc(titleOf(x))}</button><span class="hint">${esc(MEDIA[x.medium].one)}${l.note ? " · " + esc(l.note) : ""}${l.auto ? " · from AniList" : ""}</span><button class="linkbtn" data-act="unlink" data-k="${esc(l.id)}">unlink</button></div>`;
                                })
                                .join("")}</div>`
                    )
                    .join("")
              : `<p class="hint">Nothing linked yet. Link the book a show is based on, the game set in the same world, or anything that feels the same.</p>`
      }
      <div class="bar" style="margin-top:8px"><input class="inp" id="lk-target" list="lk-opts" placeholder="Link to…" style="max-width:280px"><datalist id="lk-opts">${opts}</datalist>
        <select class="sel" id="lk-type">${opt(LINK_TYPES, "adaptation")}</select><input class="inp" id="lk-note" placeholder="Note (optional)" style="max-width:180px"><button class="btn sm gold" data-act="link-add">Link</button></div></div>
    <div class="sec"><p class="label">Franchise</p><div class="bar"><input class="inp" id="franchise" value="${esc(b.franchise || "")}" placeholder="e.g. Monogatari, The Witcher, Grishaverse" style="max-width:280px"><span class="hint">Everything with the same franchise name, or linked as adaptation, sequel or same world, is grouped on the Franchises page.</span></div></div>
    ${
        rel.length
            ? `<div class="sec"><p class="label">Related on AniList</p><div class="rels">${rel
                  .map(r => {
                      const inId = byAl.get(r.id);
                      return `<div class="rel">${r.cover ? `<img src="${esc(r.cover)}" alt="" referrerpolicy="no-referrer">` : `<span class="nocov">${esc(MEDIA[r.medium].code)}</span>`}<span><span class="hint">${esc(r.label)} · ${esc(r.kind)}${r.year ? " · " + r.year : ""}</span><span class="t">${esc(r.title)}</span></span>${inId ? `<button class="btn sm" data-act="open" data-id="${esc(inId)}">Open</button>` : `<button class="btn sm" data-act="rel-add" data-k="${r.id}" data-src="${esc(b.id)}">+ Add</button>`}</div>`;
                  })
                  .join("")}</div></div>`
            : ""
    }
    ${
        m.adapt
            ? `<div class="sec"><p class="label">Adaptations on Wikidata</p>${m.adapt.length ? `<div class="rels">${m.adapt.map((r, i) => `<div class="rel"><span class="nocov">${esc((MEDIA[r.medium] || MEDIA.film).code)}</span><span><span class="hint">${esc(r.dir === "to" ? "Based on" : "Adapted as")} · ${esc(r.desc)}</span><span class="t">${esc(r.title)}</span></span><button class="btn sm" data-act="adapt-add" data-k="${i}">+ Add</button></div>`).join("")}</div>` : `<p class="hint">Wikidata doesn't list any adaptations for this.</p>`}</div>`
            : ["book", "comic", "film", "tv", "game", "manga", "novel"].includes(b.medium)
              ? `<div class="sec"><div class="bar"><button class="btn sm" data-act="adapt-find" ${m.busy ? "disabled" : ""}>${m.busy === "adapt" ? "Looking…" : "Find adaptations on Wikidata"}</button><span class="hint">Films, shows, games and books based on this, or that this is based on.</span></div></div>`
              : ""
    }
    ${creator.length ? `<div class="sec"><p class="label">Same creator in your stacks</p><div class="strip">${creator.map(b => cardHTML(b)).join("")}</div></div>` : ""}
    ${sim.length ? `<div class="sec"><p class="label">Shares the most genres and themes with</p><div class="sims">${sim.map(({ x, shared }) => `<div class="lrow">${coverHTML(x)}<button class="t" data-act="open" data-id="${esc(x.id)}">${mDot(x.medium)}${esc(titleOf(x))}</button><span class="hint">${esc(MEDIA[x.medium].one)} · ${shared} shared</span><button class="linkbtn" data-act="link-similar" data-k="${esc(x.id)}">link as similar</button></div>`).join("")}</div></div>` : ""}`;
}
function artTab(b, m) {
    if (!m.art && !m.busy && (b.artSeen || []).length) {
        m.art = b.artSeen.slice();
        m.artSaved = b.artAt;
    }
    return `<div class="bar"><button class="btn" data-act="find-art" ${m.busy ? "disabled" : ""}>${m.busy === "art" ? "Searching…" : m.art ? "Search again" : "See all artwork"}</button>
      <button class="btn" data-act="cover-photo">Upload a picture</button><input class="inp" id="art-url" placeholder="…or paste an image link" style="max-width:240px"><button class="btn sm" data-act="art-url">Use link</button>
      ${coverSrc(b) ? `<button class="btn" data-act="frame-open" data-src="${esc(b.coverData || b.cover)}" data-k='${esc(JSON.stringify({ t: "cover", id: b.id }))}'>Adjust framing</button><button class="btn ghost" data-act="uncover">Remove cover</button>` : ""}${b.coverData && b.cover ? `<button class="btn ghost" data-act="cover-original">Use the original</button>` : ""}</div>
    <div class="spinerow">${b.spineArt ? `<span class="spinepv" style="background-image:url('${esc(coverCache.src(b.spineArt)).replace(/'/g, "%27")}')" title="Its spine"></span>` : ""}<span class="hint">${b.spineArt ? (b.spinePicked ? "Your own spine." : "A real spine scan.") : "The spine on the shelf is cut from the cover."}</span>
      <button class="btn sm" data-act="spine-upload">Upload a spine…</button>${b.spineArt ? `<button class="btn sm ghost" data-act="spine-clear">Cut it from the cover instead</button>` : ""}<span class="hint">or use any picture below as the spine.</span></div>
    <p class="hint">Paste an image while this card is open to use it as the cover. Pictures you choose are never replaced by syncs.</p>
    ${m.busy === "art" ? `<p class="think">${esc(m.status || "Searching every source…")}</p>` : ""}
    ${
        m.art
            ? m.art.length
                ? `<p class="label">Artwork (${m.art.length})${m.artSaved ? ` <span class="hint">· saved from your last search, ${esc(ago(m.artSaved))}</span>` : ""}</p><div class="covergrid">${m.art
                      .map(
                          (
                              c,
                              i
                          ) => `<div class="cg${b.cover === c.cover ? " on" : ""}${c.wide ? " wide" : ""}"><img src="${esc(c.cover)}" alt="${esc(c.label)}" loading="lazy" referrerpolicy="no-referrer"><span>${esc(c.label)}</span>
        <span class="cgb"><button class="btn sm" data-act="pick-art" data-k="${i}" data-as="cover">Cover</button>${c.wide ? `<button class="btn sm" data-act="pick-art" data-k="${i}" data-as="banner">Banner</button>` : ""}<button class="btn sm" data-act="pick-art" data-k="${i}" data-as="fav">Favourite pic</button><button class="btn sm" data-act="pick-art" data-k="${i}" data-as="spine">Spine</button></span></div>`
                      )
                      .join("")}</div>`
                : `<p class="hint">No artwork found. Upload a picture instead.</p>`
            : ""
    }`;
}
function editFieldsHTML(d, p) {
    const med = d.medium || "book",
        M = MEDIA[med],
        words = STATUS_WORDS[M.group];
    const subjList = [
        ...new Set([
            ...SUBJECT_ORDER.filter(s => !FICTION_LANES.includes(s)),
            ...[...items.values()].map(b => b.subject).filter(Boolean),
        ]),
    ];
    const cl = {
        book: "Author",
        manga: "Author",
        manhwa: "Author",
        novel: "Author",
        comic: "Writer / artist",
        anime: "Studio",
        tv: "Network or creator",
        film: "Director",
        game: "Developer",
        album: "Artist",
    }[med];
    const book = med === "book";
    return `<div class="fields">
    <div class="field full"><label for="${p}title">Title</label><input id="${p}title" value="${esc(d.title || "")}" ${p === "a-" ? "" : "autofocus"}></div>
    <div class="field"><label for="${p}creator">${cl}</label><input id="${p}creator" value="${esc(d.creator || "")}"></div>
    <div class="field"><label for="${p}medium">Medium</label><select id="${p}medium">${opt(
        MEDIA_KEYS.map(k => [k, MEDIA[k].name]),
        med
    )}</select></div>
    <div class="field"><label for="${p}kind">Type</label><input id="${p}kind" list="${p}kinds" value="${esc(d.kind || "")}" placeholder="${esc(KINDS[med][0])}"><datalist id="${p}kinds">${kindsOf(
        med
    )
        .map(k => `<option value="${esc(k)}">`)
        .join("")}</datalist></div>
    <div class="field"><label for="${p}status">Status</label><select id="${p}status">${opt(
        STATUS.map(k => [k, words[k]]),
        d.status || "want"
    )}</select></div>
    <div class="field"><label for="${p}year">Year</label><input id="${p}year" inputmode="numeric" value="${esc(d.year || "")}"></div>
    ${med !== "film" ? `<div class="field"><label for="${p}total">${med === "game" ? "Hours to beat" : esc(M.unit[1].charAt(0).toUpperCase() + M.unit[1].slice(1))}</label><input id="${p}total" inputmode="numeric" value="${esc(d.total || "")}"></div>` : ""}
    ${["anime", "tv", "film"].includes(med) ? `<div class="field"><label for="${p}runtime">${med === "film" ? "Runtime (min)" : "Minutes per episode"}</label><input id="${p}runtime" inputmode="numeric" value="${esc(d.runtime || "")}"></div>` : ""}
    ${["manga", "manhwa", "novel", "comic"].includes(med) ? `<div class="field"><label for="${p}vols">Volumes</label><input id="${p}vols" inputmode="numeric" value="${esc(d.vols || "")}"></div>` : ""}
    <div class="field"><label for="${p}copy">Ownership</label><select id="${p}copy">${opt(
        COPY.map(([k]) => [k, ownWord(d, k)]),
        d.copy || "none"
    )}</select></div>
    <div class="field"><label for="${p}genres">Genres</label><input id="${p}genres" value="${esc((d.genres || []).join(", "))}" placeholder="Comma separated"></div>
    <div class="field"><label for="${p}franchise">Franchise</label><input id="${p}franchise" value="${esc(d.franchise || "")}"></div>
    <div class="field"><label for="${p}chrono">Place in the story</label><input id="${p}chrono" inputmode="decimal" value="${esc(d.chrono ?? "")}" placeholder="for story order (1, 2, 2.5…)"></div>
    ${
        book
            ? `<div class="field"><label for="${p}subject">Subject</label><input id="${p}subject" list="subj-list" value="${esc(d.subject || "")}" placeholder="For academic and non-fiction"><datalist id="subj-list">${subjList.map(s => `<option value="${esc(s)}">`).join("")}</datalist></div>
      <div class="field"><label for="${p}format">Length</label><select id="${p}format"><option value="">Unknown</option>${opt(FORMATS, d.format || "")}</select></div>
`
            : ""
    }${
        ["book", "novel", "comic", "manga", "manhwa"].includes(med)
            ? `<div class="field"><label for="${p}series">Series</label><input id="${p}series" list="series-l" value="${esc(d.series || "")}" placeholder="e.g. The Stormlight Archive"><datalist id="series-l">${[...new Set([...items.values()].map(x => x.series).filter(Boolean))].map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
      <div class="field"><label for="${p}seriesNo">Number in series</label><input id="${p}seriesNo" inputmode="decimal" value="${esc(d.seriesNo || "")}" placeholder="1"></div>`
            : ""
    }
    <div class="field full"><label for="${p}about">What it is</label><textarea id="${p}about">${esc(d.about || "")}</textarea></div>
    <div class="field full"><label for="${p}why">Why it's for you</label><textarea id="${p}why">${esc(d.why || "")}</textarea></div>
    <div class="field full"><label for="${p}cw">Content note</label><input id="${p}cw" value="${esc(d.cw || "")}"></div>
  </div>`;
}
function readFields(p) {
    const el = k => document.getElementById(p + k),
        v = k => {
            const e = el(k);
            return e ? e.value.trim() : undefined;
        };
    const num = k => {
        const s = v(k);
        if (s === undefined) return undefined;
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : null;
    };
    const out = {
        title: v("title"),
        creator: v("creator"),
        medium: v("medium"),
        kind: v("kind"),
        status: v("status"),
        year: num("year"),
        total: num("total"),
        runtime: num("runtime"),
        vols: num("vols"),
        copy: v("copy"),
        genres:
            v("genres") !== undefined
                ? v("genres")
                      .split(",")
                      .map(s => s.trim())
                      .filter(Boolean)
                : undefined,
        franchise: v("franchise"),
        subject: v("subject"),
        format: v("format"),
        series: v("series"),
        seriesNo: num("seriesNo"),
        chrono: num("chrono"),
        about: v("about"),
        why: v("why"),
        cw: v("cw"),
    };
    if (out.medium === "book" && out.kind !== undefined)
        out.shelf = out.kind === "Academic" ? "academic" : out.kind === "Non-fiction" ? "nonfiction" : "fiction";
    return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined));
}
const SRC_NAME = {
    anilist: "AniList",
    tmdb: "TMDB",
    tvmaze: "TVmaze",
    rawg: "RAWG",
    wikidata: "Wikidata",
    ol: "Open Library",
    gb: "Google Books",
    jikan: "MyAnimeList",
};
// the medium and type a new entry starts with, from the mode you're in
function addDefaults() {
    const mode = curMode(),
        sh = ui.shelfKey && shelvesOf(mode).find(s => s.key === ui.shelfKey);
    const pats =
        Array.isArray(mode.shelves) && sh
            ? (mode.shelves[Number(ui.shelfKey.slice(1))] || {}).match || []
            : mode.match || ["*"];
    const pos = pats.filter(p => p !== "*" && !p.startsWith("!"));
    if (!pos.length) return { medium: "book", kind: "Novel" };
    const [medium, kind] = pos[0].split(":");
    return {
        medium: MEDIA[medium] ? medium : "book",
        kind: kind !== undefined ? kind : medium === "book" ? "Novel" : "",
    };
}

// the "already have it" mark on a search result: in this medium, or the same show filed as anime / TV
function candMark(c, med) {
    if (findExisting(c.title, c.creator, c.medium, c.ext)) return `<span class="pill own">In your library</span>`;
    const sib = findSibling(c.title, c.medium || med, c.year);
    return sib ? `<span class="pill own">In your library as ${esc(MEDIA[items.get(sib).medium].one)}</span>` : "";
}
// ── add anything ──
MODALS.add = function (m) {
    const d = m.draft || {},
        med = m.medium || "book";
    const privBox = vault.key
        ? `<label class="ctl"><input type="checkbox" id="a-private" ${m.private ? "checked" : ""}> 🔒 Private</label>`
        : "";
    if (m.step === "review")
        return (
            head("Add " + esc(MEDIA[d.medium || med].one)) +
            (m.busy ? `<p class="think">Filling in the details…</p>` : "") +
            `
    <div class="bar"><div style="width:84px">${coverHTML({ ...d, cover: m.cover || d.cover || "", coverData: m.coverData || "" })}</div>
      <div class="bar"><button class="btn" data-act="add-cover">${d.cover || m.coverData ? "Use my own picture instead" : "Add a picture"}</button>${d.src ? `<span class="hint">From ${esc(SRC_NAME[d.src] || d.src)}</span>` : ""}</div></div>
    ${findExisting(d.title || "", d.creator || "", d.medium, d.ext) ? `<p class="err">This is already in your library.</p>` : (sib => (sib ? `<p class="err">The same show is already in your library as ${esc(MEDIA[items.get(sib).medium].one)}. Adding it again makes a second entry.</p>` : ""))(findSibling(d.title || "", d.medium || med, d.year))}
    ${editFieldsHTML(d, "a-")}
    <div class="bar"><label class="ctl">Your score <input class="inp" id="a-rating" inputmode="decimal" style="width:60px" placeholder="/${scoreMax()}"></label><label class="ctl"><input type="checkbox" id="a-buy"> Plan to buy</label><label class="ctl"><input type="checkbox" id="a-queue"> Add to Up next</label><label class="ctl"><input type="checkbox" id="a-fav"> Favourite</label>${privBox}</div>
    <div class="bar"><button class="btn gold" data-act="add-save">Add</button><button class="btn ghost" data-act="add-back">Back</button></div>
    ${m.error ? `<p class="err">${esc(m.error)}</p>` : ""}`
        );
    return (
        head(m.private ? "Add a private entry" : "Add anything") +
        `
    <div class="chips mchips" role="group" aria-label="Medium">${MEDIA_KEYS.map(k => `<button class="chip" data-act="add-medium" data-k="${k}" aria-pressed="${med === k}"><span class="mg">${esc(MEDIA[k].g)}</span>${esc(MEDIA[k].name)}</button>`).join("")}</div>
    <div class="fields"><div class="field full"><label for="a-q">${med === "book" ? "Title, author or ISBN" : "Title"}</label><input id="a-q" autofocus placeholder="${esc({ book: "e.g. The Tainted Cup", manga: "e.g. Vagabond", manhwa: "e.g. Solo Leveling", novel: "e.g. Mushoku Tensei", comic: "e.g. Saga", anime: "e.g. Frieren", tv: "e.g. White Collar", film: "e.g. The Prestige", game: "e.g. Persona 5", album: "e.g. OK Computer, or Radiohead OK Computer" }[med])}" value="${esc(m.q || "")}"></div>
      <div class="field"><label for="a-kind">Type</label><select id="a-kind"><option value="">Decide from the source</option>${kindsOf(
          med
      )
          .map(k => `<option${m.ikind === k ? " selected" : ""}>${esc(k)}</option>`)
          .join("")}</select></div></div>
    <div class="bar"><button class="btn gold" data-act="add-search" ${m.busy ? "disabled" : ""}>${m.busy ? "Searching…" : "Search " + esc(sourceFor(med))}</button><button class="btn ghost" data-act="add-manual">Enter it myself</button>${privBox}
      ${["film", "tv", "game"].includes(med) && !(med === "game" ? KEYS.rawg || IGDB_ON() : TMDB_ON()) ? `<span class="hint">Add a free ${med === "game" ? "RAWG" : "TMDB"} key in Settings for posters, cast and better matches.</span>` : ""}</div>
    ${m.error ? `<p class="err">${esc(m.error)}</p>` : ""}
    ${m.results ? (m.results.length ? `<div class="cands">${m.results.map((c, i) => `<button class="cand" data-act="add-pick" data-k="${i}">${c.cover ? `<img src="${esc(c.cover)}" alt="" referrerpolicy="no-referrer">` : `<span class="nocov">No picture</span>`}<span class="t">${esc(c.title)}</span><span class="hint">${esc([c.kind || MEDIA[c.medium || med].one, c.year, c.total && ["anime", "tv"].includes(c.medium || med) ? c.total + " eps" : "", c.creator].filter(Boolean).join(" · "))}</span>${candMark(c, med)}</button>`).join("")}</div>` : `<p class="hint">No matches. Try fewer words, or enter it yourself.</p>`) : ""}`
    );
};

// ── pick for me (by how much time you have) ──
MODALS.pick = function (m) {
    m.time = m.time || "short";
    m.media = m.media || [];
    m.own = m.own ?? false;
    const fits = b => {
        const ep = b.runtime || minutesPerUnit(b),
            left = b.total ? Math.max(0, b.total - (b.prog || 0)) : null;
        switch (m.time) {
            case "short":
                return (
                    (["anime", "tv"].includes(b.medium) && ep <= 35) ||
                    ["manga", "manhwa", "novel", "comic"].includes(b.medium) ||
                    (b.medium === "book" && (b.status === "active" || b.format === "Short"))
                );
            case "hours":
                return b.medium === "film"
                    ? (b.runtime || 115) <= 150
                    : ["anime", "tv"].includes(b.medium) ||
                          b.medium === "game" ||
                          b.medium === "book" ||
                          ["manga", "manhwa", "novel"].includes(b.medium);
            case "evening":
                return (
                    b.medium === "film" ||
                    b.medium === "game" ||
                    (["anime", "tv"].includes(b.medium) && (left == null || left * ep <= 360)) ||
                    b.medium === "book"
                );
            default:
                return (
                    b.medium === "book" ||
                    b.medium === "game" ||
                    (["anime", "tv"].includes(b.medium) && (left == null || left * ep <= 1200)) ||
                    ["manga", "manhwa", "novel"].includes(b.medium)
                );
        }
    };
    const present = CATS.filter(c => modeItems().some(b => catOf(b) === c[0]));
    const pool = modeItems().filter(
        b =>
            ["want", "active", "paused"].includes(b.status) &&
            (!m.media.length || m.media.includes(catOf(b))) &&
            (!m.own || b.copy !== "none") &&
            fits(b)
    );
    const score = b =>
        (b.status === "active" ? 3 : b.status === "paused" ? 1 : 0) +
        (meta.queue.includes(b.id) ? 2 - meta.queue.indexOf(b.id) * 0.1 : 0) +
        ((b.welo || 1500) - 1500) / 100 +
        (b.fav ? 0.5 : 0) +
        (crowd(b).avg || 60) / 100 +
        (b.copy !== "none" ? 0.3 : 0) +
        (m.shuffle ? Math.random() * 2 : 0);
    pool.sort((a, b) => score(b) - score(a));
    const top = pool[0],
        rest = pool.slice(1, 7);
    const why = b =>
        b.status === "active"
            ? `You're ${pct(b) ? pct(b) + "% " : ""}through it: ${progText(b)}.`
            : meta.queue.includes(b.id)
              ? `It's #${meta.queue.indexOf(b.id) + 1} in Up next.`
              : b.why || b.about || "";
    return (
        head("Pick for me") +
        `
    <div class="bar"><span class="hint" style="width:90px">I have</span><div class="seg">${[
        ["short", "25 minutes"],
        ["hours", "An hour or two"],
        ["evening", "An evening"],
        ["weekend", "A weekend"],
    ]
        .map(([k, l]) => `<button data-act="pick-time" data-k="${k}" aria-pressed="${m.time === k}">${l}</button>`)
        .join("")}</div></div>
    ${present.length > 1 ? `<div class="bar"><span class="hint" style="width:90px">In the mood for</span><div class="chips">${present.map(s => `<button class="chip" data-act="pick-media" data-k="${s[0]}" aria-pressed="${m.media.includes(s[0])}">${esc(s[1])}</button>`).join("")}</div></div>` : ""}
    <div class="bar"><label class="ctl"><input type="checkbox" data-act="pick-own" ${m.own ? "checked" : ""}> Only things I own</label><button class="btn sm ghost" data-act="pick-shuffle">Shuffle</button></div>
    ${
        top
            ? `<div class="pick-top">${coverHTML(top)}<div><p class="label">${MEDIA[top.medium].g} ${esc(top.kind || MEDIA[top.medium].one)}</p><div class="ptitle">${esc(titleOf(top))}</div><div class="hint">${esc(top.creator || "")}${crowd(top).avg ? " · crowd " + crowd(top).avg : ""}</div><p style="margin:8px 0 0">${esc(why(top).slice(0, 260))}</p>
      <div class="bar" style="margin-top:10px"><button class="btn gold" data-act="open" data-id="${esc(top.id)}">Open</button>${top.status !== "active" ? `<button class="btn" data-act="start" data-id="${esc(top.id)}">${esc(verbOf(top.medium)[0])}</button>` : ""}</div></div></div>
      <div class="mini">${rest.map(b => `<button data-act="open" data-id="${esc(b.id)}"><span class="t">${mDot(b.medium)}${esc(titleOf(b))}</span><span class="hint">${esc(b.status === "active" ? progText(b) : b.kind || MEDIA[b.medium].one)}</span></button>`).join("")}</div>`
            : `<p class="hint">Nothing fits. Try another amount of time${present.length > 1 ? " or more media" : ""}.</p>`
    }`
    );
};
MODALS.setpage = function (m) {
    const b = items.get(m.id),
        [one] = unitOf(b);
    return (
        head(`Where are you in ${esc(cleanTitle(titleOf(b)))}?`) +
        `<div class="bar"><label class="ctl">${esc(one.charAt(0).toUpperCase() + one.slice(1))} <input class="inp" id="sp-page" inputmode="decimal" autofocus style="width:100px" value="${b.prog || 0}"></label>${b.total ? `<span class="hint">of ${b.total}</span>` : ""}
    ${b.medium === "book" ? `<select class="sel" id="sp-lane"><option value="">Where?</option>${LANES.map(([k, l]) => `<option value="${k}"${b.lane === k ? " selected" : ""}>${l}</option>`).join("")}</select>` : ""}<button class="btn gold" data-act="sp-save">Log</button></div>`
    );
};

// ── AniList sync ──
MODALS.anilist = function () {
    const s = meta.settings,
        c = alSync.counts,
        al = meta.profile.anilist;
    return (
        head("AniList") +
        `
    <p>Bring in your anime and manga lists (including manhwa and light novels), scores, progress, dates, rewatches, custom lists as tags, favourites, favourite characters, staff and studios, and your watch-time stats. Related works become links, so franchises join up on their own.</p>
    <div class="bar"><label class="ctl">AniList username <input class="inp" id="al-user" value="${esc(s.anilistUser || "")}" style="width:200px" ${alSync.running ? "disabled" : ""}></label>
      ${alSync.running ? `<button class="btn" data-act="al-stop">Stop</button>` : `<button class="btn gold" data-act="al-sync">${al ? "Sync now" : "Import"}</button>`}</div>
    ${alSync.running ? `<p class="think">${esc(alSync.msg || "Working…")}</p>${alSync.total ? `<div class="progress"><span style="width:${Math.round((alSync.done / alSync.total) * 100)}%"></span></div>` : ""}<p class="hint">AniList is limiting requests at the moment, so a big list takes a few minutes. You can close this; it keeps going.</p>` : ""}
    ${alSync.error ? `<p class="err">${esc(alSync.error.charAt(0).toUpperCase() + alSync.error.slice(1))}</p>` : ""}
    ${c && !alSync.running ? `<p class="hint">Last sync: ${c.added} added, ${c.updated} updated, ${c.chars} new characters.</p>` : ""}
    ${(alSync.warnings || []).length && !alSync.running ? `<p class="err">AniList's servers kept erroring on: ${esc([...new Set(alSync.warnings)].join(", "))}. Everything else came in. Sync again later to fill these in.</p>` : ""}
    ${al ? `<p class="hint">Connected to <a href="${esc(safeUrl(al.url))}" target="_blank" rel="noopener">${esc(al.name)}</a>, synced ${esc(ago(al.syncedAt))}. Your lists must be public on AniList for this to work.</p>` : `<p class="hint">Your AniList lists need to be public (they are unless you changed it in AniList's settings).</p>`}`
    );
};

// ── characters ──
MODALS.char = function (m) {
    const c = meta.chars.find(x => x.id === m.id);
    if (!c) return head("Character") + `<p class="hint">This character was removed.</p>`;
    const img = charImg(c),
        gal = charGallery(c);
    const allT = [...new Set(meta.chars.flatMap(x => x.tags || []))].filter(t => !(c.tags || []).includes(t));
    const opts = all()
        .sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
        .map(x => `<option value="${esc(titleOf(x))} · ${esc(MEDIA[x.medium].one)}">`)
        .join("");
    return `<div class="catalog charcat"><div class="navarrows"><button class="x" data-act="close">Close ✕</button></div>
    <div class="left"><div class="charbig">${
        img
            ? `<button class="cview" data-act="char-view" data-k="${Math.max(
                  0,
                  gal.findIndex(g => g.u === img)
              )}" title="View"><img src="${esc(img)}" alt="" referrerpolicy="no-referrer"></button>`
            : `<span class="noimg">${esc(c.name.charAt(0))}</span>`
    }</div>
      <div class="callcard"><span>Rank</span><input class="inp" id="ch-rank" inputmode="numeric" value="${c.rank || ""}" style="width:60px;padding:2px 6px"></div></div>
    <div style="min-width:0"><div class="eyebrow">♟ Character${c.va ? " · " + ((c.media || []).some(x => ["tv", "film"].includes(x.medium)) ? "played by " : "voiced by ") + esc(c.va) : ""}${c.age ? " · " + esc(c.age) : ""}</div>
      <h2><input class="h2in" id="ch-name" value="${esc(c.name)}" aria-label="Name"></h2>${c.native ? `<div class="alt">${esc(c.native)}</div>` : ""}
      <div class="sec" style="margin-top:12px"><p class="label">From</p><div class="bar">${(c.media || []).map((x, i) => (x.id && items.has(x.id) ? `<button class="chip" data-act="open" data-id="${esc(x.id)}">${esc(x.title)}</button>` : `<span class="chip ghostchip">${esc(x.title)}<button class="linkbtn" data-act="char-unfrom" data-k="${i}" aria-label="Remove">✕</button></span>`)).join("")}
        <input class="inp" id="ch-from" list="ch-opts" placeholder="Also appears in…" style="max-width:220px"><datalist id="ch-opts">${opts}</datalist><button class="btn sm" data-act="char-from">Add</button></div></div>
      <div class="sec"><p class="label">Group</p><div class="status-seg wrap">${CHAR_GROUPS.map(g => `<button data-act="char-group" data-k="${g}" aria-pressed="${charGroup(c) === g}">${g}</button>`).join("")}</div></div>
      <div class="sec"><p class="label">Why they're a favourite</p><textarea id="ch-why" placeholder="What draws you to them: the way they think, how they treat people, the arc…">${esc(c.why || "")}</textarea></div>
      <div class="sec"><p class="label">Traits</p><div class="tagedit">${(c.tags || []).map((t, i) => `<span class="tag">${esc(t)}<button data-act="char-untag" data-k="${i}" aria-label="Remove ${esc(t)}">✕</button></span>`).join("")}<input class="inp" id="ch-tag" list="ch-tags" placeholder="e.g. genius, older-sister energy, morally grey"><datalist id="ch-tags">${allT.map(t => `<option value="${esc(t)}">`).join("")}</datalist></div></div>
      <div class="sec"><p class="label">Pictures · ${gal.length}</p><div class="cgal">${gal.map((g, i) => `<div class="cgi${img === g.u ? " on" : ""}"><button class="cgb" data-act="char-pic" data-k="${i}" title="Use this one">${/^data:|^https?:/.test(g.u) ? `<img src="${esc(g.u)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</button><span class="cgk">${g.k === "original" ? "original" : g.k === "upload" ? "yours" : "link"}</span>${g.k !== "original" ? `<button class="cgx" data-act="char-pic-del" data-k="${i}" aria-label="Remove">✕</button>` : ""}</div>`).join("")}
        <button class="cgi add" data-act="char-upload" title="Upload pictures or GIFs">＋</button></div>
        <div class="bar"><input class="inp" id="ch-url" placeholder="Add a picture from a link" style="max-width:260px"><button class="btn sm" data-act="char-url">Add</button>${
            img
                ? `<button class="btn sm" data-act="frame-open" data-src="${esc(img)}" data-k='${esc(JSON.stringify({ t: "char", id: c.id }))}'>Adjust</button><button class="btn sm ghost" data-act="char-view" data-k="${Math.max(
                      0,
                      gal.findIndex(g => g.u === img)
                  )}">View</button>`
                : ""
        }</div><p class="hint">Keep as many as you like (GIFs too) and switch between them; the original from ${c.src === "anilist" ? "AniList" : "its source"} always stays. You can also paste an image while this is open.</p></div>
      ${c.about ? `<div class="sec"><p class="label">About (spoilers removed)</p><p class="hint" style="white-space:pre-wrap">${esc(c.about)}</p></div>` : ""}
      <div class="bar" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><button class="btn gold" data-act="char-save">Save</button><span class="spacer"></span>
        ${charViewerHTML(m)}${m.confirmDelete ? `<span class="err">Remove?</span><button class="btn danger" data-act="char-del-yes">Remove</button><button class="btn ghost" data-act="char-del-no">Keep</button>` : `<button class="btn danger" data-act="char-del">Remove</button>`}</div></div></div>`;
};
// every picture a character has: the original, links you added, pictures you uploaded
function charGallery(c) {
    const out = [],
        seen = new Set(),
        add = (u, k) => {
            if (u && !seen.has(u)) {
                seen.add(u);
                out.push({ u, k });
            }
        };
    add(c.alImage, "original");
    add(c.image, c.alImage ? "link" : "original");
    for (const u of c.images || []) add(u, "link");
    for (const u of c.uploads || []) add(u, "upload");
    if (c.imageData) add(c.imageData, "upload");
    return out;
}
function charViewerHTML(m) {
    const c = meta.chars.find(x => x.id === m.id);
    if (!c || m.view == null) return "";
    const G = charGallery(c),
        i = Math.max(0, Math.min(G.length - 1, m.view)),
        g = G[i];
    if (!g) return "";
    return `<div class="cviewer" data-act="char-view-close"><img src="${esc(g.u)}" alt="" referrerpolicy="no-referrer"><div class="cvbar"><button class="ib" data-act="char-view" data-k="${(i - 1 + G.length) % G.length}" aria-label="Previous">←</button><span>${i + 1} / ${G.length}</span><button class="ib" data-act="char-view" data-k="${(i + 1) % G.length}" aria-label="Next">→</button><button class="btn sm" data-act="char-pic" data-k="${i}">Use this</button></div></div>`;
}
MODALS.charadd = function (m) {
    const from = m.from && items.get(m.from);
    return (
        head("Add a character") +
        `
    <div class="bar"><input class="inp" id="cs-q" autofocus placeholder="Search AniList characters, e.g. Ranpo Edogawa" value="${esc(m.q || "")}" style="max-width:360px"><button class="btn gold" data-act="cs-search" ${m.busy ? "disabled" : ""}>${m.busy ? "Searching…" : "Search"}</button></div>
    ${m.error ? `<p class="err">${esc(m.error)}</p>` : ""}
    ${
        m.results
            ? m.results.length
                ? `<div class="castgrid">${m.results
                      .map(
                          (c, i) =>
                              `<div class="castc">${c.image ? `<img src="${esc(c.image)}" alt="" referrerpolicy="no-referrer">` : `<span class="noimg">${esc(c.name.charAt(0))}</span>`}<span class="t">${esc(c.name)}</span><span class="hint">${esc(
                                  (c.media || [])
                                      .map(x => x.title)
                                      .slice(0, 2)
                                      .join(" · ")
                              )}</span><button class="btn sm" data-act="cs-add" data-k="${i}">${meta.chars.some(x => x.alId === c.alId) ? "♥ Saved" : "♡ Add"}</button></div>`
                      )
                      .join("")}</div>`
                : `<p class="hint">No characters found.</p>`
            : ""
    }
    <div class="sec"><p class="label">Or add one yourself</p><div class="fields"><div class="field"><label for="cm-name">Name</label><input id="cm-name"></div><div class="field"><label for="cm-from">From</label><input id="cm-from" list="cm-opts" value="${from ? esc(titleOf(from)) + " · " + esc(MEDIA[from.medium].one) : ""}"><datalist id="cm-opts">${all()
        .map(x => `<option value="${esc(titleOf(x))} · ${esc(MEDIA[x.medium].one)}">`)
        .join("")}</datalist></div>
      <div class="field full"><label for="cm-img">Picture link (optional)</label><input id="cm-img" placeholder="https://…"></div></div><div class="bar"><button class="btn" data-act="cm-add">Add character</button></div></div>`
    );
};
// favourite: picture and why
MODALS.favedit = function (m) {
    const b = { id: m.id, ...items.get(m.id) };
    return (
        head("Favourite: " + esc(titleOf(b))) +
        `
    <div class="sec"><p class="label">Why it's a favourite</p><textarea id="fv-why" autofocus placeholder="What it did to you, the moment it clicked, why it stays with you…">${esc(b.favWhy || "")}</textarea></div>
    <div class="sec"><p class="label">The picture it shows on your profile</p>
      <div class="bar"><button class="btn" data-act="fv-load" ${m.busy ? "disabled" : ""}>${m.busy ? "Searching…" : m.art ? "Search again" : "Find pictures"}</button><button class="btn" data-act="fv-upload">Upload</button><input class="inp" id="fv-url" placeholder="…or paste an image link" style="max-width:240px"><button class="btn sm" data-act="fv-url">Use link</button>${b.favArt || b.favArtData ? `<button class="btn sm ghost" data-act="fv-clear">Use the cover</button>` : ""}</div>
      <div class="covergrid">${[
          { cover: b.cover, label: "Cover" },
          b.banner ? { cover: b.banner, label: "Banner", wide: true } : null,
          ...(m.art || []),
      ]
          .filter(c => c && c.cover)
          .filter((c, i, a) => a.findIndex(x => x.cover === c.cover) === i)
          .map(
              (c, i) =>
                  `<button class="cg${(b.favArt || b.cover) === c.cover ? " on" : ""}${c.wide ? " wide" : ""}" data-act="fv-pick" data-url="${esc(c.cover)}"><img src="${esc(c.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${esc(c.label)}</span></button>`
          )
          .join("")}</div></div>
    <div class="bar"><button class="btn gold" data-act="fv-save">Save</button></div>`
    );
};
// each mode has its own banner and bio; name and avatar are shared
MODALS["profile-edit"] = function (m) {
    const mode = modeById(m.mode || curMode().id),
        uni = mode.id === "universal",
        p = meta.profile,
        al = p.anilist || {},
        mp = mode.profile || {};
    const cur = uni ? (p.bannerData ? "" : p.banner || al.banner) : mp.bannerData ? "" : mp.banner;
    const banners = modeItems(mode)
        .filter(b => b.banner)
        .sort((a, b) => favPos(a.id) - favPos(b.id) || (b.rating || 0) - (a.rating || 0))
        .slice(0, 18);
    const origin = modeById(m.origin || m.mode || curMode().id),
        scope = m.scope || (uni ? "all" : "mode");
    return (
        head(`Edit profile · ${scope === "all" ? "everywhere" : esc(mode.name) + " only"}`) +
        `
    ${
        origin.id === "universal"
            ? `<p class="hint scopehint">This is your profile everywhere. To give a mode its own, open this from that mode and choose “Only in…”.</p>`
            : `<div class="scopebar"><div class="seg">${[
                  ["all", "Same everywhere"],
                  ["mode", "Only in " + origin.name],
              ]
                  .map(
                      ([k, l]) =>
                          `<button data-act="pe-scope" data-k="${k}" aria-pressed="${scope === k}">${esc(l)}</button>`
                  )
                  .join(
                      ""
                  )}</div><span class="hint">${scope === "all" ? "You're editing the profile every mode uses unless it has its own." : esc(origin.name) + " keeps its own picture, banner, name and bio; the rest of the app is unchanged."}</span></div>`
    }
    <div class="fields"><div class="field"><label for="pe-name">${uni ? "Your name" : "Name in " + esc(mode.name)}</label><input id="pe-name" value="${esc(uni ? p.name || "" : mp.name || p.name || "")}" placeholder="${uni ? "" : "Uses your main name: " + esc(p.name || "")}" autofocus></div>
      <div class="field"><label for="pe-avatar">Picture${uni ? "" : " in " + esc(mode.name)} (link)</label><input id="pe-avatar" value="${esc(uni ? p.avatar || "" : mp.avatar || "")}" placeholder="${uni ? (al.avatar ? "Using your AniList picture" : "https://…") : "Uses your main picture"}"></div>
      <div class="field full"><label for="pe-bio">About you${uni ? "" : " in " + esc(mode.name)}</label><textarea id="pe-bio" placeholder="${uni ? "" : "Leave empty to use your main bio"}">${esc(uni ? p.bio || "" : mp.bio || "")}</textarea></div></div>
    <div class="bar"><button class="btn sm" data-act="pe-avatar-upload">Upload a picture</button>${(uni ? p.avatarData || p.avatar || al.avatar : mp.avatarData || mp.avatar) ? `<button class="btn sm" data-act="frame-open" data-src="${esc(uni ? p.avatarData || p.avatar || al.avatar : mp.avatarData || mp.avatar)}" data-k='${esc(JSON.stringify({ t: "avatar", mode: mode.id }))}'>Adjust</button>` : ""}${(uni ? p.avatarData || p.avatar || al.avatar : mp.avatarData || mp.avatar) ? `<button class="btn sm ghost" data-act="pe-avatar-clear">Remove picture</button>` : ""}<span class="hint">Each mode can have its own name, picture, banner and bio. Leave one empty to use your main one.</span></div>
    <div class="sec"><p class="label">Banner${uni ? "" : " in " + esc(mode.name)}</p><div class="covergrid">${
        [
            al.banner && hasAnimanga(mode) ? { u: al.banner, l: "AniList banner" } : null,
            ...banners.map(b => ({ u: b.banner, l: titleOf(b) })),
        ]
            .filter(Boolean)
            .map(
                x =>
                    `<button class="cg wide${cur === x.u ? " on" : ""}" data-act="pe-banner" data-url="${esc(x.u)}"><img src="${esc(x.u)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${esc(x.l)}</span></button>`
            )
            .join("") || `<p class="hint">Banners from AniList and your favourites appear here.</p>`
    }</div>
      <div class="bar"><button class="btn sm" data-act="pe-banner-upload">Upload a banner</button>${(uni ? p.bannerData || p.banner || al.banner : mp.bannerData || mp.banner) ? `<button class="btn sm" data-act="frame-open" data-src="${esc(uni ? p.bannerData || p.banner || al.banner : mp.bannerData || mp.banner)}" data-k='${esc(JSON.stringify({ t: "banner", mode: mode.id }))}'>Adjust</button>` : ""}<input class="inp" id="pe-banner-url" placeholder="…or paste an image link" style="max-width:240px"><button class="btn sm" data-act="pe-banner-link">Use link</button>${(uni ? p.banner || p.bannerData : mp.banner || mp.bannerData) ? `<button class="btn sm ghost" data-act="pe-banner-clear">${uni ? "Remove banner" : "Use the main banner"}</button>` : ""}${!uni ? `<button class="btn sm ghost" data-act="pe-banner-none">No banner here</button>` : ""}</div>
      <p class="hint">Animated GIFs work for the picture and the banner.</p></div>
    <div class="bar"><button class="btn gold" data-act="pe-save">Save</button></div>`
    );
};
// a person: any number of roles, credits across media, a picture and why
MODALS.person = function (m) {
    const P = peopleIndex(modeById("universal")).find(p => norm(p.name) === norm(m.name || "")),
        s = (meta.people || []).find(p => norm(p.name) === norm(m.name || "")) || {};
    const roles = new Set([...(s.roles || (s.role ? [s.role] : [])), ...(P ? P.roles : [])]);
    const credits = P ? [...new Set(P.credits.map(c => c.id))].filter(id => items.has(id)) : [];
    const img = s.imageData || s.image || "";
    const opts = all()
        .sort((a, b) => titleOf(a).localeCompare(titleOf(b)))
        .map(x => `<option value="${esc(titleOf(x))} · ${esc(MEDIA[x.medium].one)}">`)
        .join("");
    return `<div class="catalog charcat"><div class="navarrows"><button class="x" data-act="close">Close ✕</button></div>
    <div class="left"><div class="charbig">${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer">` : `<span class="noimg">${esc((m.name || "?").charAt(0))}</span>`}</div>
      <div class="bar"><button class="btn sm" data-act="pp-upload">Upload</button></div><input class="inp" id="pp-img" value="${esc(s.image || "")}" placeholder="Picture link"></div>
    <div style="min-width:0"><div class="eyebrow">Person</div>
      <h2><input class="h2in" id="pp-name" value="${esc(m.name || "")}" placeholder="Name" aria-label="Name" ${m.name ? "" : "autofocus"}></h2>
      <div class="sec"><p class="label">Roles</p><div class="chips">${ROLE_LIST.map(r => `<button class="chip" data-act="pp-role" data-k="${esc(r)}" aria-pressed="${roles.has(r)}">${esc(r)}</button>`).join("")}</div>
        <div class="bar" style="margin-top:6px"><input class="inp" id="pp-role-new" placeholder="Another role" style="max-width:200px"><button class="btn sm" data-act="pp-role-add">Add role</button></div></div>
      <div class="sec"><p class="label">Credits in your library · ${credits.length}</p>${
          credits.length
              ? `<div class="strip">${credits
                    .slice(0, 40)
                    .map(id => cardHTML({ id, ...items.get(id) }))
                    .join("")}</div>`
              : `<p class="hint">Nothing yet.</p>`
      }
        <div class="bar" style="margin-top:6px"><input class="inp" id="pp-credit" list="pp-opts" placeholder="Also worked on…" style="max-width:260px"><datalist id="pp-opts">${opts}</datalist><select class="sel" id="pp-credit-role">${opt(ROLE_LIST, "Actor")}</select><button class="btn sm" data-act="pp-credit-add">Add credit</button></div></div>
      <div class="sec"><p class="label">Why you like their work</p><textarea id="pp-why">${esc(s.why || "")}</textarea></div>
      <div class="bar" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)"><button class="btn gold" data-act="pp-save">Save</button><button class="btn${s.fav ? " favon" : ""}" data-act="pp-fav">${s.fav ? "♥ Favourite" : "♡ Favourite"}</button>
        <span class="spacer"></span>${s.id ? `<button class="btn danger" data-act="person-remove" data-k="${esc(s.id)}">Forget</button>` : ""}</div></div></div>`;
};
MODALS.pickitem = function (m) {
    const q = norm(m.q || ""),
        added = m.added || new Set();
    const list = (m.scope === "mode" ? modeItems() : all())
        .filter(
            b =>
                (!m.filter || m.filter(b)) &&
                (!q || norm(titleOf(b) + " " + (b.creator || "") + " " + ((b.alt && b.alt.romaji) || "")).includes(q))
        )
        .sort((a, b) => (b.status === "done") - (a.status === "done") || (b.rating || 0) - (a.rating || 0))
        .slice(0, 40);
    return (
        head(esc(m.title || "Choose")) +
        `<input class="inp" id="pi-q" autofocus placeholder="Search your library" value="${esc(m.q || "")}">
    <div class="mini" style="margin-top:8px">${list.map(b => `<button data-act="pi-pick" data-id="${esc(b.id)}" ${added.has(b.id) ? "disabled" : ""}><span class="t">${mDot(b.medium)}${esc(titleOf(b))}</span><span class="hint">${added.has(b.id) ? "✓ Added" : esc(b.kind || MEDIA[b.medium].one) + (b.year ? " · " + b.year : "") + (b.rating ? " · " + b.rating : "") + (b.fav ? " · ♥" : "")}</span></button>`).join("") || `<p class="hint">Nothing matches.</p>`}</div>
    ${m.purpose === "list" ? `<div class="bar" style="margin-top:10px"><button class="btn gold" data-act="close">Done</button></div>` : ""}`
    );
};
MODALS.tiernew = function (m) {
    return (
        head("New tier list") +
        `<div class="fields"><div class="field full"><label for="tn-name">Name</label><input id="tn-name" autofocus placeholder="e.g. Every anime I've finished, Best characters, 2026 so far" value="${esc(m.name || "")}"></div>
    <div class="field"><label for="tn-kind">Rank</label><select id="tn-kind">${opt(
        [
            ["items", "Things in my library"],
            ["chars", "My favourite characters"],
        ],
        m.kind || "items"
    )}</select></div>
    <div class="field"><label for="tn-mode">From</label><select id="tn-mode">${meta.modes.map(x => `<option value="${esc(x.id)}"${x.id === curMode().id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div></div>
    <div class="bar"><label class="ctl"><input type="checkbox" id="tn-done" checked> Only things I've finished or scored</label></div>
    <div class="bar"><button class="btn gold" data-act="tn-create">Create</button></div>${m.ids ? `<p class="hint">${m.ids.length} selected items will start in the top tier.</p>` : ""}`
    );
};
// ── lists ──
MODALS.listnew = function (m) {
    const tier = m.type === "tier",
        what = m.what || "items",
        things = what === "items";
    const whatSeg = `<div class="field full"><label>What's in it</label><div class="seg">${Object.entries(TIER_WHAT)
        .map(([k, l]) => `<button data-act="ln-what" data-k="${k}" aria-pressed="${what === k}">${esc(l)}</button>`)
        .join("")}</div></div>`;
    return (
        head(tier ? "New tier list" : "New list") +
        `<div class="seg" style="margin-bottom:12px">${[
            ["list", "List"],
            ["tier", "Tier list"],
        ]
            .map(
                ([k, l]) =>
                    `<button data-act="ln-type" data-k="${k}" aria-pressed="${(m.type || "list") === k}">${l}</button>`
            )
            .join("")}</div>
    <div class="fields"><div class="field full"><label for="ln-name">Name</label><input id="ln-name" autofocus placeholder="${tier ? "e.g. Every anime I've finished, 2026 so far" : things ? "e.g. Cosmere reading order, Comfort rewatches" : what === "chars" ? "e.g. Best villains" : "e.g. Favourite voice actors"}" value="${esc(m.name || "")}"></div>
      ${whatSeg}
      ${!tier && things ? `<div class="field full"><label for="ln-desc">What it's for (optional)</label><input id="ln-desc"></div>` : ""}
      ${
          things || tier
              ? `<div class="field"><label for="ln-mode">${tier && things ? "Rank things from" : "Show it in"}</label><select id="ln-mode">${tier ? "" : `<option value="">Every mode</option>`}${meta.modes
                    .filter(x => tier || x.id !== "universal")
                    .map(
                        x =>
                            `<option value="${esc(x.id)}"${x.id === curMode().id ? " selected" : ""}>${esc(x.name)}${tier ? "" : " only"}</option>`
                    )
                    .join("")}</select></div>`
              : ""
      }</div>
    ${tier && things ? `<div class="bar"><label class="ctl"><input type="checkbox" id="ln-done" checked> Only things I've finished or scored</label></div>` : !tier && things ? `<div class="bar"><label class="ctl"><input type="checkbox" id="ln-num" checked> Numbered order (a reading or watch order)</label></div>` : `<p class="hint">Your ${what === "chars" ? "favourite characters" : "saved people"} start in it; pull in the ${what === "chars" ? "characters" : "cast"} of any title from your library once it's made.</p>`}
    <div class="bar"><button class="btn gold" data-act="ln-create">Create</button></div>${m.ids && m.ids.length ? `<p class="hint">Starts with ${plural(m.ids.length, "entry", "entries")}.</p>` : ""}`
    );
};
MODALS.listpick = function (m) {
    const ids = m.ids || [m.id];
    const has = l => ids.every(id => l.ids.includes(id)),
        LS = meta.lists.filter(l => l.kind !== "tier");
    return (
        head(
            ids.length === 1
                ? "Lists · " + esc(cleanTitle(titleOf(items.get(ids[0]) || { title: "" })))
                : `Add ${ids.length} to a list`
        ) +
        `
    ${LS.length ? `<div class="mini">${LS.map(l => `<button data-act="lp-toggle" data-k="${esc(l.id)}" aria-pressed="${has(l)}"><span class="t">${has(l) ? "✓ " : ""}${l.numbered ? "№ " : "≡ "}${esc(l.name)}</span><span class="hint">${l.ids.length} entries${l.mode ? " · " + esc(modeById(l.mode).name) : ""}</span></button>`).join("")}</div>` : `<p class="hint">No lists yet.</p>`}
    <div class="bar" style="margin-top:10px"><input class="inp" id="lp-new" placeholder="New list name" style="max-width:260px"><button class="btn" data-act="lp-create">Create & add</button><span class="spacer"></span><button class="btn gold" data-act="close">Done</button></div>`
    );
};
MODALS.vaultpass = function () {
    return (
        head("Change passphrase") +
        `<p class="hint">Everything private is re-encrypted with the new passphrase. The old one stops working.</p>
    <div class="fields"><div class="field full"><label for="vn1">New passphrase</label><input id="vn1" type="password" autocomplete="new-password" autofocus></div><div class="field full"><label for="vn2">Again</label><input id="vn2" type="password" autocomplete="new-password"></div></div>
    <div class="bar"><button class="btn gold" data-act="vault-pass-save">Change</button></div>`
    );
};
// ── paste a list (Serializd, notes apps, anything) ──
MODALS.paste = function (m) {
    const med = m.medium || "tv",
        words = STATUS_WORDS[MEDIA[med].group];
    const parsed = m.text ? parsePasted(m.text, med, m.status || "done") : [];
    return (
        head("Paste a list") +
        `<p class="hint">One title per line. A year in brackets and a score at the end are picked up too: <code>Severance (2022) - 9</code> or <code>Arcane — 4.5/5</code>. Bullets and numbering are ignored. From Serializd: open your profile, select the show titles and copy them.</p>
    <div class="bar"><label class="ctl">These are <select class="sel" id="ps-medium">${opt(
        MEDIA_KEYS.map(k => [k, MEDIA[k].name]),
        med
    )}</select></label>
      <label class="ctl">Type <select class="sel" id="ps-kind"><option value="">Decide later</option>${KINDS[med].map(k => `<option${m.ikind === k ? " selected" : ""}>${esc(k)}</option>`).join("")}</select></label>
      <label class="ctl">Mark as <select class="sel" id="ps-status">${opt(
          STATUS.map(k => [k, words[k]]),
          m.status || "done"
      )}</select></label>
      <label class="ctl">Tag <input class="inp" id="ps-tag" value="${esc(m.tag ?? (med === "tv" ? "Serializd" : ""))}" style="width:120px"></label></div>
    <textarea id="ps-text" style="min-height:180px" placeholder="Severance (2022) - 9\nThe Bear\nArcane — 4.5/5" autofocus>${esc(m.text || "")}</textarea>
    ${
        parsed.length
            ? `<p class="hint">${plural(parsed.length, "title")} · ${parsed.filter(x => findExisting(x.title, "", med)).length} already in your library (they'll be updated, not duplicated) · ${parsed.filter(x => x.rating).length} with scores.</p>
      <div class="mini" style="max-height:180px;overflow:auto">${parsed
          .slice(0, 30)
          .map(
              x =>
                  `<div class="lrow"><span class="t">${esc(x.title)}</span><span class="hint">${[x.year, x.rating ? x.rating + "/10" : ""].filter(Boolean).join(" · ")}</span></div>`
          )
          .join("")}</div>`
            : ""
    }
    <div class="bar"><button class="btn" data-act="ps-preview">Check</button><button class="btn gold" data-act="ps-import">Import ${parsed.length || ""}</button></div>
    <p class="hint">Artwork, details and crowd scores fill in afterwards in the background.</p>`
    );
};
// ── any CSV: match its columns once ──
MODALS.csvmap = function (m) {
    const p = m.preview,
        map = m.map || (m.map = guessMapping(p.columns)),
        med = m.medium || "film";
    const col = k =>
        `<select class="sel" data-map="${k}"><option value="">—</option>${p.columns.map(c => `<option${map[k] === c ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>`;
    const sample = mapRows(p.rows.slice(0, 5), map, {
        medium: med,
        scale: m.scale || "auto",
        status: m.status || "done",
        all: p.rows,
    });
    return (
        head("Match the columns · " + esc(p.name)) +
        `<p class="hint">${p.rows.length} rows. Tell UniverList which column is which; anything left blank is skipped.</p>
    <div class="bar"><label class="ctl">Medium <select class="sel" id="cm-medium">${opt(
        MEDIA_KEYS.map(k => [k, MEDIA[k].name]),
        med
    )}</select></label>
      <label class="ctl">Scores are out of <select class="sel" id="cm-scale">${opt(
          [
              ["auto", "Work it out"],
              ["10", "10"],
              ["5", "5 (stars)"],
              ["100", "100"],
          ],
          m.scale || "auto"
      )}</select></label>
      <label class="ctl">Rows without a status are <select class="sel" id="cm-status">${opt(
          STATUS.map(k => [k, STATUS_WORDS[MEDIA[med].group][k]]),
          m.status || "done"
      )}</select></label></div>
    <div class="mapgrid">${MAP_FIELDS.map(([k, l]) => `<label class="ctl"><span>${esc(l)}</span>${col(k)}</label>`).join("")}</div>
    ${sample.length ? `<div class="tablewrap"><table class="lib small"><thead><tr><th>Title</th><th>Year</th><th>Score</th><th>Status</th><th>Finished</th></tr></thead><tbody>${sample.map(x => `<tr><td>${esc(x.title)}</td><td class="num">${x.year || ""}</td><td class="num">${x.rating || ""}</td><td>${esc(statusWord(x.status, med))}</td><td>${esc(x.finishedAt ? fmtDate(x.finishedAt) : "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="err">Pick the title column first.</p>`}
    <div class="bar"><button class="btn gold" data-act="cm-import" ${map.title ? "" : "disabled"}>Import ${p.rows.length}</button></div>`
    );
};

// ── import / export ──
MODALS.io = function (m) {
    const p = m.preview;
    const bundle = p && p.kind === "bundle" ? PARTS.filter(([k]) => p.parts[k] && partCount(k, p.parts[k])) : [];
    if (p && p.kind === "bundle") m.sel = m.sel || Object.fromEntries(bundle.map(([k]) => [k, k !== "private"]));
    return (
        head("Import") +
        `
    ${
        p
            ? p.kind === "bundle"
                ? `<div class="panel"><p><b>${esc(p.name)}</b>${p.savedAt ? ` · saved ${esc(fmtDate(p.savedAt))}` : ""}. Choose what to bring in:</p>
        <div class="partlist">${bundle.map(([k, l, d]) => `<label class="ctl part"><input type="checkbox" data-part="${k}" ${m.sel[k] ? "checked" : ""}><span><b>${esc(l)}</b> <span class="cn">${partCount(k, p.parts[k])}</span><br><span class="hint">${esc(d)}</span></span></label>`).join("")}</div>
        ${(p.parts.keys && p.parts.keys.__locked) || p.parts.privext ? `<div class="bar" style="margin-top:8px"><label class="ctl">Backup passphrase (for keys and private extensions)</label><input class="inp" id="imp-keypass" type="password" autocomplete="off" value="${esc(m.keypass || "")}" style="max-width:220px" ${m.busy ? "disabled" : ""}></div>` : ""}
        ${
            (p.parts.extensions && m.sel.extensions) || (p.parts.privext && m.sel.privext)
                ? `<div class="bar exthow" style="margin-top:8px"><span class="label">Extensions in this backup</span>
          <label class="ctl"><input type="radio" name="exthow" data-exthow="all" ${(m.extHow || "all") === "all" ? "checked" : ""}> The extension and its settings</label>
          <label class="ctl"><input type="radio" name="exthow" data-exthow="settings" ${m.extHow === "settings" ? "checked" : ""}> Only its settings and servers (keep the version you have)</label></div>`
                : ""
        }
        <div class="bar" style="margin-top:10px"><button class="btn gold" data-act="import-merge" ${m.busy ? "disabled" : ""}>${m.busy === "Merging…" ? '<span class="spin"></span>Merging…' : "Merge"}</button><button class="btn" data-act="import-replace" ${m.busy ? "disabled" : ""}>${m.busy === "Replacing…" ? '<span class="spin"></span>Replacing…' : "Replace these parts"}</button></div>
        ${m.busy ? `<div class="busybar" role="status" aria-live="polite"><span></span></div><p class="hint">${esc(m.busy)} This can take a little while with a lot of pictures. Keep this window open.</p>` : ""}
        <p class="hint">Merge adds what's new and keeps what you have. Replace swaps each ticked part for the file's version and leaves the unticked ones alone. You can undo it (pictures excepted).</p></div>`
                : `<div class="panel"><p><b>${esc(p.name)}</b>: ${p.items.length} items from ${esc(p.kind)}${p.lists && p.lists.length ? ` and ${plural(p.lists.length, "list")}` : ""}. ${p.match} already here will be updated; ${p.items.length - p.match} are new.</p>
        <div class="bar" style="margin-top:10px">${p.items.every(x => x.medium === "book") ? `<label class="ctl">New books are <select class="sel" id="imp-kind">${KINDS.book.map(k => `<option>${esc(k)}</option>`).join("")}</select></label>` : ""}<button class="btn gold" data-act="import-csv">Import ${p.items.length}</button></div>
        <p class="hint">Updates fill in scores, status, dates and tags; nothing you wrote here is removed. You can undo the whole import.</p></div>`
            : ""
    }
    <div class="bar"><button class="btn" data-act="import-file">Choose a file…</button><button class="btn" data-act="open-paste">Paste a list…</button><button class="btn ghost" data-act="go-settings" data-k="export">Export…</button></div>
    <p class="hint">UniverList .zip packs and backups, Letterboxd (.zip), MyAnimeList (.xml), Goodreads, StoryGraph and IMDb CSVs are recognised automatically. Any other CSV opens the column matcher.</p>
    ${m.error ? `<p class="err">${esc(m.error)}</p>` : ""}`
    );
};
MODALS.tierpick = function (m) {
    const T = meta.lists.filter(t => t.kind === "tier" && !t.chars);
    return (
        head(`Add ${m.ids.length} to a tier list`) +
        (T.length
            ? `<div class="mini">${T.map(t => `<div class="bar" style="justify-content:space-between;border:1px solid var(--line);border-radius:8px;padding:8px 10px"><span class="t">${esc(t.name)}</span><span class="bar">${t.rows.map((r, i) => `<button class="btn sm" style="border-color:${esc(r.color)}" data-act="tp-place" data-k="${esc(t.id)}" data-row="${i}">${esc(r.label)}</button>`).join("")}</span></div>`).join("")}</div>`
            : `<p class="hint">No tier lists yet.</p>`) +
        `<div class="bar" style="margin-top:10px"><button class="btn" data-act="tier-new-from-sel">New tier list with these</button></div>`
    );
};

MODALS.covers = function (m) {
    const p = m.total ? Math.round((m.done / m.total) * 100) : 0;
    return (
        head("Refresh artwork & scores") +
        `
    <p>Artwork and crowd scores load in the background on their own. Use this to retry, fill gaps, or update every score.</p>
    <div class="field" style="max-width:460px"><label for="rc-scope">What</label><select id="rc-scope" ${m.running ? "disabled" : ""}>${opt(
        [
            ["missing", "Things still without artwork"],
            ["scores", "Update every crowd score"],
            ["books", "Every book: switch to its most popular cover"],
        ],
        m.scope || "missing"
    )}</select></div>
    ${m.total ? `<div class="progress"><span style="width:${p}%"></span></div><p class="hint">${m.done} of ${m.total} · ${m.found} updated${m.current ? " · " + esc(m.current) : ""}</p>` : ""}
    <div class="bar">${m.running ? `<button class="btn" data-act="rc-stop">Stop</button>` : `<button class="btn gold" data-act="rc-go">${m.total ? "Run again" : "Start"}</button>`}</div>
    ${m.finished ? `<p class="hint">Done.</p>` : ""}${m.error ? `<p class="err">${esc(m.error)}</p>` : ""}`
    );
};

// ── palette, keys, welcome, saved view ──
function commands() {
    return [
        ...allModes().map(x => [`Mode: ${x.name}`, x.g || "•", () => setMode(x.id)]),
        ...tabsFor().map(k => [TAB_NAME[k], "›", () => goTab(k)]),
        ...STATS_VIEWS.slice(1).map(([k, l]) => [`Stats: ${l}`, "▥", () => goStats(k)]),
        ...(isUniversal() ? [] : shelvesOf().map(s => [`Shelf: ${s.name}`, "▤", () => goShelf(s.key)])),
        ["Up next", "⧗", () => goList("queue")],
        ...meta.lists
            .filter(l => !l.private === !ui.private)
            .map(l => [`List: ${l.name}`, l.numbered ? "№" : "≡", () => goList(l.id)]),
        [ui.private ? "Leave the private collection" : "Private collection", "🔒", () => togglePrivate()],
        ["Add anything", "+", () => openAdd()],
        ["New list", "≡", () => openModal("listnew", {})],
        ["Insights", "✧", () => openDiscover()],
        ["Pick for me", "⚄", () => openModal("pick")],
        ["Paste a list", "⎘", () => openModal("paste", {})],
        ["Import", "⇅", () => goSettings("io")],
        ["Refresh artwork & scores", "↻", () => openModal("covers")],
        ["Download everything (.zip)", "⬇", () => goSettings("io")],
        ["Export backup", "⬇", () => exportJSON()],
        ...setSecs().map(([k, l]) => [`Settings: ${l}`, "⚙", () => goSettings(k)]),
        ["Show or hide the sidebar", "◧", () => toggleSide()],
        ["Cover view", "▦", () => setView("cover")],
        ["Grid view", "▤", () => setView("grid")],
        ["Spine view", "▥", () => setView("spine")],
        ["List view", "☰", () => setView("list")],
        ["Watch (beta)", "▶", () => goWatch()],
        [
            "What's in here",
            "✦",
            () => {
                ui.page = "features";
                render();
            },
        ],
        ["Year in review", "★", () => goStats("wrapped")],
        ["Undo", "↶", () => undo()],
        ["Redo", "↷", () => redo()],
        ["Keyboard shortcuts", "⌨", () => goSettings("keys")],
    ];
}
function paletteHTML(m) {
    const q = (m.q || "").toLowerCase().trim(),
        nq = norm(q);
    const cmds = commands()
        .filter(([l]) => !q || l.toLowerCase().includes(q))
        .slice(0, q ? 8 : 10)
        .map(([l, ic, fn]) => ({ l, ic, fn, sub: "Command" }));
    const its = q
        ? all()
              .map(b => {
                  const t = norm(titleOf(b)),
                      t2 = norm((b.alt && b.alt.romaji) || "");
                  return {
                      b,
                      s:
                          (t.startsWith(nq) ? 3 : 0) +
                          (t.includes(nq) || t2.includes(nq) ? 2 : 0) +
                          (norm(b.creator).includes(nq) ? 1 : 0) +
                          (b.fav ? 0.3 : 0) +
                          (inMode(b) ? 1.5 : 0),
                  };
              })
              .filter(x => x.s > 0)
              .sort((a, b) => b.s - a.s)
              .slice(0, 9)
              .map(x => ({
                  l: titleOf(x.b),
                  ic: MEDIA[x.b.medium].g,
                  sub: (x.b.kind || MEDIA[x.b.medium].one) + (x.b.creator ? " · " + x.b.creator : ""),
                  id: x.b.id,
              }))
        : [];
    const chs = q
        ? meta.chars
              .filter(c => norm(c.name).includes(nq))
              .slice(0, 4)
              .map(c => ({
                  l: c.name,
                  ic: "♟",
                  sub: "Character" + ((c.media || [])[0] ? " · " + c.media[0].title : ""),
                  char: c.id,
              }))
        : [];
    const lst = q
        ? meta.lists
              .filter(l => !l.private === !ui.private && norm(l.name).includes(nq))
              .slice(0, 3)
              .map(l => ({
                  l: l.name,
                  ic: l.numbered ? "№" : "≡",
                  sub: "List · " + l.ids.length,
                  fn: () => goList(l.id),
              }))
        : [];
    const more =
        q && its.length
            ? [
                  {
                      l: `Show every match for “${m.q.trim()}” in the library`,
                      ic: "⌕",
                      sub: "Enter on this",
                      fn: () => {
                          ui.q = m.q.trim();
                          ui.searchAll = false;
                          goLib({});
                      },
                  },
              ]
            : [];
    m.items = [...its, ...more, ...chs, ...lst, ...cmds];
    m.i = Math.min(m.i || 0, Math.max(0, m.items.length - 1));
    let k = 0;
    const row = it => {
        const idx = k++;
        return `<button class="it" data-act="pal-run" data-k="${idx}" aria-selected="${idx === m.i}"><span class="ic">${esc(it.ic)}</span><span>${esc(it.l)}</span><span class="sub">${esc(it.sub)}</span></button>`;
    };
    return `<div class="pal-in"><span aria-hidden="true">⌕</span><input id="pal-q" placeholder="Search ${esc(ui.private ? "your private collection" : "everything")}, or type a command…" value="${esc(m.q || "")}" autocomplete="off"><kbd>esc</kbd></div>
    <div class="res">${its.length ? `<div class="grp">In your library</div>${its.map(row).join("")}${more.map(row).join("")}` : ""}${chs.length ? `<div class="grp">Characters</div>${chs.map(row).join("")}` : ""}${lst.length ? `<div class="grp">Lists</div>${lst.map(row).join("")}` : ""}${cmds.length ? `<div class="grp">Commands</div>${cmds.map(row).join("")}` : ""}${!m.items.length ? `<p class="hint" style="padding:12px">Nothing matches.</p>` : ""}</div>`;
}
MODALS.keys = function () {
    return (
        head("Keyboard shortcuts") +
        `<p class="hint">Change any of them in Settings.</p><div class="keys">${KEY_ACTIONS.map(
            ([id, l]) =>
                `<span>${keysOf(id)
                    .map(k => `<span class="kbd">${esc(keyLabel(k))}</span>`)
                    .join(" ")}</span><span>${esc(l)}</span>`
        ).join(
            ""
        )}</div><div class="bar"><button class="btn" data-act="go-settings" data-k="keys">Change them</button></div>`
    );
};
// unlocking the private collection
MODALS.unlock = function (m) {
    return (
        head("🔒 Private collection") +
        `<p class="hint">${meta.vault.n || 0} encrypted entries. Enter your passphrase to open them.</p>
    <div class="field"><label for="vpu">Passphrase</label><input id="vpu" type="password" autocomplete="current-password" autofocus></div>
    ${m.err ? `<p class="err">${esc(m.err)}</p>` : ""}<div class="bar"><button class="btn gold" data-act="vault-unlock">Unlock</button></div>`
    );
};
MODALS.welcome = function () {
    return `<div class="welcome2"><p class="eyebrow">${esc(APP_NAME)}</p><h2>Everything you read, watch and play, in one place.</h2>
    <p class="hint">It lives in this browser and works offline. Nothing leaves unless you send it.</p>
    <label class="wlname"><span>What should it call you?</span><input class="inp" id="wl-name" placeholder="Your name" autocomplete="nickname" autofocus></label>
    <div class="bar"><button class="btn gold" data-act="welcome-done">Start</button><button class="btn ghost" data-act="welcome-import">Bring in what I have</button>${location.protocol.startsWith("http") ? `<button class="btn ghost" data-act="welcome-signin">Sign in to my account</button>` : ""}</div>
    <p class="hint">Press <span class="kbd">/</span> to search and <span class="kbd">+</span> to add. AniList, Letterboxd, MyAnimeList, Goodreads and any CSV come in through Import.</p></div>`;
};
MODALS.saveview = function () {
    return (
        head("Save this view") +
        `<p class="hint">Saves the current medium, filters, sort and view to the sidebar.</p><div class="bar"><input class="inp" id="sv-name" autofocus placeholder="e.g. Unfinished anime, Short books I own" style="max-width:340px"><button class="btn gold" data-act="sv-save">Save</button></div>`
    );
};

// seasons: TV is scored as a whole unless you turn seasons on (per show, or for all shows in Settings); anime seasons are already separate entries
const seasonsOn = b => (b.bySeason != null ? b.bySeason : !!(meta.settings.seasons || {})[b.medium]);
function seasonsHTML(b) {
    if (!["tv", "anime"].includes(b.medium)) return "";
    const on = seasonsOn(b),
        S = b.seasons || [],
        words = STATUS_WORDS[MEDIA[b.medium].group];
    if (!on)
        return `<div class="sec"><div class="bar"><button class="btn sm ghost" data-act="season-toggle">Score seasons separately</button><span class="hint">${b.medium === "anime" ? "AniList already keeps each anime season as its own entry." : "Off: this show is scored as a whole."}</span></div></div>`;
    const avg = S.filter(x => x.rating).length
        ? Math.round(
              (S.filter(x => x.rating).reduce((a, x) => a + +x.rating, 0) / S.filter(x => x.rating).length) * 10
          ) / 10
        : null;
    return `<div class="sec"><p class="label">Seasons <button class="linkbtn" data-act="season-toggle">turn off</button></p>
    ${
        S.length
            ? `<div class="seasons">${S.map(
                  (
                      x,
                      i
                  ) => `<div class="srow2"><b>S${x.n || i + 1}</b><input class="inp" data-season="${i}" data-sf="eps" value="${esc(x.eps || "")}" placeholder="eps" inputmode="numeric" style="width:58px">
      <select class="sel" data-season="${i}" data-sf="status">${STATUS.map(k => `<option value="${k}"${(x.status || "want") === k ? " selected" : ""}>${esc(words[k])}</option>`).join("")}</select>
      <input class="inp" data-season="${i}" data-sf="rating" value="${esc(x.rating || "")}" placeholder="/10" inputmode="decimal" style="width:58px"><input class="inp" data-season="${i}" data-sf="note" value="${esc(x.note || "")}" placeholder="Note"><button class="linkbtn" data-act="season-del" data-k="${i}" aria-label="Remove season">✕</button></div>`
              ).join("")}</div>`
            : `<p class="hint">No seasons yet.</p>`
    }
    <div class="bar" style="margin-top:6px"><button class="btn sm" data-act="season-add">+ Season</button>${avg != null ? `<button class="btn sm ghost" data-act="season-avg">Use the average (${avg}) as the overall score</button>` : ""}</div></div>`;
}
// choosing covers quickly: one item at a time, every candidate at once, number keys to pick
MODALS.coverpick = function (m) {
    const id = m.queue[m.i],
        b = id && items.get(id);
    if (!b)
        return (
            head("Choose covers") +
            `<p>Done: ${m.picked || 0} covers chosen.</p><div class="bar"><button class="btn gold" data-act="close">Close</button></div>`
        );
    const c = m.cands[id];
    return (
        head(`Choose covers · ${m.i + 1} of ${m.queue.length}`) +
        `
    <div class="cpick"><div class="cpcur">${coverHTML({ id, ...b })}<p class="hint">Current</p></div>
      <div style="min-width:0"><div class="eyebrow">${esc(b.kind || MEDIA[b.medium].one)}${b.year ? " · " + b.year : ""}</div><h3 class="cptitle">${esc(titleOf(b))}</h3><div class="hint">${esc(b.creator || "")}</div>
        ${
            c == null
                ? `<p class="think">Finding covers…</p>`
                : c.length
                  ? `<div class="covergrid cpgrid">${c
                        .slice(0, 18)
                        .map(
                            (x, i) =>
                                `<button class="cg${b.cover === x.cover ? " on" : ""}" data-act="cp-pick" data-k="${i}"><img src="${esc(x.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span>${i < 9 ? `<kbd>${i + 1}</kbd> ` : ""}${esc(x.label)}</span></button>`
                        )
                        .join("")}</div>`
                  : `<p class="hint">No covers found for this one. Upload one, paste a link, or skip.</p>`
        }
        <div class="bar" style="margin-top:10px"><button class="btn" data-act="cp-prev" ${m.i ? "" : "disabled"}>← Back</button><button class="btn" data-act="cp-next">Keep current →</button><button class="btn ghost" data-act="cover-photo">Upload…</button><input class="inp" id="cp-url" placeholder="…or paste an image link" style="max-width:220px"><button class="btn sm" data-act="cp-url">Use link</button></div>
        <p class="hint">Keys: <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>→</kbd> keep and next · <kbd>←</kbd> back. Pictures you choose are never replaced by syncs.</p></div></div>`
    );
};
// Enter in the first-run name box starts
document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.id === "wl-name") {
        e.preventDefault();
        const b = $('[data-act="welcome-done"]');
        if (b) b.click();
    }
});
