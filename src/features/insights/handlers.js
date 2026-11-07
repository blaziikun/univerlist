// src/features/insights/handlers.js
// ─────────────────────────────────────────────────────────────────
//  Insights: what its buttons do
//
//  Discover, the seasonal chart, Pick for me, ranking, duplicates, the yearly wrap and stats. core/actions.js calls
//  insightsClick() for every button with a data-act; it returns true when the button is one of these. e is the click, t
//  the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

async function insightsClick(e, t, act, k, id, m) {
    switch (act) {
        case "season-step": {
            const s = ui.season || seasonNow();
            if (k === "0") ui.season = null;
            else {
                let i = SEASONS.indexOf(s.season) + Number(k),
                    y = s.year;
                if (i < 0) {
                    i = 3;
                    y--;
                }
                if (i > 3) {
                    i = 0;
                    y++;
                }
                ui.season = { season: SEASONS[i], year: y };
            }
            seasonState.key = "";
            seasonState.list = null;
            seasonState.err = "";
            renderMain();
            return true;
        }
        case "season-only":
            ui.seasonOnly = k;
            renderMain();
            return true;
        case "season-refresh":
            loadSeason(true);
            return true;
        case "disc-open": {
            const mode = curMode();
            openModal("discover", {
                mode: k,
                shelf: (mode.match || []).includes("book:Academic") ? "academic" : "fiction",
            });
            return true;
        }
        case "wrap-year":
            ui.wrapYear = Number(k);
            renderMain();
            return true;
        case "stats-basis":
            ui.statsBasis = k;
            renderMain();
            return true;
        case "pick-art": {
            const c = m.art[Number(k)],
                as = t.dataset.as;
            if (as === "cover") {
                patch(
                    m.id,
                    {
                        cover: c.cover,
                        coverData: null,
                        coverChecked: true,
                        coverColor: null,
                        color: null,
                        coverPicked: true,
                    },
                    "Change cover"
                );
                cacheAndColour(m.id).then(() => {
                    updateItemTiles(m.id);
                    scheduleSave();
                });
            } else if (as === "banner") patch(m.id, { banner: c.cover }, "Change banner");
            else if (as === "spine") {
                patch(m.id, { spineArt: c.cover, spinePicked: true }, "Change spine");
                toast("Spine changed", { label: "Undo", fn: undo });
            } else patch(m.id, { favArt: c.cover, favArtData: "" }, "Favourite picture");
            toast(as === "cover" ? "Cover set" : as === "banner" ? "Banner set" : "Favourite picture set", {
                label: "Undo",
                fn: undo,
            });
            return true;
        }
        case "disc-mode":
            m.mode = k;
            m.results = null;
            m.error = "";
            m.target = "any";
            renderOverlay();
            return true;
        case "disc-target":
            m.target = k;
            m.results = null;
            renderOverlay();
            return true;
        case "disc-go":
            runDiscover();
            return true;
        case "sync":
            m.ctl = new AbortController();
            syncInterests(m);
            return true;
        case "disc-shelf":
            m.shelf = k;
            m.seed = "auto";
            m.results = null;
            m.error = "";
            renderOverlay();
            return true;
        case "disc-source":
            m.source = k;
            m.results = null;
            m.error = "";
            renderOverlay();
            return true;
        case "subj-toggle":
            m.off.has(k) ? m.off.delete(k) : m.off.add(k);
            renderOverlay();
            return true;
        case "award-toggle":
            m.offAwards.has(k) ? m.offAwards.delete(k) : m.offAwards.add(k);
            renderOverlay();
            return true;
        case "rec-add": {
            const list = t.dataset.list === "local" ? m.local : t.dataset.list === "wd" ? m.wd : m.results,
                r = list[Number(k)];
            r.added = true;
            renderOverlay();
            if (r.alId) await addFromAniList(r.alId, r.from);
            else if (r.qid) await addFromWikidata(r, r.from);
            else {
                const a = r.add || {};
                const data = {
                    ...a,
                    status: "want",
                    source: a.src || a.source || "discover",
                    why: a.why || r.reason || "",
                };
                delete data.src;
                delete data.recs;
                delete data.cast;
                delete data.votes;
                delete data.score;
                delete data.seeds;
                delete data.tags;
                delete data.reason;
                delete data.add;
                if (data.medium === "book" && !data.kind)
                    data.kind =
                        data.shelf === "academic" ? "Academic" : data.shelf === "nonfiction" ? "Non-fiction" : "Novel";
                const nid = addItem(data, "Add " + r.title);
                toast("Added " + r.title, { label: "Undo", fn: undo });
                if (!data.cover) setTimeout(() => autoCovers([nid]), 300);
                else cacheAndColour(nid).then(() => updateItemTiles(nid));
            }
            return true;
        }
        case "rec-no": {
            const list = t.dataset.list === "local" ? m.local : t.dataset.list === "wd" ? m.wd : m.results,
                r = list[Number(k)];
            r.dismissed = true;
            meta.dismissed = [
                ...new Set([...(meta.dismissed || []), r.title + " — " + (r.creator || r.author || "")]),
            ].slice(-500);
            markDirty();
            renderOverlay();
            return true;
        }
        case "pick-time":
            m.time = k;
            renderOverlay();
            return true;
        case "pick-media": {
            const j = m.media.indexOf(k);
            j < 0 ? m.media.push(k) : m.media.splice(j, 1);
            renderOverlay();
            return true;
        }
        case "pick-own":
            m.own = t.checked;
            renderOverlay();
            return true;
        case "pick-shuffle":
            m.shuffle = true;
            renderOverlay();
            m.shuffle = false;
            return true;
        case "rank-pick":
            rankPick(k === "draw" ? "draw" : Number(k));
            return true;
        case "rank-skip":
            rankState.pair = nextPair();
            renderMain();
            return true;
        case "rank-mode":
            rankState.mode = k;
            rankState.pair = null;
            rankState.recent = [];
            renderMain();
            return true;
        case "dup-keep":
            mergeInto(id, k.split(","));
            toast("Merged", { label: "Undo", fn: undo });
            return true;
    }
    return false;
}
