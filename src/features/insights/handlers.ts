// src/features/insights/handlers.ts
// ─────────────────────────────────────────────────────────────────
//  Insights: what its buttons do
//
//  Discover, the seasonal chart, Pick for me, ranking, duplicates, the yearly wrap and stats. core/actions.ts calls
//  insightsClick() for every button with a data-act; it returns true when the button is one of these. e is the click, t
//  the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

import { addItem, markDirty, meta, patch, scheduleSave, toast, ui, undo } from "../core/core";
import type { ActEl } from "../core/core";
import type { ItemDraft, Modal, Recommendation } from "../core/model";
import { autoCovers, cacheAndColour, updateItemTiles } from "../sources/covers";
import { mergeInto, nextPair, rankPick, rankState } from "../core/views";
import { renderMain } from "../core/shell";
import { renderOverlay } from "../core/modals";
import { isRec, syncInterests } from "./discover";
import { addFromAniList, addFromWikidata } from "../library/item-actions";

// Discover's lists: the main results, AniList's other versions ("local") or Wikidata's ("wd")
const recList = (m: Modal, which: string | undefined): Recommendation[] =>
    which === "local" ? m.local || [] : which === "wd" ? m.wd || [] : (m.results || []).filter(isRec);
export async function insightsClick(
    _e: Event,
    t: ActEl,
    act: string,
    key: string | undefined,
    id: string | undefined,
    m: Modal | null
): Promise<boolean> {
    const k = key ?? "";
    switch (act) {
        case "wrap-year":
            ui.wrapYear = Number(k);
            renderMain();
            return true;
        case "stats-basis":
            ui.statsBasis = k;
            renderMain();
            return true;
        case "pick-art": {
            const c = m?.art?.[Number(k)],
                as = t.dataset.as;
            if (!m?.id || !c) return true;
            const mid = m.id;
            if (as === "cover") {
                patch(
                    mid,
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
                cacheAndColour(mid).then(() => {
                    updateItemTiles(mid);
                    scheduleSave();
                });
            } else if (as === "banner") patch(mid, { banner: c.cover }, "Change banner");
            else if (as === "spine") {
                patch(mid, { spineArt: c.cover, spinePicked: true }, "Change spine");
                toast("Spine changed", { label: "Undo", fn: undo });
            } else patch(mid, { favArt: c.cover, favArtData: "" }, "Favourite picture");
            toast(as === "cover" ? "Cover set" : as === "banner" ? "Banner set" : "Favourite picture set", {
                label: "Undo",
                fn: undo,
            });
            return true;
        }
        case "sync":
            if (m) syncInterests(Object.assign(m, { ctl: new AbortController() }));
            return true;
        case "rec-add": {
            const r = m ? recList(m, t.dataset.list)[Number(k)] : undefined;
            if (!r) return true;
            r.added = true;
            renderOverlay();
            if (r.alId) await addFromAniList(r.alId, r.from);
            else if (r.qid) await addFromWikidata({ ...r, qid: r.qid, medium: r.medium || "" }, r.from);
            else {
                const a = r.add || { title: r.title };
                const data: ItemDraft = {
                    ...a,
                    status: "want",
                    source: String(a.src || a.source || "discover"),
                    why: String(a.why || r.reason || ""),
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
            const r = m ? recList(m, t.dataset.list)[Number(k)] : undefined;
            if (!r) return true;
            r.dismissed = true;
            meta.dismissed = [
                ...new Set([...(meta.dismissed || []), r.title + " — " + (r.creator || r.author || "")]),
            ].slice(-500);
            markDirty();
            renderOverlay();
            return true;
        }
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
            mergeInto(id || "", k.split(","));
            toast("Merged", { label: "Undo", fn: undo });
            return true;
    }
    return false;
}
