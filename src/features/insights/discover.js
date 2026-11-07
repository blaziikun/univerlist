// src/features/insights/discover.js
// ─────────────────────────────────────────────────────────────────
//  Discover: recommendations from the web, never from an AI
// ─────────────────────────────────────────────────────────────────

const SUBREDDITS = {
    fiction: ["suggestmeabook", "booksuggestions", "Fantasy", "printSF", "books"],
    academic: ["math", "learnmath", "Physics", "AskPhysics", "aerospace", "compsci", "quant"],
    nonfiction: ["suggestmeabook", "booksuggestions", "askphilosophy", "philosophy", "psychology"],
};
const SE_SITES = {
    Mathematics: "math",
    Astrophysics: "physics",
    Aerospace: "engineering",
    "Computer science": "cs",
    Electronics: "electronics",
};
const AWARDS = [
    ["Hugo", ["Hugo Award for Best Novel"]],
    ["Nebula", ["Nebula Award for Best Novel"]],
    ["World Fantasy", ["World Fantasy Award—Novel", "World Fantasy Award for Best Novel"]],
    [
        "Locus",
        [
            "Locus Award for Best Fantasy Novel",
            "Locus Award for Best Science Fiction Novel",
            "Locus Award for Best Novel",
        ],
    ],
    ["Arthur C. Clarke", ["Arthur C. Clarke Award"]],
    ["Booker", ["Booker Prize"]],
    ["Pulitzer", ["Pulitzer Prize for Fiction"]],
    ["Edgar", ["Edgar Award for Best Novel"]],
    ["Gold Dagger", ["Gold Dagger", "CWA Gold Dagger"]],
    ["Women's Prize", ["Women's Prize for Fiction"]],
    ["Costa", ["Costa Book Award for Novel", "Costa Book of the Year"]],
];
const SOURCES = [
    ["reddit", "Reddit"],
    ["openlibrary", "Open Library subjects"],
    ["awards", "Award winners"],
    ["hn", "Hacker News"],
    ["stack", "Stack Exchange"],
];
const SOURCE_SHELVES = {
    reddit: ["fiction", "academic", "nonfiction"],
    openlibrary: ["fiction", "academic", "nonfiction"],
    awards: ["fiction"],
    hn: ["academic", "nonfiction", "fiction"],
    stack: ["academic", "nonfiction"],
};
const GENERIC_SUBJECT =
    /^(fiction|ficcion|literature|novel|novels|accessible book|protected daisy|in library|large type|english|reading level|nyt|new york times|translations?|lending library|overdrive|general|award|staff picks|history and criticism|criticism and interpretation|textbooks?|study and teaching|juvenile|open_syllabus|long now|literary|fiction in english|american|british|psychological fiction|popular works|nonfiction|non-fiction|textbook|classics|classic|readers|series|history$|biography$|science$|mathematics$)/i;
const DISC_MODES = [
    ["versions", "Other versions"],
    ["fans", "Fans also liked"],
    ["screen", "Film & TV"],
    ["games", "Games"],
    ["books", "Books from forums"],
];

function seedWeight(b) {
    if (b.status === "passed" || b.status === "dnf") return 0;
    return (
        (b.rating ? (b.rating - 5) * 0.9 : 0) +
        (b.fav ? 6 - Math.min(5, b.fav) * 0.5 + 3 : 0) +
        (b.favRank ? 9 - b.favRank : 0) +
        (b.elo ? Math.max(0, (b.elo - 1500) / 40) : 0) +
        ({ active: 3, done: 1.5, want: b.copy !== "none" ? 2 : 0.3, paused: 0.5 }[b.status] || 0) +
        (b.onMyList ? 1.5 : 0)
    );
}
function topSeeds(filter, n) {
    const M = modeItems();
    return (M.length ? M : all())
        .map(b => ({ ...b, w: seedWeight(b) }))
        .filter(b => b.w > 0 && filter(b))
        .sort((a, b) => b.w - a.w || String(a.title).localeCompare(b.title))
        .slice(0, n);
}
const isBookShelf = shelf => b => b.medium === "book" && (!shelf || b.shelf === shelf);
function normSubject(s) {
    let x = String(s)
        .toLowerCase()
        .replace(/^fiction,\s*/, "")
        .replace(/,\s*general$/, "")
        .replace(/\s*\(.*?\)\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (x.length < 3 || x.length > 40 || GENERIC_SUBJECT.test(x) || /\d{4}|--/.test(x)) return "";
    return x;
}
async function syncInterests(m) {
    const seeds = all()
        .filter(b => b.medium === "book")
        .map(b => ({ ...b, w: seedWeight(b) }))
        .filter(b => b.w >= 1.5)
        .sort((a, b) => b.w - a.w)
        .slice(0, 45);
    const todo = seeds.filter(b => !b.olSubjects);
    Object.assign(m, { syncing: true, syncDone: 0, syncTotal: todo.length, error: "" });
    renderOverlay();
    let fails = 0;
    for (const b of todo) {
        if (m.ctl.signal.aborted) break;
        try {
            const j = await getJSON(
                "https://openlibrary.org/search.json?" +
                    new URLSearchParams({
                        q: cleanTitle(b.title) + " " + firstAuthor(b.creator),
                        limit: 3,
                        fields: "key,title,author_name,subject,cover_i",
                    }),
                m.ctl.signal
            );
            const docs = (j.docs || []).map(x => ({
                olKey: x.key,
                title: x.title,
                author: (x.author_name || []).slice(0, 2).join(" & "),
                cover: x.cover_i ? olCover(x.cover_i) : "",
                subjects: x.subject || [],
            }));
            const r = docs.find(c => titleMatch(b, c)) || null;
            const p = { olSubjects: r ? [...new Set(r.subjects.map(normSubject).filter(Boolean))].slice(0, 20) : [] };
            if (r) {
                if (!coverSrc(b) && r.cover) p.cover = r.cover;
                if (!b.ext.olKey) p.ext = { ...b.ext, olKey: r.olKey };
            }
            quietPatch(b.id, p);
            fails = 0;
        } catch (err) {
            if (err.name === "AbortError") break;
            if (++fails >= 4) {
                m.error = "Open Library isn't responding. Check your connection.";
                break;
            }
        }
        m.syncDone++;
        renderOverlay();
        await sleep(300);
    }
    flushSave();
    const tally = { fiction: {}, academic: {}, nonfiction: {}, other: {} };
    for (const s of seeds) {
        const b = items.get(s.id);
        if (!b || !b.olSubjects) continue;
        for (const sub of b.olSubjects) {
            const t = tally[b.shelf] || tally.other;
            t[sub] = (t[sub] || 0) + s.w;
        }
    }
    meta.interests.subjects = Object.fromEntries(
        Object.entries(tally).map(([k, t]) => [
            k,
            Object.entries(t)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 24)
                .map(([name, w]) => ({ name, w: Math.round(w * 10) / 10 })),
        ])
    );
    meta.interests.seeds = seeds.map(s => s.id);
    meta.interests.syncedAt = nowISO();
    markDirty();
    m.syncing = false;
    renderOverlay();
    render();
}
// "Title by Author" mentions in forum text
const LEAD_WORDS = new Set([
    "read",
    "try",
    "also",
    "and",
    "but",
    "i",
    "i'd",
    "i've",
    "my",
    "you",
    "maybe",
    "definitely",
    "perhaps",
    "check",
    "loved",
    "love",
    "recommend",
    "recommended",
    "seconding",
    "second",
    "if",
    "so",
    "then",
    "or",
    "plus",
    "like",
    "oh",
    "yes",
    "yeah",
    "honestly",
    "personally",
    "anything",
    "everything",
    "something",
    "books",
    "book",
    "series",
    "novels",
    "novel",
    "def",
    "just",
    "get",
    "give",
    "consider",
    "look",
    "pick",
    "start",
    "another",
    "edit",
    "op",
    "the series",
    "thanks",
    "thank",
    "wow",
    "there's",
    "there",
    "this",
    "that",
    "these",
    "those",
    "it's",
    "its",
    "it",
    "he",
    "she",
    "we",
    "they",
    "what",
    "when",
    "where",
    "which",
    "who",
    "how",
    "why",
    "any",
    "some",
    "then,",
    "currently",
    "recently",
    "finished",
    "reading",
    "rereading",
    "re-reading",
    "picked",
    "grab",
    "grabbing",
    "enjoy",
    "enjoyed",
    "favorite",
    "favourite",
    "great",
    "good",
    "best",
]);
const CONNECT = new Set([
    "of",
    "the",
    "a",
    "an",
    "and",
    "in",
    "on",
    "to",
    "for",
    "at",
    "with",
    "from",
    "&",
    "or",
    "is",
    "de",
    "la",
    "le",
    "vs",
    "vs.",
    "into",
    "upon",
    "without",
    "under",
    "over",
    "&amp;",
]);
function extractBooks(text) {
    const out = [];
    const t = String(text)
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/[*_`#>]+/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[“”"]/g, " ");
    const re = /\s+by\s+((?:[A-Z][A-Za-z.'’\-]*\.?\s?){1,4})/g;
    let mt,
        lastEnd = 0;
    while ((mt = re.exec(t))) {
        const aw = [];
        for (const w0 of mt[1].split(/\s+/)) {
            const w = w0.replace(/[,;:!?]+$/, "");
            if (!/^[A-Z]/.test(w) || /^(And|Is|Was|The)$/.test(w)) break;
            if (/\.$/.test(w) && w.replace(/\./g, "").length > 2) {
                aw.push(w.replace(/\.+$/, ""));
                break;
            }
            aw.push(w);
            if (/[,;:!?]$/.test(w0)) break;
        }
        const author = aw.join(" ");
        if (
            !author ||
            author.length < 3 ||
            /^(The|A|An|Far|Me|Him|Her|Them|Itself|Comparison|Default|Contrast)\b/.test(author)
        )
            continue;
        const before = t
            .slice(Math.max(lastEnd, mt.index - 140), mt.index)
            .split(/\n/)
            .pop();
        lastEnd = mt.index + mt[0].length;
        const words = before.split(/\s+/),
            title = [];
        for (let i = words.length - 1; i >= 0; i--) {
            const w = words[i];
            if (!w) continue;
            if (/[.!?;:()\[\]]$/.test(w) && title.length) break;
            const clean = w.replace(/^[(\-–—,]+|[,)\-–—]+$/g, "");
            if (!clean) break;
            if (/^[A-Z0-9]/.test(clean) || (CONNECT.has(clean.toLowerCase()) && title.length)) title.unshift(clean);
            else break;
            if (/^[,(]/.test(w)) break;
            if (title.length > 12) break;
        }
        while (title.length && CONNECT.has(title[0].toLowerCase()) && !/^(The|A|An)$/.test(title[0])) title.shift();
        while (title.length > 1 && LEAD_WORDS.has(title[0].toLowerCase())) title.shift();
        while (title.length && CONNECT.has(title[title.length - 1].toLowerCase())) title.pop();
        if (!title.length || (title.length === 1 && LEAD_WORDS.has(title[0].toLowerCase()))) continue;
        const tt = title.join(" ").replace(/[,]$/, "");
        if (tt.length < 3 || tt.length > 80 || !/[A-Za-z]{3}/.test(tt)) continue;
        out.push({ title: tt, author });
    }
    return out;
}
function libraryKeys() {
    const s = new Set();
    for (const b of items.values()) {
        s.add(norm(cleanTitle(b.title)));
        if (b.alt) {
            if (b.alt.en) s.add(norm(cleanTitle(b.alt.en)));
            if (b.alt.romaji) s.add(norm(cleanTitle(b.alt.romaji)));
        }
    }
    for (const d of meta.dismissed || []) s.add(norm(cleanTitle(String(d).split(" — ")[0])));
    return s;
}
function owned(title, keys) {
    const n = norm(cleanTitle(title));
    if (keys.has(n)) return true;
    for (const k of keys) if (k.length > 6 && (n.startsWith(k) || (k.startsWith(n) && n.length > 6))) return true;
    return false;
}
function tallyMentions(mentions, keys, seedTitles) {
    const map = new Map();
    for (const x of mentions) {
        if (owned(x.title, keys) || seedTitles.has(norm(cleanTitle(x.title)))) continue;
        const key = norm(x.title) + "|" + norm(x.author).split(" ").pop();
        const e = map.get(key) || { title: x.title, author: x.author, score: 0, count: 0, threads: new Map() };
        e.score += 1 + Math.log2(1 + Math.max(0, x.score || 0));
        e.count++;
        if (x.thread) e.threads.set(x.thread.url, x.thread);
        map.set(key, e);
    }
    return [...map.values()]
        .map(e => ({ ...e, threadCount: e.threads.size, threads: [...e.threads.values()] }))
        .sort((a, b) => b.threadCount - a.threadCount || b.score - a.score);
}
async function verifyResults(list, m, n = 14) {
    const out = [];
    for (const e of list.slice(0, n * 2)) {
        if (out.length >= n || m.ctl.signal.aborted) break;
        m.status = `Checking ${e.title} on Open Library…`;
        renderOverlay();
        try {
            const r = (await olSearch(e.title + " " + e.author, 3, m.ctl.signal)).find(
                c =>
                    norm(c.title).includes(
                        norm(e.title)
                            .split(" ")
                            .filter(w => w.length > 2)[0] || norm(e.title)
                    ) && norm(c.author).includes(norm(e.author).split(" ").pop())
            );
            if (r)
                out.push({
                    ...e,
                    title: r.title,
                    author: r.author || e.author,
                    year: r.year,
                    pages: r.pages,
                    cover: r.cover,
                    olKey: r.olKey,
                    verified: true,
                });
            else if (e.threadCount >= 2 || e.count >= 3) out.push({ ...e, verified: false });
        } catch (err) {
            if (err.name === "AbortError") break;
            out.push({ ...e, verified: false });
        }
        await sleep(250);
    }
    return out;
}
async function srcReddit(m, seeds) {
    const subs = SUBREDDITS[m.shelf] || SUBREDDITS.fiction,
        mentions = [];
    let threads = 0;
    for (const s of seeds) {
        const q = `"${cleanTitle(titleOf(s))}"`;
        for (const sub of subs.slice(0, m.shelf === "fiction" ? 3 : 4)) {
            if (m.ctl.signal.aborted) return mentions;
            m.status = `Searching r/${sub} for ${cleanTitle(titleOf(s))}…`;
            renderOverlay();
            let posts = [];
            try {
                const j = await getJSON(
                    `https://www.reddit.com/r/${sub}/search.json?` +
                        new URLSearchParams({
                            q,
                            restrict_sr: "1",
                            sort: "relevance",
                            t: "all",
                            limit: "4",
                            raw_json: "1",
                        }),
                    m.ctl.signal
                );
                posts = ((j.data && j.data.children) || []).map(c => c.data).filter(p => p.num_comments > 3);
            } catch (err) {
                if (err.name === "AbortError") return mentions;
                if (err.rate) {
                    m.warn =
                        "Reddit started rate-limiting, so results are partial. Wait a minute before running again.";
                    return mentions;
                }
                if (err instanceof TypeError) throw new Error("reddit-blocked");
            }
            await sleep(1100);
            for (const p of posts.slice(0, 2)) {
                if (m.ctl.signal.aborted) return mentions;
                m.status = `Reading “${p.title.slice(0, 60)}” on r/${sub}…`;
                renderOverlay();
                try {
                    const j = await getJSON(
                        `https://www.reddit.com${p.permalink}.json?` +
                            new URLSearchParams({ limit: "200", depth: "3", sort: "top", raw_json: "1" }),
                        m.ctl.signal
                    );
                    const thread = {
                        url: "https://www.reddit.com" + p.permalink,
                        label: "r/" + sub + ": " + p.title.slice(0, 70),
                    };
                    const walk = arr => {
                        for (const c of arr || []) {
                            if (c.kind !== "t1") continue;
                            const d = c.data;
                            for (const x of extractBooks(d.body || "")) mentions.push({ ...x, score: d.score, thread });
                            if (d.replies && d.replies.data) walk(d.replies.data.children);
                        }
                    };
                    walk(j[1] && j[1].data && j[1].data.children);
                    threads++;
                } catch (err) {
                    if (err.name === "AbortError") return mentions;
                    if (err.rate) {
                        m.warn =
                            "Reddit started rate-limiting, so results are partial. Wait a minute before running again.";
                        return mentions;
                    }
                }
                await sleep(1100);
            }
        }
    }
    m.note = `Read ${threads} Reddit thread${threads === 1 ? "" : "s"}.`;
    return mentions;
}
async function srcHN(m, seeds) {
    const mentions = [];
    for (const s of seeds) {
        if (m.ctl.signal.aborted) break;
        m.status = `Searching Hacker News for ${cleanTitle(titleOf(s))}…`;
        renderOverlay();
        try {
            const j = await getJSON(
                "https://hn.algolia.com/api/v1/search?" +
                    new URLSearchParams({ query: `"${cleanTitle(titleOf(s))}"`, tags: "comment", hitsPerPage: "60" }),
                m.ctl.signal
            );
            for (const h of j.hits || []) {
                const thread = {
                    url: `https://news.ycombinator.com/item?id=${h.story_id || h.objectID}`,
                    label: "Hacker News: " + String(h.story_title || "discussion").slice(0, 70),
                };
                for (const x of extractBooks(h.comment_text || ""))
                    mentions.push({ ...x, score: h.points || 1, thread });
            }
        } catch (err) {
            if (err.name === "AbortError") break;
        }
        await sleep(400);
    }
    return mentions;
}
async function srcStack(m, seeds) {
    const mentions = [];
    for (const s of seeds) {
        if (m.ctl.signal.aborted) break;
        const site = m.shelf === "nonfiction" ? "philosophy" : SE_SITES[s.subject] || "math";
        m.status = `Searching ${site}.stackexchange for ${cleanTitle(titleOf(s))}…`;
        renderOverlay();
        try {
            const q = await getJSON(
                "https://api.stackexchange.com/2.3/search/advanced?" +
                    new URLSearchParams({
                        order: "desc",
                        sort: "votes",
                        q: cleanTitle(titleOf(s)),
                        site,
                        pagesize: "6",
                    }),
                m.ctl.signal
            );
            const ids = (q.items || []).map(i => i.question_id).slice(0, 6),
                titles = Object.fromEntries((q.items || []).map(i => [i.question_id, i]));
            if (ids.length) {
                await sleep(300);
                const a = await getJSON(
                    `https://api.stackexchange.com/2.3/questions/${ids.join(";")}/answers?` +
                        new URLSearchParams({ order: "desc", sort: "votes", site, filter: "withbody", pagesize: "60" }),
                    m.ctl.signal
                );
                for (const ans of a.items || []) {
                    const qi = titles[ans.question_id] || {};
                    const thread = {
                        url: qi.link || `https://${site}.stackexchange.com/q/${ans.question_id}`,
                        label:
                            site +
                            ".stackexchange: " +
                            String(qi.title || "question")
                                .replace(/&#39;/g, "'")
                                .replace(/&quot;/g, '"')
                                .slice(0, 70),
                    };
                    for (const x of extractBooks(ans.body || "")) mentions.push({ ...x, score: ans.score, thread });
                }
            }
        } catch (err) {
            if (err.name === "AbortError") break;
        }
        await sleep(400);
    }
    return mentions;
}
async function srcOpenLibrary(m) {
    const chosen = (meta.interests.subjects[m.shelf] || []).filter(s => !m.off.has(s.name)).slice(0, 7);
    if (!chosen.length) throw new Error("no-subjects");
    const keys = libraryKeys(),
        map = new Map();
    for (const s of chosen) {
        if (m.ctl.signal.aborted) break;
        m.status = `Browsing the “${s.name}” subject on Open Library…`;
        renderOverlay();
        try {
            const j = await getJSON(
                `https://openlibrary.org/subjects/${encodeURIComponent(s.name.replace(/\s+/g, "_"))}.json?limit=60`,
                m.ctl.signal
            );
            for (const w of j.works || []) {
                if (owned(w.title, keys)) continue;
                const e = map.get(w.key) || {
                    title: w.title,
                    author: (w.authors || [])
                        .map(a => a.name)
                        .slice(0, 2)
                        .join(" & "),
                    year: w.first_publish_year,
                    cover: w.cover_id ? olCover(w.cover_id) : "",
                    olKey: w.key,
                    subjects: [],
                    score: 0,
                    editions: w.edition_count || 1,
                    verified: true,
                };
                e.subjects.push(s.name);
                e.score += s.w;
                map.set(w.key, e);
            }
        } catch (err) {
            if (err.name === "AbortError") break;
        }
        await sleep(300);
    }
    return [...map.values()]
        .map(e => ({ ...e, rank: e.score * e.subjects.length * (1 + Math.log10(e.editions)) }))
        .sort((a, b) => b.rank - a.rank)
        .slice(0, 24)
        .map(e => ({
            ...e,
            reason: `Shares ${e.subjects.length} of your subjects: ${e.subjects.slice(0, 4).join(", ")}. ${e.editions} edition${e.editions === 1 ? "" : "s"} on Open Library.`,
        }));
}
async function srcAwards(m) {
    const labels = AWARDS.filter(([k]) => !m.offAwards.has(k)).flatMap(([, l]) => l);
    if (!labels.length) throw new Error("no-awards");
    m.status = "Asking Wikidata for award-winning novels…";
    renderOverlay();
    const query = `SELECT ?book ?bookLabel ?authorLabel ?awardLabel ?date WHERE { VALUES ?name { ${labels.map(l => JSON.stringify(l) + "@en").join(" ")} }
    ?award rdfs:label ?name . ?book p:P166 ?st . ?st ps:P166 ?award . OPTIONAL { ?st pq:P585 ?date } OPTIONAL { ?book wdt:P50 ?author }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 3000`;
    const j = await getJSON(
        "https://query.wikidata.org/sparql?" + new URLSearchParams({ format: "json", query }),
        m.ctl.signal
    );
    const keys = libraryKeys(),
        map = new Map();
    for (const r of j.results.bindings) {
        const title = r.bookLabel && r.bookLabel.value;
        if (!title || /^Q\d+$/.test(title) || owned(title, keys)) continue;
        const e = map.get(r.book.value) || {
            title,
            author: r.authorLabel ? r.authorLabel.value : "",
            awards: new Map(),
            year: null,
            wikidata: r.book.value,
        };
        const y = r.date ? parseInt(r.date.value, 10) : null;
        e.awards.set(r.awardLabel.value, y);
        if (y && (!e.year || y < e.year)) e.year = y;
        map.set(r.book.value, e);
    }
    const pool = [...map.values()]
        .map(e => ({ ...e, awardList: [...e.awards.entries()] }))
        .sort((a, b) => b.awardList.length - a.awardList.length || (b.year || 0) - (a.year || 0));
    return pool.slice(0, 40).map(e => ({
        title: e.title,
        author: e.author,
        year: e.year,
        verified: false,
        wikidata: e.wikidata,
        reason:
            "Won " +
            e.awardList
                .map(
                    ([a, y]) =>
                        a.replace(" for Best Novel", "").replace("Award—Novel", "Award") + (y ? " (" + y + ")" : "")
                )
                .join(", ") +
            ".",
    }));
}
function searchLinks(b) {
    const t = cleanTitle(titleOf(b)),
        a = firstAuthor(b.creator),
        ta = encodeURIComponent(t + " " + a),
        M = MEDIA[b.medium] ? b.medium : "book";
    const like = encodeURIComponent(
        `${M === "book" ? "books" : M === "anime" ? "anime" : M === "game" ? "games" : M === "album" ? "albums" : M === "film" ? "movies" : M === "tv" ? "shows" : "manga"} like "${t}"`
    );
    const L = [["Reddit", `https://www.reddit.com/search/?q=${like}`]];
    if (M === "book" || M === "comic")
        L.push(
            ["Goodreads", `https://www.goodreads.com/search?q=${ta}`],
            ["StoryGraph", `https://app.thestorygraph.com/browse?search_term=${encodeURIComponent(t)}`],
            ["LibraryThing", `https://www.librarything.com/search.php?search=${encodeURIComponent(t)}`],
            ["Literature-Map", `https://www.literature-map.com/${a.toLowerCase().replace(/\s+/g, "+")}`]
        );
    if (["anime", "manga", "manhwa", "novel"].includes(M))
        L.push(
            [
                "AniList",
                b.ext && b.ext.anilist
                    ? `https://anilist.co/${M === "anime" ? "anime" : "manga"}/${b.ext.anilist}`
                    : `https://anilist.co/search/${M === "anime" ? "anime" : "manga"}?search=${encodeURIComponent(t)}`,
            ],
            [
                "MyAnimeList recs",
                b.ext && b.ext.mal
                    ? `https://myanimelist.net/${M === "anime" ? "anime" : "manga"}/${b.ext.mal}/_/userrecs`
                    : `https://myanimelist.net/search/all?q=${encodeURIComponent(t)}`,
            ]
        );
    if (M === "film")
        L.push(
            ["Letterboxd", `https://letterboxd.com/search/${encodeURIComponent(t)}/`],
            ["Taste.io", `https://www.taste.io/search?q=${encodeURIComponent(t)}`]
        );
    if (M === "tv")
        L.push(
            ["MyDramaList", `https://mydramalist.com/search?q=${encodeURIComponent(t)}`],
            ["TVmaze", `https://www.tvmaze.com/search?q=${encodeURIComponent(t)}`]
        );
    if (M === "game")
        L.push(
            ["Backloggd", `https://backloggd.com/search/games/${encodeURIComponent(t)}`],
            ["r/gamingsuggestions", `https://www.reddit.com/r/gamingsuggestions/search/?q=${encodeURIComponent(t)}`]
        );
    L.push(["TV Tropes", `https://tvtropes.org/pmwiki/search_result.php?q=${encodeURIComponent(t)}`]);
    if (b.shelf === "academic")
        L.push(
            ["Math Stack Exchange", `https://math.stackexchange.com/search?q=${encodeURIComponent(t)}`],
            ["Hacker News", `https://hn.algolia.com/?q=${encodeURIComponent(t)}`]
        );
    return L;
}

// ── other versions: adaptations, sequels and spin-offs of things you love ──
function versionsLocal() {
    const keys = libraryKeys(),
        byAl = new Set([...items.values()].map(b => b.ext && b.ext.anilist).filter(Boolean)),
        out = new Map();
    for (const b of topSeeds(b => (b.rel || []).length, 80)) {
        for (const r of b.rel) {
            if (
                byAl.has(r.id) ||
                out.has(r.id) ||
                owned(r.title, keys) ||
                (meta.dismissed || []).includes(r.title + " — ")
            )
                continue;
            if (!["adaptation", "sequel", "side", "prequel", "world"].includes(r.type)) continue;
            const cross = r.medium !== b.medium;
            out.set(r.id, {
                title: r.title,
                medium: r.medium,
                kind: r.kind,
                year: r.year,
                cover: r.cover,
                w: b.w + (cross ? 3 : 0) + (r.type === "sequel" ? 1.5 : 0) + (r.type === "adaptation" ? 1 : 0),
                reason: `${r.label} of ${titleOf(b)}${b.rating ? ", which you gave " + b.rating : b.fav ? ", one of your favourites" : ""}.`,
                alId: r.id,
                from: b.id,
            });
        }
    }
    return [...out.values()].sort((a, b) => b.w - a.w).slice(0, 40);
}
async function versionsWikidata(m) {
    const seeds = topSeeds(b => !b.ext.anilist || ["anime", "manga", "novel"].includes(b.medium), 10);
    const keys = libraryKeys(),
        found = [];
    const q2s = {};
    for (const s of seeds) {
        if (m.ctl.signal.aborted) break;
        m.status = `Looking up ${cleanTitle(titleOf(s))} on Wikidata…`;
        renderOverlay();
        try {
            const q = s.ext.wikidata || (await wdFind((s.alt && s.alt.en) || s.title, s.medium, s.year, m.ctl.signal));
            if (q) {
                q2s[q] = s;
                if (!s.ext.wikidata) quietPatch(s.id, { ext: { ...s.ext, wikidata: q } });
            }
        } catch (e) {
            if (e.name === "AbortError") break;
        }
        await sleep(150);
    }
    const qids = Object.keys(q2s);
    if (qids.length) {
        m.status = "Finding adaptations…";
        renderOverlay();
        const rows = await wdAdaptations(qids, m.ctl.signal);
        for (const r of rows) {
            const medium = wdMediumOf(r.desc);
            if (!medium || owned(r.title, keys)) continue;
            const s = q2s[r.src];
            if (found.some(f => f.qid === r.qid)) continue;
            found.push({
                qid: r.qid,
                title: r.title,
                medium,
                kind: "",
                year: yearOf((r.desc.match(/\b(19|20)\d\d\b/) || [])[0]),
                reason: `${r.dir === "to" ? titleOf(s) + " is based on it" : "Based on " + titleOf(s)}. ${r.desc}`,
                from: s.id,
                w: s.w + (medium !== s.medium ? 2 : 0),
            });
        }
    }
    return found.sort((a, b) => b.w - a.w);
}
// ── fans also liked (AniList user recommendations) ──
async function fansAlsoLiked(m) {
    const target = m.target || "any";
    const seeds = topSeeds(b => b.ext.anilist && (b.rating >= 7 || b.fav || b.status === "active"), 8);
    if (!seeds.length) throw new Error("no-al-seeds");
    const keys = libraryKeys(),
        byAl = new Set([...items.values()].map(b => b.ext && b.ext.anilist).filter(Boolean)),
        map = new Map();
    for (const s of seeds) {
        if (m.ctl.signal.aborted) break;
        m.status = `Reading AniList recommendations for ${cleanTitle(titleOf(s))}…`;
        renderOverlay();
        try {
            for (const r of await alRecommendations(s.ext.anilist, m.ctl.signal)) {
                if (
                    byAl.has(r.ext.anilist) ||
                    owned(r.title, keys) ||
                    (target !== "any" && r.medium !== target) ||
                    (meta.settings.hideFlagged && r.flag)
                )
                    continue;
                const e = map.get(r.ext.anilist) || { ...r, score: 0, seeds: [] };
                e.score += Math.log2(2 + Math.max(0, r.votes)) * s.w;
                if (!e.seeds.includes(titleOf(s))) e.seeds.push(titleOf(s));
                map.set(r.ext.anilist, e);
            }
        } catch (e) {
            if (e.name === "AbortError") break;
            if (e.offline) throw e;
        }
    }
    return [...map.values()]
        .sort((a, b) => b.seeds.length - a.seeds.length || b.score - a.score)
        .slice(0, 30)
        .map(e => ({
            ...e,
            reason: `Recommended by AniList users who liked ${e.seeds.slice(0, 3).join(", ")}${e.seeds.length > 3 ? " and " + (e.seeds.length - 3) + " more" : ""}.${e.scores.anilist ? " Scores " + e.scores.anilist + "% on AniList." : ""}`,
            add: e,
        }));
}
// ── film & TV (TMDB recommendations; needs the free key) ──
async function screenRecs(m) {
    if (!TMDB_ON()) throw new Error("no-tmdb");
    const seeds = topSeeds(b => ["film", "tv", "anime"].includes(b.medium), 8);
    if (!seeds.length) throw new Error("no-screen-seeds");
    const keys = libraryKeys(),
        map = new Map();
    for (const s of seeds) {
        if (m.ctl.signal.aborted) break;
        m.status = `Asking TMDB about ${cleanTitle(titleOf(s))}…`;
        renderOverlay();
        try {
            let id = s.ext.tmdb,
                type = s.ext.tmdbType || (s.medium === "film" ? "movie" : "tv");
            if (!id) {
                const r = (
                    await tmdbSearch(
                        cleanTitle((s.alt && s.alt.en) || s.title),
                        s.medium === "film" ? "film" : "tv",
                        m.ctl.signal
                    )
                )[0];
                if (r) {
                    id = r.ext.tmdb;
                    type = r.ext.tmdbType;
                }
            }
            if (!id) continue;
            const d = await tmdbDetails(id, type, m.ctl.signal);
            for (const r of d.recs || []) {
                if (owned(r.title, keys) || (m.target && m.target !== "any" && r.medium !== m.target)) continue;
                const e = map.get(r.ext.tmdb + r.ext.tmdbType) || { ...r, score: 0, seeds: [] };
                e.score += s.w * (1 + (r.scores.tmdb || 6) / 10);
                if (!e.seeds.includes(titleOf(s))) e.seeds.push(titleOf(s));
                map.set(r.ext.tmdb + r.ext.tmdbType, e);
            }
        } catch (e) {
            if (e.name === "AbortError") break;
            if (e.auth) throw new Error("tmdb-auth");
        }
    }
    return [...map.values()]
        .sort((a, b) => b.seeds.length - a.seeds.length || b.score - a.score)
        .slice(0, 30)
        .map(e => ({
            ...e,
            reason: `TMDB recommends it to people who watched ${e.seeds.slice(0, 3).join(", ")}.${e.scores.tmdb ? " " + e.scores.tmdb + " on TMDB." : ""}`,
            add: e,
        }));
}
// ── games (RAWG; needs the free key). Your strongest genres and themes from every medium, matched to RAWG tags. ──
const RAWG_TAGS = {
    mystery: "mystery",
    psychological: "psychological",
    thriller: "thriller",
    "sci-fi": "sci-fi",
    fantasy: "fantasy",
    romance: "romance",
    horror: "horror",
    "slice of life": "relaxing",
    drama: "story-rich",
    comedy: "funny",
    supernatural: "supernatural",
    "time travel": "time-travel",
    detective: "detective",
    "time manipulation": "time-travel",
    "anti-hero": "dark",
    tragedy: "emotional",
    "mahou shoujo": "magic",
    magic: "magic",
    "post-apocalyptic": "post-apocalyptic",
    cyberpunk: "cyberpunk",
    school: "school",
    "visual novel": "visual-novel",
    heist: "heist",
    survival: "survival",
    sports: "sports",
};
async function gameRecs(m) {
    if (!KEYS.rawg) throw new Error("no-rawg");
    const w = {};
    for (const b of topSeeds(() => true, 60))
        for (const g of [...(b.genres || []), ...(b.themes || [])]) {
            const t = RAWG_TAGS[norm(g)];
            if (t) w[t] = (w[t] || 0) + b.w;
        }
    const tags = Object.entries(w)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(x => x[0]);
    if (!tags.length) tags.push("story-rich");
    const keys = libraryKeys(),
        out = new Map();
    for (const t of tags) {
        if (m.ctl.signal.aborted) break;
        m.status = `Finding highly rated "${t}" games on RAWG…`;
        renderOverlay();
        try {
            const j = await rawg(
                "/games",
                {
                    tags: [t, "story-rich"].filter((x, i, a) => a.indexOf(x) === i).join(","),
                    ordering: "-rating",
                    metacritic: "75,100",
                    page_size: "20",
                },
                m.ctl.signal
            );
            for (const g of j.results || []) {
                const f = rawgFields(g);
                if (owned(f.title, keys)) continue;
                const e = out.get(f.ext.rawg) || { ...f, tags: [] };
                e.tags.push(t);
                out.set(f.ext.rawg, e);
            }
        } catch (e) {
            if (e.name === "AbortError") break;
            if (e.auth) throw new Error("rawg-auth");
        }
    }
    return [...out.values()]
        .sort((a, b) => b.tags.length - a.tags.length || (b.scores.meta || 0) - (a.scores.meta || 0))
        .slice(0, 30)
        .map(e => ({
            ...e,
            reason: `Tagged ${e.tags.join(", ")}, which matches what you rate highly across your stacks.${e.scores.meta ? " Metacritic " + e.scores.meta + "." : ""}`,
            add: e,
        }));
}
async function runDiscover() {
    const m = ui.modal;
    m.busy = true;
    m.error = "";
    m.warn = "";
    m.note = "";
    m.results = null;
    m.ctl = new AbortController();
    renderOverlay();
    try {
        if (m.mode === "versions") {
            m.wd = await versionsWikidata(m);
        } else if (m.mode === "fans") m.results = await fansAlsoLiked(m);
        else if (m.mode === "screen") m.results = await screenRecs(m);
        else if (m.mode === "games") m.results = await gameRecs(m);
        else {
            const seedItems =
                m.seed === "auto"
                    ? topSeeds(isBookShelf(m.shelf), m.source === "reddit" ? 2 : 4)
                    : [{ ...items.get(m.seed), id: m.seed }].filter(s => s.title);
            const seedTitles = new Set(seedItems.map(s => norm(cleanTitle(titleOf(s)))));
            let results;
            if (m.source === "openlibrary") results = await srcOpenLibrary(m);
            else if (m.source === "awards") {
                results = await srcAwards(m);
                m.status = "Finding covers…";
                renderOverlay();
                const withCovers = [];
                for (const e of results.slice(0, 24)) {
                    if (m.ctl.signal.aborted) break;
                    try {
                        const r = (await olSearch(e.title + " " + e.author, 2, m.ctl.signal)).find(
                            c =>
                                c.cover &&
                                norm(c.title).includes(
                                    norm(e.title)
                                        .split(" ")
                                        .filter(w => w.length > 2)[0] || norm(e.title)
                                )
                        );
                        withCovers.push(
                            r
                                ? {
                                      ...e,
                                      cover: r.cover,
                                      olKey: r.olKey,
                                      pages: r.pages,
                                      year: e.year || r.year,
                                      verified: true,
                                  }
                                : e
                        );
                    } catch (err) {
                        if (err.name === "AbortError") break;
                        withCovers.push(e);
                    }
                    await sleep(200);
                }
                results = withCovers;
            } else {
                if (!seedItems.length) throw new Error("no-seeds");
                const mentions =
                    m.source === "reddit"
                        ? await srcReddit(m, seedItems)
                        : m.source === "hn"
                          ? await srcHN(m, seedItems)
                          : await srcStack(m, seedItems);
                const tallied = tallyMentions(mentions, libraryKeys(), seedTitles);
                results = tallied.length
                    ? (await verifyResults(tallied, m)).map(e => ({
                          ...e,
                          reason: `Mentioned ${e.count} time${e.count === 1 ? "" : "s"} across ${e.threadCount} thread${e.threadCount === 1 ? "" : "s"} about ${seedItems.map(s => cleanTitle(titleOf(s))).join(" and ")}.`,
                      }))
                    : [];
            }
            m.results = results.map(r => ({
                ...r,
                medium: "book",
                creator: r.author,
                add: {
                    medium: "book",
                    title: r.title,
                    creator: r.author || "",
                    shelf: m.shelf,
                    year: parseInt(r.year, 10) || null,
                    total: r.pages || null,
                    cover: r.cover || "",
                    ext: r.olKey ? { olKey: r.olKey } : {},
                    why: r.reason || "",
                    notes:
                        "Found via " +
                        {
                            reddit: "Reddit",
                            openlibrary: "Open Library",
                            awards: "award lists",
                            hn: "Hacker News",
                            stack: "Stack Exchange",
                        }[m.source] +
                        (r.threads && r.threads[0] ? ": " + r.threads[0].url : ""),
                    source: m.source,
                },
            }));
        }
    } catch (err) {
        if (err.name !== "AbortError") {
            m.error =
                {
                    "reddit-blocked":
                        "Couldn't reach Reddit. Check you're online; if you are, Reddit is refusing requests from this file right now, so use the search links below instead.",
                    "no-subjects": "No subjects yet for this shelf. Press “Sync my interests” first.",
                    "no-awards": "Pick at least one award.",
                    "no-seeds":
                        "Score, finish or favourite some books on this shelf first, so there's something to start from.",
                    "no-al-seeds":
                        "Score or favourite some anime or manga first (or sync AniList), so there's something to start from.",
                    "no-tmdb":
                        "This needs a free TMDB key. Add one in Settings → Data sources. Meanwhile, Other versions finds films and shows based on things you love, without a key.",
                    "no-rawg":
                        "This needs a free RAWG key. Add one in Settings → Data sources. Meanwhile, Other versions finds games based on things you love, without a key.",
                    "no-screen-seeds": "Score or favourite some films, shows or anime first.",
                    "tmdb-auth": "TMDB rejected the key. Check it in Settings.",
                    "rawg-auth": "RAWG rejected the key. Check it in Settings.",
                }[err.message] ||
                (err.offline
                    ? "Couldn't reach AniList. Check you're online."
                    : "A source didn't respond. Check you're online and try again.");
        }
    }
    m.busy = false;
    m.status = "";
    renderOverlay();
}
function recCard(r, i, kind = "r") {
    const md = r.medium || "book";
    return `<div class="rec">${coverHTML({ title: r.title, creator: r.creator || r.author, medium: md, cover: r.cover, year: r.year })}
    <div><div class="eyebrow" style="font-size:9.5px">${mDot(md)}${esc(MEDIA[md] ? MEDIA[md].one : md)}${r.kind ? " · " + esc(r.kind) : ""}</div><div class="t">${esc(r.title)}</div><div class="hint">${esc(r.creator || r.author || "")}${r.year ? " · " + esc(r.year) : ""}${r.pages ? " · " + r.pages + " pp" : ""}${r.verified === false ? " · not matched on Open Library" : ""}</div>
    <p class="why">${esc(r.reason || "")}</p>
    ${
        r.threads && r.threads.length
            ? `<p>${r.threads
                  .slice(0, 3)
                  .map(
                      t =>
                          `<a class="link" href="${esc(safeUrl(t.url))}" target="_blank" rel="noopener">${esc(t.label)} ↗</a>`
                  )
                  .join("<br>")}</p>`
            : ""
    }
    ${r.olKey ? `<p><a class="link" href="https://openlibrary.org${esc(r.olKey)}" target="_blank" rel="noopener">Open Library ↗</a></p>` : r.wikidata ? `<p><a class="link" href="${esc(safeUrl(r.wikidata))}" target="_blank" rel="noopener">Wikidata ↗</a></p>` : r.qid ? `<p><a class="link" href="https://www.wikidata.org/wiki/${esc(r.qid)}" target="_blank" rel="noopener">Wikidata ↗</a></p>` : ""}
    <div class="bar" style="margin-top:8px">${r.added ? `<span class="pill own">Added</span>` : r.dismissed ? `<span class="pill">Dismissed</span>` : `<button class="btn gold" data-act="rec-add" data-k="${i}" data-list="${kind}">+ Add as planned</button><button class="btn ghost" data-act="rec-no" data-k="${i}" data-list="${kind}">Not for me</button>`}</div></div></div>`;
}
MODALS.discover = function (m) {
    m.mode = m.mode || "versions";
    m.shelf = m.shelf || "fiction";
    m.source = m.source || "reddit";
    m.seed = m.seed || "auto";
    m.off = m.off || new Set();
    m.offAwards = m.offAwards || new Set();
    m.target = m.target || "any";
    if (!SOURCE_SHELVES[m.source].includes(m.shelf))
        m.source = SOURCE_SHELVES.reddit.includes(m.shelf) ? "reddit" : "openlibrary";
    const modes = `<div class="tabs" role="tablist">${DISC_MODES.map(([k, l]) => `<button role="tab" aria-selected="${m.mode === k}" data-act="disc-mode" data-k="${k}">${esc(l)}</button>`).join("")}</div>`;
    const goBtn = label =>
        `<div class="bar"><button class="btn gold" data-act="disc-go" ${m.busy || m.syncing ? "disabled" : ""}>${label}</button>${m.busy ? `<span class="think">${esc(m.status || "Working…")}</span><button class="btn ghost" data-act="stop">Stop</button>` : ""}</div>${m.error ? `<p class="err">${esc(m.error)}</p>` : ""}${m.warn ? `<p class="err">${esc(m.warn)}</p>` : ""}${m.note && m.results ? `<p class="hint">${esc(m.note)}</p>` : ""}`;
    const results = list =>
        list
            ? list.length
                ? `<div class="recs">${list.map((r, i) => recCard(r, i)).join("")}</div>`
                : `<p class="hint">Nothing new turned up. Try another starting point.</p>`
            : "";
    let body = "";
    if (m.mode === "versions") {
        m.local = m.local || versionsLocal();
        body = `<p class="hint">Sequels, adaptations and spin-offs of what you've loved that aren't in your stacks yet: the anime of a manga you read, the manga an anime came from, the film of a book. AniList relations are instant; Wikidata covers films, shows, games and books.</p>
      ${m.local.length ? `<p class="label">From AniList · ${m.local.length}</p><div class="recs">${m.local.map((r, i) => recCard(r, i, "local")).join("")}</div>` : `<p class="hint">${meta.profile.anilist ? "Nothing missing from AniList's relations. Nice." : "Sync AniList to see the other versions of your anime and manga."}</p>`}
      <div class="sec" style="margin-top:6px"><p class="label">From Wikidata</p>${goBtn(m.wd ? "Check again" : "Find adaptations of my favourites")}
        ${m.wd ? (m.wd.length ? `<div class="recs">${m.wd.map((r, i) => recCard(r, i, "wd")).join("")}</div>` : `<p class="hint">Wikidata didn't list any adaptations you don't already have.</p>`) : ""}</div>`;
    } else if (m.mode === "fans") {
        body = `<p class="hint">What AniList users recommend to people who liked your best-scored and favourite anime and manga, counted across all of them.</p>
      <div class="bar"><span class="hint">Show</span><div class="seg">${[
          ["any", "Everything"],
          ["anime", "Anime"],
          ["manga", "Manga"],
          ["manhwa", "Manhwa"],
          ["novel", "Light novels"],
      ]
          .map(
              ([k, l]) => `<button data-act="disc-target" data-k="${k}" aria-pressed="${m.target === k}">${l}</button>`
          )
          .join("")}</div></div>
      ${goBtn(m.results ? "Search again" : "Find recommendations")}${results(m.results)}`;
    } else if (m.mode === "screen") {
        body = `<p class="hint">${TMDB_ON() ? "TMDB's recommendations for your best-scored films, shows and anime, counted across all of them." : "TMDB's recommendations need a free key (Settings → Data sources). Without one, use Other versions for adaptations, or the search links below."}</p>
      <div class="bar"><span class="hint">Show</span><div class="seg">${[
          ["any", "Both"],
          ["film", "Films"],
          ["tv", "Shows"],
      ]
          .map(
              ([k, l]) => `<button data-act="disc-target" data-k="${k}" aria-pressed="${m.target === k}">${l}</button>`
          )
          .join("")}</div></div>
      ${goBtn(m.results ? "Search again" : "Find films and shows")}${results(m.results)}`;
    } else if (m.mode === "games") {
        body = `<p class="hint">${KEYS.rawg ? "Highly rated games tagged with the genres and themes you score highest across books, anime and everything else." : "Game recommendations need a free RAWG key (Settings → Data sources). Without one, Other versions finds games based on things you love."}</p>
      ${goBtn(m.results ? "Search again" : "Find games")}${results(m.results)}`;
    } else {
        const seeds = topSeeds(() => true, 40),
            subs = meta.interests.subjects[m.shelf] || [];
        const seedBook =
            m.seed === "auto" ? topSeeds(isBookShelf(m.shelf), 1)[0] : { id: m.seed, ...items.get(m.seed) };
        body = `<div class="sec"><p class="label">Your book interests</p>
        <p class="hint">${meta.interests.syncedAt ? `Synced ${fmtDate(meta.interests.syncedAt)} from ${meta.interests.seeds.length} of your books.` : "Not synced yet. Syncing reads the subjects of your top books from Open Library."}</p>
        <div class="bar"><button class="btn" data-act="sync" ${m.busy || m.syncing ? "disabled" : ""}>${m.syncing ? `Syncing ${m.syncDone} of ${m.syncTotal}…` : meta.interests.syncedAt ? "Sync again" : "Sync my interests"}</button>${m.syncing ? `<button class="btn ghost" data-act="stop">Stop</button>` : ""}</div>
        ${subs.length ? `<div class="chips wrapchips" role="group" aria-label="Subjects">${subs.map(s => `<button class="chip" data-act="subj-toggle" data-k="${esc(s.name)}" aria-pressed="${!m.off.has(s.name)}" title="weight ${s.w}">${esc(s.name)}</button>`).join("")}</div><p class="hint">Tap a subject to leave it out of Open Library results.</p>` : ""}</div>
      <div class="sec"><p class="label">Shelf</p><div class="seg" role="group">${[
          ["fiction", "Fiction"],
          ["academic", "Academic"],
          ["nonfiction", "Non-fiction"],
      ]
          .map(([k, l]) => `<button data-act="disc-shelf" data-k="${k}" aria-pressed="${m.shelf === k}">${l}</button>`)
          .join("")}</div>
        <p class="label" style="margin-top:14px">Source</p><div class="chips wrapchips" role="group">${SOURCES.filter(
            ([k]) => SOURCE_SHELVES[k].includes(m.shelf)
        )
            .map(
                ([k, l]) =>
                    `<button class="chip" data-act="disc-source" data-k="${k}" aria-pressed="${m.source === k}">${l}</button>`
            )
            .join("")}</div>
        <p class="hint" style="margin-top:6px">${{ reddit: "Finds Reddit threads that mention your starting point, reads the comments and counts which books people recommend. Start from an anime or a game to get books for fans of it.", openlibrary: "Ranks books that share the most subjects with your top books, weighted by how many editions they've had.", awards: "Novels that won major awards (Hugo, Nebula, Booker, Edgar and more), from Wikidata.", hn: "Counts books recommended in Hacker News comments that mention your starting point.", stack: "Counts books recommended in Stack Exchange answers that mention your starting point." }[m.source]}</p>
        ${["reddit", "hn", "stack"].includes(m.source) ? `<div class="field" style="margin-top:10px;max-width:460px"><label for="d-seed">Start from</label><select id="d-seed"><option value="auto"${m.seed === "auto" ? " selected" : ""}>My top ${m.source === "reddit" ? 2 : 4} ${m.shelf === "academic" ? "academic" : m.shelf === "nonfiction" ? "non-fiction" : "fiction"} books</option>${seeds.map(s => `<option value="${esc(s.id)}"${m.seed === s.id ? " selected" : ""}>${esc(MEDIA[s.medium].one)}: ${esc(titleOf(s))}</option>`).join("")}</select></div>` : ""}
        ${m.source === "awards" ? `<div class="chips wrapchips" style="margin-top:10px" role="group" aria-label="Awards">${AWARDS.map(([k]) => `<button class="chip" data-act="award-toggle" data-k="${esc(k)}" aria-pressed="${!m.offAwards.has(k)}">${esc(k)}</button>`).join("")}</div>` : ""}</div>
      ${goBtn(m.results ? "Search again" : "Find books")}${results(m.results)}
      ${
          seedBook && seedBook.title
              ? `<div class="sec"><p class="label">Search elsewhere for things like ${esc(cleanTitle(titleOf(seedBook)))}</p><p>${searchLinks(
                    seedBook
                )
                    .map(
                        ([l, u]) =>
                            `<a class="link" href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(l)} ↗</a>`
                    )
                    .join(" &nbsp;·&nbsp; ")}</p></div>`
              : ""
      }`;
    }
    const top = topSeeds(() => true, 1)[0];
    return (
        head(
            "Discover",
            `<span class="hint dhint">From AniList, TMDB, RAWG, Wikidata, Reddit and forums. Never from an AI.</span>`
        ) +
        modes +
        `<div class="sec" style="border:0;padding-top:4px">${body}</div>` +
        (m.mode !== "books" && top
            ? `<div class="sec"><p class="label">Search elsewhere for things like ${esc(cleanTitle(titleOf(top)))}</p><p>${searchLinks(
                  top
              )
                  .map(
                      ([l, u]) =>
                          `<a class="link" href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${esc(l)} ↗</a>`
                  )
                  .join(" &nbsp;·&nbsp; ")}</p></div>`
            : "")
    );
};
