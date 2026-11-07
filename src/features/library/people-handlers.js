// src/features/library/people-handlers.js
// ─────────────────────────────────────────────────────────────────
//  Characters, people and favourites: what its buttons do
//
//  The cast list, adding and editing characters and people, and the favourites wall. core/actions.js calls
//  peopleClick() for every button with a data-act; it returns true when the button is one of these. e is the click, t
//  the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

async function peopleClick(e, t, act, k, id, m) {
    switch (act) {
        // cast, characters, people
        case "cast-load":
            loadCast(m);
            return true;
        case "cast-pick":
            castPickOpen(m);
            return true;
        case "cast-pick-go":
            castPickOpen(m, ($("#cp-q") || {}).value);
            return true;
        case "cast-pick-close":
            m.castPick = null;
            renderOverlay();
            return true;
        case "cast-pick-use": {
            const r = m.castPick && m.castPick.res[Number(k)];
            if (!r) return true;
            const b = items.get(m.id);
            quietPatch(m.id, {
                ext: {
                    ...b.ext,
                    ...(r.tvmaze ? { tvmaze: r.tvmaze } : {}),
                    ...(r.wikidata ? { wikidata: r.wikidata } : {}),
                },
                castPicked: true,
            });
            scheduleSave();
            castCache.delete(m.id);
            m.castPick = null;
            m.cast = null;
            loadCast(m);
            return true;
        }
        case "cast-fav": {
            const c = m.cast[Number(k)],
                it = { id: m.id, ...items.get(m.id) };
            const ex = meta.chars.find(
                x =>
                    (c.alId && x.alId === c.alId) ||
                    (!c.alId && norm(x.name) === norm(c.name) && (x.media || []).some(y => y.id === m.id))
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
                            ...nc.media,
                            ...r.media.filter(x => x.alId !== it.ext.anilist).map(x => ({ ...x, id: null })),
                        ];
                    }
                } catch (_) {}
            }
            addChar(nc);
            renderOverlay();
            return true;
        }
        case "cast-person": {
            const c = m.cast[Number(k)],
                b = items.get(m.id),
                role = b.medium === "anime" || b.ext.anilist ? "Voice actor" : "Actor";
            const was = (meta.people || []).find(p => norm(p.name) === norm(c.va));
            savePerson(
                c.va,
                p => ({
                    ...p,
                    fav: !(was && was.fav),
                    roles: [...new Set([...p.roles, role])],
                    credits: p.credits.some(x => x.id === m.id) ? p.credits : [...p.credits, { id: m.id, role }],
                    image: p.image || c.vaImage || "",
                }),
                "Favourite person"
            );
            toast(was && was.fav ? `Unfavourited ${c.va}` : `${c.va} saved to People`);
            renderOverlay();
            return true;
        }
        case "char-add":
            openModal("charadd", { from: t.dataset.from || null });
            return true;
        case "cs-search": {
            const q = $("#cs-q").value.trim();
            if (!q) return true;
            m.q = q;
            m.busy = true;
            m.error = "";
            renderOverlay();
            try {
                m.results = await alCharSearch(q);
            } catch (err) {
                m.error = "Couldn't reach AniList.";
            }
            m.busy = false;
            renderOverlay();
            return true;
        }
        case "cs-add": {
            const c = m.results[Number(k)];
            if (meta.chars.some(x => x.alId === c.alId)) return true;
            const byAl = new Map();
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
            renderOverlay();
            return true;
        }
        case "cm-add": {
            const name = $("#cm-name").value.trim();
            if (!name) return true;
            const fid = idFromOption($("#cm-from").value),
                it = fid && items.get(fid);
            addChar({
                id: "c" + Date.now().toString(36),
                name,
                image: $("#cm-img").value.trim(),
                media: it
                    ? [{ id: fid, title: titleOf(it), medium: it.medium }]
                    : $("#cm-from").value.trim()
                      ? [{ id: null, title: titleKey($("#cm-from").value), medium: "" }]
                      : [],
                why: "",
                tags: [],
                addedAt: nowISO(),
            });
            closeModal();
            return true;
        }
        case "char-save": {
            const rank = parseInt($("#ch-rank").value, 10);
            const p = {
                name: $("#ch-name").value.trim() || (meta.chars.find(x => x.id === m.id) || {}).name,
                why: $("#ch-why").value.trim(),
            };
            changeMeta("Edit character", "chars", list => {
                let L = list
                    .map(x => (x.id === m.id ? { ...x, ...p } : x))
                    .sort((a, b) => (a.rank || 999) - (b.rank || 999));
                if (Number.isFinite(rank) && rank > 0) {
                    const me = L.find(x => x.id === m.id);
                    L = L.filter(x => x.id !== m.id);
                    L.splice(Math.min(rank - 1, L.length), 0, me);
                }
                return L.map((x, i) => ({ ...x, rank: i + 1 }));
            });
            toast("Saved");
            renderOverlay();
            return true;
        }
        case "char-del":
            m.confirmDelete = true;
            renderOverlay();
            return true;
        case "char-del-no":
            m.confirmDelete = false;
            renderOverlay();
            return true;
        case "char-del-yes": {
            const cid = m.id;
            closeModal();
            changeMeta("Remove character", "chars", list =>
                list.filter(x => x.id !== cid).map((x, i) => ({ ...x, rank: i + 1 }))
            );
            toast("Removed", { label: "Undo", fn: undo });
            return true;
        }
        case "char-untag": {
            const c = meta.chars.find(x => x.id === m.id);
            patchChar(m.id, { tags: c.tags.filter((_, i) => i !== Number(k)) });
            return true;
        }
        case "char-from": {
            const fid = idFromOption($("#ch-from").value);
            if (!fid) return true;
            const it = items.get(fid),
                c = meta.chars.find(x => x.id === m.id);
            patchChar(m.id, {
                media: [
                    ...(c.media || []).filter(x => x.id !== fid),
                    { id: fid, alId: it.ext.anilist, title: titleOf(it), medium: it.medium },
                ],
            });
            return true;
        }
        case "char-unfrom": {
            const c = meta.chars.find(x => x.id === m.id);
            patchChar(m.id, { media: c.media.filter((_, i) => i !== Number(k)) });
            return true;
        }
        case "char-pic": {
            const c = meta.chars.find(x => x.id === m.id),
                g = charGallery(c)[Number(k)];
            if (!g) return true;
            m.view = null;
            patchChar(
                m.id,
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
            const c = meta.chars.find(x => x.id === m.id),
                g = charGallery(c)[Number(k)];
            if (!g || g.k === "original") return true;
            patchChar(
                m.id,
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
        case "char-view":
            m.view = Number(k);
            renderOverlay();
            return true;
        case "char-view-close":
            if (!t.closest(".cvbar")) {
                m.view = null;
                renderOverlay();
            }
            return true;
        case "char-url": {
            const u = $("#ch-url").value.trim();
            if (!/^https?:\/\//.test(u)) return true;
            const c = meta.chars.find(x => x.id === m.id);
            patchChar(
                m.id,
                { image: u, imageData: "", images: [...new Set([...(c.images || []), c.image, u].filter(Boolean))] },
                "Change picture"
            );
            return true;
        }
        case "char-upload":
            pendingCover = "char";
            $("#file-cover").click();
            return true;
        case "char-resetpic":
            patchChar(m.id, { image: "", imageData: "" }, "Reset picture");
            return true;
        case "person-add":
            openModal("person", { name: "" });
            return true;
        case "people-role":
            ui.peopleRole = k;
            renderMain();
            return true;
        case "pp-role":
        case "pp-role-add": {
            const name = $("#pp-name").value.trim();
            if (!name) {
                toast("Give them a name first.");
                return true;
            }
            const r = act === "pp-role" ? k : $("#pp-role-new").value.trim();
            if (!r) return true;
            savePerson(
                name,
                p => ({
                    ...p,
                    roles:
                        act === "pp-role" && p.roles.includes(r)
                            ? p.roles.filter(x => x !== r)
                            : [...new Set([...p.roles, r])],
                }),
                "Edit roles"
            );
            m.name = name;
            renderOverlay();
            return true;
        }
        case "pp-credit-add": {
            const name = $("#pp-name").value.trim(),
                cid = idFromOption($("#pp-credit").value);
            if (!name || !cid) {
                toast("Pick something from the list.");
                return true;
            }
            const role = $("#pp-credit-role").value;
            savePerson(
                name,
                p => ({
                    ...p,
                    roles: [...new Set([...p.roles, role])],
                    credits: [...p.credits.filter(c => !(c.id === cid && c.role === role)), { id: cid, role }],
                }),
                "Add credit"
            );
            m.name = name;
            renderOverlay();
            return true;
        }
        case "pp-fav": {
            const name = $("#pp-name").value.trim();
            if (!name) return true;
            savePerson(name, p => ({ ...p, fav: !p.fav }), "Favourite person");
            m.name = name;
            renderOverlay();
            return true;
        }
        case "pp-save": {
            const name = $("#pp-name").value.trim();
            if (!name) {
                toast("Give them a name first.");
                return true;
            }
            const old = (meta.people || []).find(p => norm(p.name) === norm(m.name || ""));
            if (old && norm(old.name) !== norm(name))
                changeMeta("Rename person", "people", L => L.map(p => (p.id === old.id ? { ...p, name } : p)));
            savePerson(
                name,
                p => ({ ...p, image: $("#pp-img").value.trim() || p.image, why: $("#pp-why").value.trim() }),
                "Edit person"
            );
            m.name = name;
            toast("Saved");
            renderOverlay();
            return true;
        }
        case "pp-upload":
            if (!$("#pp-name").value.trim()) {
                toast("Give them a name first.");
                return true;
            }
            m.name = $("#pp-name").value.trim();
            pendingCover = "person";
            $("#file-cover").click();
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
        case "pi-pick": {
            const p = m.purpose;
            if (p === "fav") {
                closeModal();
                toggleFav(id);
            } else if (p === "list") {
                if (m.lid === "queue") queueAdd(id);
                else listAdd(m.lid, id);
                (m.added = m.added || new Set()).add(id);
                renderOverlay();
            }
            return true;
        }
        case "fav-up":
            favMove(id, -1);
            return true;
        case "fav-down":
            favMove(id, 1);
            return true;
        case "fav-remove":
            toggleFav(id);
            return true;
        case "fav-edit":
            openModal("favedit", { id });
            return true;
        case "fv-load": {
            m.busy = true;
            renderOverlay();
            try {
                m.art = (await allArt(items.get(m.id))).covers;
            } catch (_) {
                m.art = [];
            }
            m.busy = false;
            renderOverlay();
            return true;
        }
        case "fv-pick":
            patch(m.id, { favArt: t.dataset.url, favArtData: "" }, "Favourite picture");
            return true;
        case "fv-url": {
            const u = $("#fv-url").value.trim();
            if (/^https?:\/\//.test(u)) patch(m.id, { favArt: u, favArtData: "" }, "Favourite picture");
            return true;
        }
        case "fv-upload":
            pendingCover = "fav";
            $("#file-cover").click();
            return true;
        case "fv-clear":
            patch(m.id, { favArt: "", favArtData: "" }, "Favourite picture");
            return true;
        case "fv-save": {
            patch(m.id, { favWhy: $("#fv-why").value.trim() }, "Why it's a favourite");
            closeModal();
            toast("Saved");
            return true;
        }
    }
    return false;
}
