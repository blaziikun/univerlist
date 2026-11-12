// src/features/library/listadd.ts
// ─────────────────────────────────────────────────────────────────
//  Filling lists quickly: pick many things at once, or every character or cast member of a title
//
//  Lists of things: search everything (not only this mode or your favourites), tick as many as you like, add them
//  together. The dialogs are lists/PickItems.svelte and lists/CastToList.svelte; this keeps what they work out.
// ─────────────────────────────────────────────────────────────────

import { items, meta, norm, plural, titleOf, toast, ui } from "../core/core";
import { all, modeItems } from "../core/views";
import { closeModal, openModal } from "../core/modals";
import { entKey, newTierList, setTier } from "./tiers";
import { tabsFor } from "../core/tabs";
import { render } from "../core/navigation";
import { castCache, fetchCast } from "./item-actions";
import type { ActEl } from "../core/core";
import type { CastMember, Entry, Modal, TierPulled } from "../core/model";

// what's ticked: the entries (by id) in "pick entries", the people (by place) in a cast list
export const isIdSet = (s: unknown): s is Set<string> => s instanceof Set && [...s].every(x => typeof x === "string");
export const isPlaceSet = (s: unknown): s is Set<number> =>
    s instanceof Set && [...s].every(x => typeof x === "number");

/** what "pick entries" offers: its pool (this mode or everything, its medium, what's searched for), best first */
export function pickPool(m: Modal, q: string) {
    const nq = norm(q),
        many = m.purpose === "list",
        from = m.scope === "mode" ? modeItems() : all();
    const pool = from.filter(
        b =>
            (!m.filter || m.filter(b)) &&
            (!m.med || b.medium === m.med) &&
            (!nq || norm(titleOf(b) + " " + (b.creator || "") + " " + ((b.alt && b.alt.romaji) || "")).includes(nq))
    );
    const list: Entry[] = pool
        .sort((a, b) => Number(b.status === "done") - Number(a.status === "done") || (b.rating || 0) - (a.rating || 0))
        .slice(0, many ? 160 : 40);
    return { list, total: pool.length, media: [...new Set(from.map(b => b.medium))] };
}

// a title's characters or cast, into a ranked or tier list, in one go
/** the people of a cast list that can go in (characters with a name, or cast with an actor) */
export const castOf = (m: Modal): CastMember[] =>
    (castCache.get(m.id || "") || []).filter(c => (m.what === "chars" ? c.name : c.va));
/** put the people chosen (by place) into a list (dest: a tier list's id, "new-rank" or "new-tier"), and say so */
export function castToList(m: Modal, dest: string, sel: Set<number>) {
    const mid = m.id || "",
        b = items.get(mid),
        cast = castOf(m);
    if (!b) return;
    const add: Record<string, TierPulled> = {},
        into = dest.startsWith("new-") ? {} : (meta.lists || []).find(l => l.id === dest)?.ents;
    for (const i of sel) {
        const c = cast[i];
        if (!c) continue;
        if (m.what === "chars")
            add[entKey(into, c.name, mid)] = {
                name: c.name,
                image: c.src === "tmdb" ? "" : c.image || "",
                sub: titleOf(b),
            };
        else
            add[entKey(into, c.va || "")] = {
                name: c.va || "",
                image: c.vaImage || (c.src === "tmdb" ? c.image : "") || "",
                sub: c.name ? `${c.name} · ${titleOf(b)}` : titleOf(b),
            };
    }
    const keys = Object.keys(add);
    if (!keys.length) return;
    const lid = dest.startsWith("new-")
        ? newTierList({
              name: `${titleOf(b)}: ${m.what === "chars" ? "characters" : "cast"}`,
              layout: dest === "new-rank" ? "rank" : "tiers",
              what: m.what,
          })
        : dest;
    setTier(
        lid,
        X => {
            X.ents = { ...(X.ents || {}), ...add };
            if (X.layout === "rank") {
                const have = new Set(X.rows[0].ids);
                X.rows[0].ids.push(...keys.filter(x => !have.has(x)));
            }
            return X;
        },
        "Add to list"
    );
    closeModal();
    toast(`Added ${plural(keys.length, "entry", "entries")}`, {
        label: "Open the list",
        fn: () => {
            ui.page = "profile";
            ui.tab = "lists";
            ui.listId = lid;
            if (!tabsFor().includes("lists")) {
                const md = meta.modes.find(x => tabsFor(x).includes("lists"));
                if (md) ui.mode = md.id;
            }
            render();
            scrollTo(0, 0);
        },
    });
}
/** the card's "→ a list" under its characters or cast: loads them if need be, then opens the dialog */
export function castListClick(act: string, _t: ActEl, k: string | undefined) {
    if (act === "cast-tolist") {
        const im = ui.modal;
        if (!im || im.kind !== "item") return true;
        const what = k || "chars",
            id = im.id || "";
        const go = () => openModal("castlist", { id, what, back: { ...im } });
        if (castCache.has(id)) go();
        else
            fetchCast(id)
                .then(go)
                .catch(() => toast("Couldn't load the list for this"));
        return true;
    }
    return false;
}
