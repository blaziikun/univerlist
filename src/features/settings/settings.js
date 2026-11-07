// src/features/settings/settings.js
// ─────────────────────────────────────────────────────────────────
//  Settings: the section list, and what the Svelte sections share with the classic scripts
//
//  The page and every section are Svelte (Settings.svelte and sections/, beside this file). What stays here: the list
//  of sections (the command palette uses it too), helpers the classic scripts also use (selOf, the media-and-type grids
//  that Modes draws and events.js reads back, the theme list, the keys' descriptions), and the private collection's own
//  handlers, which keep its settings sealed inside it.
// ─────────────────────────────────────────────────────────────────

const SET_SECS_ALL = [
    ["general", "General"],
    ["account", "Account & sync"],
    ["library", "Library"],
    ["appearance", "Appearance"],
    ["backdrops", "Backdrops (beta)"],
    ["modes", "Modes"],
    ["data", "Data, sources & keys"],
    ["privacy", "Private collection"],
    ["ext", "Extensions"],
    ["keys", "Keybinds"],
    ["tags", "Tags"],
    ["advanced", "Advanced"],
];
// the sections (Settings.svelte draws them; the command palette lists them). Account & sync shows unless switched off;
// Backdrops (src/features/backdrops) once the Backdrop builder is switched on
const setSecs = () =>
    SET_SECS_ALL.filter(
        ([k]) => (k !== "account" || builtinOn("account")) && (k !== "backdrops" || builtinOn("backdrops"))
    );
const SET_ALIAS = {
    themes: "appearance",
    layout: "library",
    io: "data",
    imports: "data",
    export: "data",
    ratings: "general",
};
// the small support link in the corner, and the shelves-as-rows look, kept in step with the settings on every render
afterRenderHooks.push(() => {
    document.body.classList.toggle("shelfrows", !!meta.layout?.shelfRows);
    let f = document.getElementById("donatefoot");
    const html = donateLinkHTML("donatefoot");
    if (!html) {
        f?.remove();
        return;
    }
    if (!f) {
        f = document.createElement("div");
        f.id = "donatefoot";
        document.body.append(f);
    }
    if (f.innerHTML !== html) f.innerHTML = html;
});
const selOf = (id, opts, val, attrs = "") =>
    `<select class="sel"${id ? ` id="${id}"` : ""} ${attrs}>${opts.map(([k, l]) => `<option value="${esc(k)}"${String(val) === String(k) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
// the donate link (shown quietly at the foot of every page and in Settings): set its address under Advanced
const donateLinkHTML = (cls = "") => {
    const u = safeUrl(DONATE_URL);
    return u
        ? `<a class="donate ${cls}" href="${esc(safeUrl(u))}" target="_blank" rel="noopener">♥ Support ${esc(APP_NAME)}</a>`
        : "";
};

// ── Modes: the media-and-type grids (sections/Modes.svelte draws them; events.js reads them back) ──
function kindToggles(match, medium) {
    return ["", ...KINDS[medium]].map(k => [k, matchPats({ medium, kind: k }, match)]);
}
function matrixHTML(match, prefix, media = MEDIA_KEYS) {
    return `<div class="matrix">${media
        .map(m => {
            const t = kindToggles(match, m),
                on = t.filter(x => x[1]).length,
                allOn = on === t.length;
            return `<div class="mrow"><label class="ctl mm"><input type="checkbox" data-mm="${prefix}|${m}|*" ${allOn ? "checked" : ""}><b>${esc(MEDIA[m].name)}</b></label>
      <div class="chips">${t.map(([k, v]) => `<label class="kchip${v ? " on" : ""}"><input type="checkbox" data-mm="${prefix}|${m}|${esc(k)}" ${v ? "checked" : ""}>${esc(k || "No type")}</label>`).join("")}</div></div>`;
        })
        .join("")}</div>`;
}
function readMatrix(prefix) {
    const pats = [];
    for (const m of MEDIA_KEYS) {
        const boxes = $$(`[data-mm^="${prefix}|${m}|"]`).filter(x => !x.dataset.mm.endsWith("|*"));
        if (!boxes.length) continue;
        const on = boxes.filter(x => x.checked).map(x => x.dataset.mm.split("|")[2]);
        if (on.length === boxes.length) pats.push(m);
        else for (const k of on) pats.push(m + ":" + k);
    }
    return pats.length ? pats : ["__none"];
}
const themeList = () => Object.entries(meta.themes).filter(([, t]) => !t.hidden);
const themeOpts = () => themeList().map(([k, t]) => [k, t.name || k]);
function describePats(p) {
    const out = [],
        neg = [];
    for (const x of p || []) {
        if (x === "*") {
            out.push("everything");
            continue;
        }
        if (x === "__none") continue;
        const n = x.startsWith("!"),
            [m, k] = (n ? x.slice(1) : x).split(":");
        const name = (MEDIA[m] || { name: m }).name + (k !== undefined ? ": " + (k || "no type") : "");
        (n ? neg : out).push(name);
    }
    return (out.join(", ") || "nothing") + (neg.length ? " (except " + neg.join(", ") + ")" : "");
}
const editThemeId = () =>
    meta.themes[ui.editTheme]
        ? ui.editTheme
        : meta.themes[editingMode().theme]
          ? editingMode().theme
          : themeList()[0][0];
// ── Data, sources & keys: what each free key is for, and where to get it (sections/Data.svelte) ──
const KEY_INFO = {
    tmdb: [
        "TMDB",
        "Film and TV: posters, casts, recommendations and the best matches.",
        "https://www.themoviedb.org/settings/api",
        "Free account, then Settings → API. The short API key or the long read access token both work.",
    ],
    omdb: [
        "OMDb",
        "IMDb, Rotten Tomatoes and Metacritic scores for films and shows (1,000 lookups a day).",
        "https://www.omdbapi.com/apikey.aspx",
        "Pick the free tier; the key arrives by email.",
    ],
    rawg: [
        "RAWG",
        "Games: covers, Metacritic, time to beat, genres and platforms.",
        "https://rawg.io/apidocs",
        "Free account, then Get API key.",
    ],
    igdb: [
        "Your proxy",
        "One free Cloudflare Worker of your own for the databases that only answer servers: IGDB (games the way Backloggd has them: covers, characters, platforms, time to beat), SteamGridDB (every cover people have made for a game), TheGamesDB and ScreenScraper (the real box for each platform, and real spines), Comic Vine (every issue's cover) and Hardcover (book editions). Add only the keys you want.",
        "https://api-docs.igdb.com/#account-creation",
        "Put the script below into a free Cloudflare Worker, add the keys as its secrets, then paste the Worker's address here.",
    ],
};
// every picture the app shows, so they can be saved for offline and packed into the .zip
function offlineTargets() {
    const out = new Set(),
        add = u => {
            if (u && /^https:/.test(u)) out.add(u);
        };
    for (const b of items.values()) {
        add(b.cover);
        add(b.banner);
        add(b.favArt);
    }
    for (const c of meta.chars) add(c.image || c.alImage);
    for (const p of meta.people || []) add(p.image);
    const pr = meta.profile;
    add(pr.avatar);
    add(pr.banner);
    if (pr.anilist) {
        add(pr.anilist.avatar);
        add(pr.anilist.banner);
    }
    for (const m of meta.modes) {
        const mp = m.profile || {};
        add(mp.banner);
        add(mp.avatar);
    }
    return [...out];
}

// ----- the private collection's own settings (sections/Privacy.svelte draws them): stored encrypted inside it, never in
// the app or a backup in the clear -----
document.addEventListener("change", e => {
    const t = e.target;
    if (!vault.key || !vault.prefs) return;
    if (t.id === "sp-name") {
        SEALED_MODE.name = t.value.trim() || "Private";
        vault.sealDue = true;
        scheduleSave();
        renderSide();
    }
    if (t.dataset.spkind) {
        const m = t.dataset.spkind,
            v = t.value.trim();
        if (!v) return;
        const L = (vault.prefs.kinds[m] = vault.prefs.kinds[m] || []);
        if (!L.includes(v)) L.push(v);
        vault.sealDue = true;
        const n = sweepSealed();
        scheduleSave();
        renderMain();
        if (n) toast(`Moved ${plural(n, "entry", "entries")} in here`);
    }
});
document.addEventListener("click", e => {
    const t = e.target.closest("[data-act]");
    if (!t || !vault.key || !vault.prefs) return;
    const a = t.dataset.act;
    if (a === "sp-kind-del") {
        const L = vault.prefs.kinds[t.dataset.k] || [];
        L.splice(Number(t.dataset.i), 1);
        vault.sealDue = true;
        scheduleSave();
        renderMain();
    }
    if (a === "sp-link-del") {
        vault.prefs.links.splice(Number(t.dataset.i), 1);
        vault.sealDue = true;
        scheduleSave();
        renderMain();
    }
    if (a === "sp-link-add") {
        const name = $("#sp-lname").value.trim(),
            url = $("#sp-lurl").value.trim();
        if (!name || !/^https:\/\//.test(url)) {
            toast("Give it a name and an https:// address");
            return;
        }
        vault.prefs.links.push({ name, url: url.includes("{q}") ? url : url + "{q}" });
        vault.sealDue = true;
        scheduleSave();
        renderMain();
    }
});

document.addEventListener("click", async e => {
    const t = e.target.closest('[data-act="igdb-copy"]');
    if (!t) return;
    try {
        await navigator.clipboard.writeText(UNIVERLIST_WORKER);
        toast("Copied");
    } catch (_) {
        toast("Select the script and copy it");
    }
});
