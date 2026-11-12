<!--
    src/features/library/card/ConnectTab.svelte
    ─────────────────────────────────────────────────────────────────
      The item card's Connections: what you linked it to (and linking more), its franchise, what AniList relates it
      to, its adaptations on Wikidata, more by the same creator, and what shares the most genres and themes with it
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import MediumDot from "../tiles/MediumDot.svelte";
    import { entryOf, items, LINK_NAME, LINK_TYPES, linkItems, MEDIA, patch, titleOf, toast, ui } from "../../core/core";
    import { all} from "../../core/views";
    import { idFromOption } from "../../core/navigation";
    import Card from "../tiles/Card.svelte";
    import Cover from "../tiles/Cover.svelte";
    import { sameCreator, similarTo } from "../item";
    import type { Entry, ItemLink, Modal } from "../../core/model";

    let { b, m }: { b: Entry; m: Modal } = $props();

    const groups = $derived.by(() => {
        const by: Record<string, ItemLink[]> = {};
        for (const l of (b.links || []).filter(l => items.has(l.id))) (by[l.type] = by[l.type] || []).push(l);
        return Object.entries(by);
    });
    // AniList's ids of what's in your library, so a related work you have opens instead of being added
    const byAl = $derived.by(() => {
        void b;
        const map = new Map<unknown, string>();
        for (const [id, x] of items) if (x.ext && x.ext.anilist) map.set(x.ext.anilist, id);
        return map;
    });
    const opts = $derived(
        all()
            .filter(x => x.id !== b.id)
            .sort((a, c) => titleOf(a).localeCompare(titleOf(c)))
    );
    const creator = $derived(sameCreator(b));
    const sim = $derived(similarTo(b));

    let target = $state(""),
        type = $state("adaptation"),
        note = $state("");
    const onEnter = (e: KeyboardEvent) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        link();
    };
    function link() {
        const to = idFromOption(target);
        if (!to) {
            toast("Pick something from the list.");
            return;
        }
        linkItems(b.id, to, type, note.trim());
        target = "";
        type = "adaptation";
        note = "";
    }
</script>

<div class="sec"><p class="label">Linked in your stacks</p>
    {#if groups.length}{#each groups as [t, ls]}<div class="lgroup"><span class="hint">{LINK_NAME[t] || t}</span>{#each ls as l}{@const x = entryOf(l.id)}{#if x}<div class="lrow"><Cover b={x} /><button class="t" data-act="open" data-id={l.id}><MediumDot m={x.medium} />{titleOf(x)}</button><span class="hint">{MEDIA[x.medium].one}{l.note ? " · " + l.note : ""}{l.auto ? " · from AniList" : ""}</span><button class="linkbtn" data-act="unlink" data-k={l.id}>unlink</button></div>{/if}{/each}</div>{/each}
    {:else}<p class="hint">Nothing linked yet. Link the book a show is based on, the game set in the same world, or anything that feels the same.</p>{/if}
    <div class="bar" style="margin-top:8px"><input class="inp" id="lk-target" list="lk-opts" placeholder="Link to…" style="max-width:280px" bind:value={target} onkeydown={onEnter} /><datalist id="lk-opts">{#each opts as x}<option value="{titleOf(x)} · {MEDIA[x.medium].one}"></option>{/each}</datalist>
        <select class="sel" id="lk-type" bind:value={type}>{#each LINK_TYPES as [k, l]}<option value={k}>{l}</option>{/each}</select><input class="inp" id="lk-note" placeholder="Note (optional)" style="max-width:180px" bind:value={note} /><button class="btn sm gold" data-act="link-add" onclick={link}>Link</button></div></div>
<div class="sec"><p class="label">Franchise</p><div class="bar"><input class="inp" id="franchise" value={b.franchise || ""} placeholder="e.g. Monogatari, The Witcher, Grishaverse" style="max-width:280px" onchange={e => patch(b.id, { franchise: e.currentTarget.value.trim() }, "Set franchise")} /><span class="hint">Everything with the same franchise name, or linked as adaptation, sequel or same world, is grouped on the Franchises page.</span></div></div>
{#if (b.rel || []).length}<div class="sec"><p class="label">Related on AniList</p><div class="rels">{#each b.rel as r}{@const inId = byAl.get(r.id)}<div class="rel">{#if r.cover}<img src={r.cover} alt="" referrerpolicy="no-referrer" />{:else}<span class="nocov">{MEDIA[r.medium].code}</span>{/if}<span><span class="hint">{r.label} · {r.kind}{r.year ? " · " + r.year : ""}</span><span class="t">{r.title}</span></span>{#if inId}<button class="btn sm" data-act="open" data-id={inId}>Open</button>{:else}<button class="btn sm" data-act="rel-add" data-k={r.id} data-src={b.id}>+ Add</button>{/if}</div>{/each}</div></div>{/if}
{#if m.adapt}<div class="sec"><p class="label">Adaptations on Wikidata</p>{#if m.adapt.length}<div class="rels">{#each m.adapt as r, i}<div class="rel"><span class="nocov">{(MEDIA[r.medium] || MEDIA.film).code}</span><span><span class="hint">{r.dir === "to" ? "Based on" : "Adapted as"} · {r.desc}</span><span class="t">{r.title}</span></span><button class="btn sm" data-act="adapt-add" data-k={i}>+ Add</button></div>{/each}</div>{:else}<p class="hint">Wikidata doesn't list any adaptations for this.</p>{/if}</div>
{:else if ["book", "comic", "film", "tv", "game", "manga", "novel"].includes(b.medium)}<div class="sec"><div class="bar"><button class="btn sm" data-act="adapt-find" disabled={!!m.busy}>{m.busy === "adapt" ? "Looking…" : "Find adaptations on Wikidata"}</button><span class="hint">Films, shows, games and books based on this, or that this is based on.</span></div></div>{/if}
{#if creator.length}<div class="sec"><p class="label">Same creator in your stacks</p><div class="strip">{#each creator as x}<Card b={x} sel={ui.sel.has(x.id)} />{/each}</div></div>{/if}
{#if sim.length}<div class="sec"><p class="label">Shares the most genres and themes with</p><div class="sims">{#each sim as { x, shared }}<div class="lrow"><Cover b={x} /><button class="t" data-act="open" data-id={x.id}><MediumDot m={x.medium} />{titleOf(x)}</button><span class="hint">{MEDIA[x.medium].one} · {shared} shared</span><button class="linkbtn" data-act="link-similar" data-k={x.id}>link as similar</button></div>{/each}</div></div>{/if}
