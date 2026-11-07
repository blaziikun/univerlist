// src/features/library/list-handlers.js
// ─────────────────────────────────────────────────────────────────
//  Lists: what its buttons do
//
//  Your lists, Up next, tier lists and the head-to-head comparisons.
//  core/actions.js calls listClick() for every button with a data-act; it returns true when the button is one of these.
//  e is the click, t the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

function listClick(e, t, act, k, id, m) {
    switch (act) {
        case "list-pick": {
            const back = m && m.kind === "item" ? { kind: "item", id: m.id, tab: m.tab } : null;
            openModal("listpick", { id: id || (m && m.id), back });
            return true;
        }
        // lists
        case "list-new":
            openModal("listnew", { ids: ui.selecting ? [...ui.sel] : [], type: k === "tier" ? "tier" : "list" });
            return true;
        case "ln-type":
            m.name = ($("#ln-name") || {}).value || m.name;
            m.type = k;
            renderOverlay(true);
            return true;
        case "ln-what":
            m.name = ($("#ln-name") || {}).value || m.name;
            m.what = k;
            renderOverlay(true);
            return true;
        case "ln-create": {
            const name = $("#ln-name").value.trim();
            if (!name) {
                toast("Give the list a name.");
                return true;
            }
            const what = m.what || "items";
            if (m.type === "tier" || what !== "items") {
                const lid = newTierList({
                    name,
                    layout: m.type === "tier" ? "tiers" : "rank",
                    what,
                    mode: ($("#ln-mode") || {}).value || "",
                    onlyDone: what === "items" && m.type === "tier" ? $("#ln-done").checked : false,
                    ids: what === "items" ? m.ids : [],
                });
                closeModal();
                ui.selecting = false;
                ui.sel.clear();
                goList(lid);
                return true;
            }
            const lid = createList({
                name,
                desc: $("#ln-desc").value.trim(),
                mode: $("#ln-mode").value,
                numbered: $("#ln-num").checked,
                ids: m.ids,
            });
            closeModal();
            ui.selecting = false;
            ui.sel.clear();
            goList(lid);
            return true;
        }
        case "lp-toggle": {
            const ids = m.ids || [m.id],
                l = meta.lists.find(x => x.id === k);
            if (!l) return true;
            const has = ids.every(i => l.ids.includes(i));
            setListIds(
                k,
                a => (has ? a.filter(x => !ids.includes(x)) : [...a, ...ids.filter(x => !a.includes(x))]),
                has ? "Remove from list" : "Add to list"
            );
            renderOverlay();
            return true;
        }
        case "lp-create": {
            const name = $("#lp-new").value.trim();
            if (!name) return true;
            createList({ name, ids: m.ids || [m.id], mode: isUniversal() ? "" : curMode().id });
            renderOverlay();
            toast("Added to " + name);
            return true;
        }
        case "li-add": {
            const lid = k,
                name = lid === "queue" ? "Up next" : (meta.lists.find(l => l.id === lid) || {}).name;
            openModal("pickitem", {
                title: "Add to " + name,
                purpose: "list",
                lid,
                scope: "mode",
                added: new Set(listIds(lid)),
            });
            return true;
        }
        case "li-move":
            listMove(t.dataset.lid, id, Number(k));
            return true;
        case "li-remove":
            setListIds(t.dataset.lid, a => a.filter(x => x !== id), "Remove from list");
            return true;
        case "list-del":
            ui.confirmListDel = true;
            renderMain();
            return true;
        case "list-del-no":
            ui.confirmListDel = false;
            renderMain();
            return true;
        case "list-del-yes": {
            const lid = ui.listId;
            ui.confirmListDel = false;
            ui.listId = null;
            changeMeta("Delete list", "lists", L => L.filter(l => l.id !== lid));
            toast("Deleted the list", { label: "Undo", fn: undo });
            return true;
        }
        case "fr-tolist": {
            const f = franchises().find(x => x.key === k);
            if (!f) return true;
            const lid = createList({
                name: f.name + " order",
                desc: "In release order. Drag to change it.",
                numbered: true,
                ids: f.members.map(b => b.id),
            });
            goList(lid);
            toast("Made a list you can reorder");
            return true;
        }
        // queue
        case "q-add":
            queueAdd(id);
            return true;
        case "q-remove":
            changeMeta("Remove from Up next", "queue", q => q.filter(x => x !== id));
            return true;
        // compare
        case "cmp-link":
            if (ui.cmpA && ui.cmpB) linkItems(ui.cmpA, ui.cmpB, "similar");
            toast("Linked as similar");
            return true;
        case "cmp-rank":
            if (ui.cmpA && ui.cmpB) {
                rankState.pair = [ui.cmpA, ui.cmpB];
                rankState.mode = "liked";
                goTab("rank");
            }
            return true;
        // tier lists
        case "tier-new":
            openModal("listnew", { type: "tier" });
            return true;
        case "tier-new-from-sel": {
            const ids = m.ids;
            closeModal();
            openModal("listnew", { type: "tier", ids });
            return true;
        }
        case "tn-create": {
            const name = $("#tn-name").value.trim() || "Untitled tier list",
                kind = $("#tn-kind").value,
                mode = $("#tn-mode").value,
                tid = "t" + Date.now().toString(36);
            const rows = TIER_DEFAULT.map(([label, color]) => ({ label, color, ids: [] }));
            if (m.ids && kind === "items") rows[0].ids = m.ids.slice();
            changeMeta("New tier list", "tiers", T => [
                ...T,
                { id: tid, name, kind, mode, onlyDone: $("#tn-done").checked, rows, created: nowISO() },
            ]);
            closeModal();
            ui.page = "profile";
            ui.tab = "tiers";
            ui.tierId = tid;
            render();
            return true;
        }
        case "tp-place": {
            const tl = meta.lists.find(x => x.id === k),
                row = Number(t.dataset.row),
                ids = m.ids;
            closeModal();
            if (!tl) return true;
            tierPlace(tl.id, ids, row);
            toast(`Added ${ids.length} to ${tl.name}`, { label: "Open", fn: () => goList(tl.id) });
            return true;
        }
        case "tier-select":
            ui.tierSel = ui.tierSel === k || !k ? null : k;
            renderMain();
            return true;
        case "tier-place": {
            if (!ui.tierSel) return true;
            const tl = meta.tiers.find(x => x.id === ui.tierId);
            placeTier(tl, ui.tierSel, k === "pool" ? "pool" : Number(k));
            ui.tierSel = null;
            renderMain();
            return true;
        }
        case "tier-unplace": {
            const tl = meta.tiers.find(x => x.id === ui.tierId);
            placeTier(tl, ui.tierSel, "pool");
            ui.tierSel = null;
            renderMain();
            return true;
        }
        case "tier-addrow":
            changeMeta("Add tier", "tiers", T =>
                T.map(x =>
                    x.id !== ui.tierId
                        ? x
                        : {
                              ...x,
                              rows: [
                                  ...x.rows,
                                  { label: "New", color: TAG_COLORS[x.rows.length % TAG_COLORS.length], ids: [] },
                              ],
                          }
                )
            );
            return true;
        case "tier-rowdel":
            changeMeta("Delete tier", "tiers", T =>
                T.map(x => (x.id !== ui.tierId ? x : { ...x, rows: x.rows.filter((_, i) => i !== Number(k)) }))
            );
            return true;
        case "tier-rowup":
            changeMeta("Move tier", "tiers", T =>
                T.map(x => {
                    if (x.id !== ui.tierId) return x;
                    const r = x.rows.slice(),
                        i = Number(k);
                    [r[i - 1], r[i]] = [r[i], r[i - 1]];
                    return { ...x, rows: r };
                })
            );
            return true;
        case "tier-clear":
            changeMeta("Clear tier list", "tiers", T =>
                T.map(x => (x.id !== ui.tierId ? x : { ...x, rows: x.rows.map(r => ({ ...r, ids: [] })) }))
            );
            return true;
        case "tier-del":
            ui.confirmTierDel = true;
            renderMain();
            return true;
        case "tier-del-no":
            ui.confirmTierDel = false;
            renderMain();
            return true;
        case "tier-del-yes": {
            const tid = ui.tierId;
            ui.confirmTierDel = false;
            ui.tierId = null;
            changeMeta("Delete tier list", "tiers", T => T.filter(x => x.id !== tid));
            toast("Deleted", { label: "Undo", fn: undo });
            return true;
        }
    }
    return false;
}
