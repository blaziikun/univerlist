// src/features/library/people-handlers.ts
// ─────────────────────────────────────────────────────────────────
//  Characters, people and favourites: what its buttons do
//
//  The cast list, adding and editing characters and people, and the favourites wall. core/actions.ts calls
//  peopleClick() for every button with a data-act; it returns true when the button is one of these. e is the click, t
//  the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

import {
    $,
    changeMeta,
    isRecord,
    items,
    meta,
    norm,
    nowISO,
    patch,
    quietPatch,
    scheduleSave,
    toast,
    ui,
    undo,
} from "../core/core";
import { alCharSearch, allArt } from "../sources/sources";
import { renderMain } from "../core/shell";
import { closeModal, openModal, renderOverlay } from "../core/modals";
import { charGallery } from "./connect";
import {
    addChar,
    castCache,
    castPickOpen,
    charFromCast,
    favMove,
    loadCast,
    patchChar,
    savePerson,
    toggleFav,
} from "./item-actions";
import { setPendingCover } from "../core/events";
import type { ActEl } from "../core/core";
import type { AlChar } from "../sources/sources";
import type { FavChar, Modal } from "../core/model";

/** a character AniList's search found, kept in the dialog by cs-search a moment ago */
const isAlChar = (x: unknown): x is AlChar =>
    isRecord(x) && typeof x.alId === "number" && typeof x.name === "string" && Array.isArray(x.media);

export async function peopleClick(
    _e: Event,
    t: ActEl,
    act: string,
    key: string | undefined,
    id: string | undefined,
    m: Modal | null
): Promise<boolean> {
    const k = key ?? "";
    // first the buttons that need no dialog open
    switch (act) {
        case "char-add":
            openModal("charadd", { from: t.dataset.from || null });
            return true;
        case "char-upload":
            setPendingCover("char");
            $("#file-cover")?.click();
            return true;
        case "person-add":
            openModal("person", { name: "" });
            return true;
        case "people-role":
            ui.peopleRole = k;
            renderMain();
            return true;
        case "person-remove":
            changeMeta("Forget person", "people", L => L.filter(p => p.id !== k));
            closeModal();
            toast("Forgotten", { label: "Undo", fn: undo });
            return true;
        // favourites
        case "fav-add":
            openModal("pickitem", { title: "Add a favourite", purpose: "fav", scope: "mode", filter: b => !b.fav });
            return true;
        case "fav-up":
            favMove(id || "", -1);
            return true;
        case "fav-down":
            favMove(id || "", 1);
            return true;
        case "fav-remove":
            toggleFav(id || "");
            return true;
        case "fav-edit":
            openModal("favedit", { id });
            return true;
        case "fv-upload":
            setPendingCover("fav");
            $("#file-cover")?.click();
            return true;
    }
    // the rest act on the dialog that's open: an entry's card, a character, a person, a favourite
    if (!m) return false;
    const mid = m.id || "",
        char = (): FavChar | undefined => meta.chars.find(x => x.id === mid);
    switch (act) {
        // cast, characters, people
        case "cast-load":
            loadCast(m);
            return true;
        case "cast-pick":
            castPickOpen(m);
            return true;
        case "cast-pick-use": {
            const r = m.castPick && m.castPick.res[Number(k)],
                b = items.get(mid);
            if (!r || !b) return true;
            quietPatch(mid, {
                ext: {
                    ...b.ext,
                    ...(r.tvmaze ? { tvmaze: r.tvmaze } : {}),
                    ...(r.wikidata ? { wikidata: r.wikidata } : {}),
                },
                castPicked: true,
            });
            scheduleSave();
            castCache.delete(mid);
            m.castPick = null;
            m.cast = null;
            loadCast(m);
            return true;
        }
        case "cast-fav": {
            const c = m.cast?.[Number(k)],
                b = items.get(mid);
            if (!c || !b) return true;
            const it = { ...b, id: mid };
            const ex = meta.chars.find(
                x =>
                    (c.alId && x.alId === c.alId) ||
                    (!c.alId && norm(x.name) === norm(c.name) && (x.media || []).some(y => y.id === mid))
            );
            if (ex) {
                openModal("char", { id: ex.id });
                return true;
            }
            const nc = charFromCast(c, it);
            if (c.alId) {
                try {
                    const r = (await alCharSearch(c.name)).find(x => x.alId === c.alId);
                    if (r) {
                        nc.about = r.about;
                        nc.gender = r.gender;
                        nc.age = r.age;
                        nc.media = [
                            ...(nc.media || []),
                            ...r.media.filter(x => x.alId !== it.ext.anilist).map(x => ({ ...x, id: null })),
                        ];
                    }
                } catch (_) {}
            }
            addChar(nc); // the card shows it saved, from the store
            return true;
        }
        case "cast-person": {
            const c = m.cast?.[Number(k)],
                b = items.get(mid);
            if (!c || !b) return true;
            const role = b.medium === "anime" || b.ext.anilist ? "Voice actor" : "Actor";
            const was = (meta.people || []).find(p => norm(p.name) === norm(c.va));
            savePerson(
                c.va,
                p => ({
                    ...p,
                    fav: !(was && was.fav),
                    roles: [...new Set([...(p.roles || []), role])],
                    credits: (p.credits || []).some(x => x.id === mid)
                        ? p.credits
                        : [...(p.credits || []), { id: mid, role }],
                    image: p.image || c.vaImage || "",
                }),
                "Favourite person"
            );
            toast(was && was.fav ? `Unfavourited ${c.va}` : `${c.va} saved to People`);
            return true;
        }
        case "cs-add": {
            const c = m.results?.[Number(k)];
            if (!isAlChar(c) || meta.chars.some(x => x.alId === c.alId)) return true;
            const byAl = new Map<number, string>();
            for (const [iid, b] of items) if (b.ext && b.ext.anilist) byAl.set(b.ext.anilist, iid);
            addChar({
                id: "c" + c.alId,
                ...c,
                alImage: c.image,
                image: "",
                media: c.media.map(x => ({ ...x, id: byAl.get(x.alId) || null })),
                why: "",
                tags: [],
                addedAt: nowISO(),
            });
            return true;
        }
        case "char-del-yes": {
            const cid = mid;
            closeModal();
            changeMeta("Remove character", "chars", list =>
                list.filter(x => x.id !== cid).map((x, i) => ({ ...x, rank: i + 1 }))
            );
            toast("Removed", { label: "Undo", fn: undo });
            return true;
        }
        case "char-untag": {
            const c = char();
            if (c) patchChar(mid, { tags: (c.tags || []).filter((_, i) => i !== Number(k)) });
            return true;
        }
        case "char-unfrom": {
            const c = char();
            if (c) patchChar(mid, { media: (c.media || []).filter((_, i) => i !== Number(k)) });
            return true;
        }
        case "char-pic": {
            const c = char(),
                g = c ? charGallery(c)[Number(k)] : undefined;
            if (!c || !g) return true;
            m.view = null;
            patchChar(
                mid,
                g.k === "upload"
                    ? { imageData: g.u }
                    : {
                          image: g.u,
                          imageData: "",
                          images: [
                              ...new Set([...(c.images || []), ...(c.image && c.image !== c.alImage ? [c.image] : [])]),
                          ],
                      },
                "Change picture"
            );
            return true;
        }
        case "char-pic-del": {
            const c = char(),
                g = c ? charGallery(c)[Number(k)] : undefined;
            if (!c || !g || g.k === "original") return true;
            patchChar(
                mid,
                {
                    images: (c.images || []).filter(u => u !== g.u),
                    uploads: (c.uploads || []).filter(u => u !== g.u),
                    ...(c.image === g.u ? { image: "" } : {}),
                    ...(c.imageData === g.u ? { imageData: "" } : {}),
                },
                "Remove picture"
            );
            return true;
        }
        case "char-view-close":
            if (!t.closest(".cvbar")) {
                m.view = null;
                renderOverlay();
            }
            return true;
        case "char-resetpic":
            patchChar(mid, { image: "", imageData: "" }, "Reset picture");
            return true;
        case "fv-load": {
            m.busy = true;
            renderOverlay();
            const b = items.get(mid);
            try {
                m.art = b ? (await allArt(b)).covers : [];
            } catch (_) {
                m.art = [];
            }
            m.busy = false;
            renderOverlay();
            return true;
        }
        case "fv-pick":
            patch(mid, { favArt: t.dataset.url, favArtData: "" }, "Favourite picture");
            return true;
        case "fv-clear":
            patch(mid, { favArt: "", favArtData: "" }, "Favourite picture");
            return true;
    }
    return false;
}
