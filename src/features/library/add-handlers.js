// src/features/library/add-handlers.js
// ─────────────────────────────────────────────────────────────────
//  Adding something: what its buttons do
//
//  Search a catalogue, pick a result, or fill it in yourself.
//  core/actions.js calls addClick() for every button with a data-act; it returns true when the button is one of these.
//  e is the click, t the button, k and id its data-k and data-id, and m the dialog that's open (if any).
// ─────────────────────────────────────────────────────────────────

async function addClick(e, t, act, k, id, m) {
    switch (act) {
        case "add-medium":
            m.medium = k;
            m.ikind = "";
            m.results = null;
            m.error = "";
            renderOverlay(true);
            return true;
        case "add-search": {
            const q = $("#a-q").value.trim();
            m.q = q;
            m.ikind = $("#a-kind").value;
            if ($("#a-private")) m.private = $("#a-private").checked;
            if (!q) {
                m.error = "Type a title.";
                renderOverlay();
                return true;
            }
            m.busy = true;
            m.error = "";
            renderOverlay();
            try {
                m.results = await searchMedium(m.medium, q);
            } catch (err) {
                m.error = err.auth
                    ? `${sourceFor(m.medium)} rejected the key. Check it in Settings.`
                    : `Couldn't reach ${sourceFor(m.medium)}. Check you're online, or enter it yourself.`;
            }
            m.busy = false;
            renderOverlay();
            return true;
        }
        case "add-pick": {
            const c = m.results[Number(k)];
            m.busy = true;
            renderOverlay();
            const d = await candidateDetails(c);
            const med = d.medium || m.medium,
                kind = m.ikind || d.kind || (med === "book" ? "Novel" : "");
            Object.assign(m, {
                step: "review",
                busy: false,
                coverData: "",
                draft: {
                    ...d,
                    medium: med,
                    kind,
                    status: "want",
                    copy: "none",
                    format: med === "book" ? (d.total ? (d.total < 350 ? "Short" : "Long") : "") : undefined,
                },
            });
            renderOverlay(true);
            return true;
        }
        case "add-manual":
            if ($("#a-private")) m.private = $("#a-private").checked;
            Object.assign(m, {
                step: "review",
                coverData: "",
                draft: {
                    title: $("#a-q").value.trim(),
                    medium: m.medium,
                    kind: $("#a-kind").value || (m.medium === "book" ? "Novel" : ""),
                    status: "want",
                    copy: "none",
                },
            });
            renderOverlay(true);
            return true;
        case "add-back":
            m.step = "search";
            m.error = "";
            renderOverlay(true);
            return true;
        case "add-cover":
            m.draft = { ...m.draft, ...readFields("a-") };
            pendingCover = "add";
            $("#file-cover").click();
            return true;
        case "add-save": {
            const d = { ...m.draft, ...readFields("a-") };
            d.toBuy = $("#a-buy").checked && d.copy === "none";
            const q = $("#a-queue").checked,
                fav = $("#a-fav").checked,
                r = parseFloat($("#a-rating").value),
                priv = $("#a-private") ? $("#a-private").checked : false;
            if (!d.title) {
                m.draft = d;
                m.error = "It needs a title.";
                renderOverlay();
                return true;
            }
            const data = {
                ...d,
                rating: Number.isFinite(r) ? parseScore(r) : 0,
                coverData: m.coverData || null,
                source: d.src || "you",
                relAt: d.rel ? nowISO() : undefined,
            };
            delete data.src;
            delete data.recs;
            delete data.cast;
            if (data.vibe) {
                ensureTag(data.vibe);
                data.tags = [...new Set([...(data.tags || []), data.vibe])];
            }
            if (data.status === "done" && !data.finishedAt) data.finishedAt = nowISO();
            if (data.status === "active") data.startedAt = nowISO();
            if (fav) data.fav = 1;
            let nid = addItem(data, "Add " + d.title);
            if (fav) {
                meta.favOrder = [...meta.favOrder, nid];
                markDirty();
            }
            if (q) {
                meta.queue = [...meta.queue, nid];
                markDirty();
            }
            if ((priv || ui.private) && vault.key) nid = makePrivate(nid);
            autoLinkAniList();
            closeModal();
            openItem(nid);
            toast((priv ? "Added privately: " : "Added ") + d.title, priv ? undefined : { label: "Undo", fn: undo });
            if (!inMode(items.get(nid)))
                toast(`Added. It's not part of ${curMode().name}, so it shows in Hub and the modes that include it.`);
            if (!data.cover && !data.coverData) setTimeout(() => autoCovers([nid]), 300);
            else cacheAndColour(nid).then(() => updateItemTiles(nid));
            setTimeout(
                () =>
                    refreshItem(nid, undefined, { full: false })
                        .then(() => upgradeGameCover(nid))
                        .then(afterChange)
                        .catch(() => {}),
                1200
            );
            return true;
        }
    }
    return false;
}
