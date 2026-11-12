<!--
    src/features/library/card/ItemCard.svelte
    ─────────────────────────────────────────────────────────────────
      The item card: one entry in your library. Actions and facts down the side (ItemSide), the detail in tabs
      (Synopsis, Characters, Cast, Connections, Art, and a Journal, Diary or Log), and Edit details in place of all that.

      Opened by openItem() (library/item-actions.ts) from anywhere: a cover, a row, search, the right-click menu, Watch &
      read. core/modals.ts draws the dialog's frame and hands this its box (core/dialogs.ts). It reads the entry and the
      dialog's own state (ui.modal: the tab, what's loading) through the store, so a change anywhere shows here without
      redrawing the rest. ← and →, F and Escape are core/events.ts's.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { clone, entryOf, fmtScore, MEDIA, scaleOf, titleOf, vault } from "../../core/core";
    import { crowd } from "../../core/views";
    import { listOrder } from "../library";
    import { canFetchCast, itemTabs } from "../item";
    import { loadCast, stepItem } from "../item-actions";
    import type { Entry, Modal } from "../../core/model";
    import ArtTab from "./ArtTab.svelte";
    import ConnectTab from "./ConnectTab.svelte";
    import ItemEdit from "./ItemEdit.svelte";
    import ItemSide from "./ItemSide.svelte";
    import JournalTab from "./JournalTab.svelte";
    import PeopleTab from "./PeopleTab.svelte";
    import SynopsisTab from "./SynopsisTab.svelte";

    // The entry and the dialog, copied each time anything changes: the older code changes both in place (a character's
    // picture arriving, a search's results coming in one by one), and Svelte only redraws what it sees as new
    const card = $derived.by((): { b: Entry; m: Modal } | null => {
        void store.meta; // the card shows lists, tags, Up next, characters you saved…
        void store.items;
        const m = store.ui.modal,
            b = m && m.kind === "item" ? entryOf(m.id || "") : null;
        if (!m || !b) return null;
        return {
            b: clone(b),
            m: {
                ...m,
                cast: m.cast && m.cast.map(c => ({ ...c })),
                castPick: m.castPick && { ...m.castPick, res: [...m.castPick.res] },
                adapt: m.adapt && [...m.adapt],
                art: m.art && [...m.art],
            },
        };
    });

    function openTab(k: string) {
        store.dialog({ tab: k, error: "" });
        const m = store.ui.modal,
            b = card?.b;
        if ((k === "cast" || k === "chars") && m && !m.cast && !m.busy && b && canFetchCast(b)) loadCast(m);
    }
</script>

{#if card}
    {@const { b, m } = card}
    {#key b.id}
        {#if m.editing}
            <ItemEdit {b} />
        {:else}
            {@const M = MEDIA[b.medium]}
            {@const tabs = itemTabs(b)}
            {@const tab = tabs.some(t => t[0] === m.tab) ? m.tab : "synopsis"}
            {@const seq = m.seq && m.seq.length ? m.seq : listOrder}
            {@const pos = seq.indexOf(b.id)}
            {@const c = crowd(b)}
            {@const priv = vault.ids.has(b.id)}
            {@const alt = [b.alt && b.alt.romaji, b.alt && b.alt.native, b.alt && b.alt.original].filter(x => x && x !== titleOf(b) && x !== b.title)}
            {@const tint = b.coverColor && b.coverColor !== "none" ? b.coverColor : b.color || ""}
            <div class="item7" style={tint ? `--tint:${tint}` : undefined}>
                <ItemSide {b} {m} onTab={openTab} />
                <div class="imain">
                    <div class="ihead"><div class="navarrows"><button class="btn sm ghost" data-act="item-prev" onclick={() => stepItem(-1)} disabled={pos <= 0} aria-label="Previous (←)" title="Previous (←)">←</button><span class="hint pos">{pos >= 0 ? pos + 1 + " / " + seq.length : ""}</span><button class="btn sm ghost" data-act="item-next" onclick={() => stepItem(1)} disabled={pos < 0 || pos >= seq.length - 1} aria-label="Next (→)" title="Next (→)">→</button><button class="x" data-act="close" aria-label="Close">✕</button></div>
                        <div class="eyebrow">{M.g} {[b.kind || M.one.charAt(0).toUpperCase() + M.one.slice(1), ...(b.genres || []).slice(0, 3)].join(" · ")}{b.hidden ? " · hidden" : ""}{priv ? " · 🔒 private" : ""}</div>
                        <h2>{titleOf(b)}</h2>{#if alt.length}<div class="alt">{alt.join(" · ")}</div>{/if}{#if b.creator}<div class="by">{b.creator}{b.year ? " · " + b.year : ""}</div>{:else if b.year}<div class="by">{b.year}</div>{/if}
                        <div class="scores">{#if b.rating}<span class="sc you"><small>You</small>{fmtScore(b.rating, scaleOf(b))}</span>{/if}{#each c.parts as p}<span class="sc"><small>{p.label}</small>{p.show}</span>{/each}{#if c.avg != null}<span class="sc avg"><small>Crowd</small>{c.avg}<i>/100</i></span>{/if}</div></div>
                    <div class="tabs itabs" role="tablist">{#each tabs as [k, l]}<button role="tab" aria-selected={tab === k} data-act="item-tab" data-k={k} onclick={() => openTab(k)}>{l}</button>{/each}</div>
                    <div class="ibody">
                        {#if tab === "chars" || tab === "cast"}<PeopleTab {b} {m} which={tab} />
                        {:else if tab === "connect"}<ConnectTab {b} {m} />
                        {:else if tab === "art"}<ArtTab {b} {m} />
                        {:else if tab === "journal"}<JournalTab {b} />
                        {:else}<SynopsisTab {b} {m} />{/if}
                    </div>
                    {#if m.error}<p class="err">{m.error}</p>{/if}
                </div>
            </div>
        {/if}
    {/key}
{/if}
