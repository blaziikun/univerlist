<!--
    src/features/library/connections/Franchises.svelte
    ─────────────────────────────────────────────────────────────────
      Stats › Franchises: everything joined up across media and within one, as cards, or one franchise open
      (ui.franchise): its name (this view's own box: renaming it renames it on every entry in it), its entries in
      release order on a timeline, and the parts AniList knows of that aren't in your library. What it shows comes from
      franchisesView() in connect.ts. The buttons go through open-franchise, fr-tolist and rel-add.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { change } from "../../core/core";
    import { franchises, franchisesView } from "../connect";
    import Pic from "../../core/dialog/Pic.svelte";
    import Cover from "../tiles/Cover.svelte";
    import StatusPill from "../tiles/StatusPill.svelte";
    import MyScore from "../tiles/MyScore.svelte";
    import CrowdPill from "../tiles/CrowdPill.svelte";
    import { statusWord } from "../../core/core";

    const v = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        return franchisesView();
    });
    // a franchise renamed: every entry in it takes the name
    function rename(key: string, box: HTMLInputElement) {
        const f = franchises().find(x => x.key === key);
        if (!f) return;
        const name = box.value.trim();
        change(
            "Rename franchise",
            f.members.map(b => b.id),
            b => (b ? { ...b, franchise: name } : undefined)
        );
    }
</script>

{#snippet card(f: (typeof v.cross)[number])}<button class="frcard" data-act="open-franchise" data-k={f.key}><span class="collage">{#each f.covers as b (b.id)}<Cover {b} />{/each}</span>
    <span class="t">{f.name}</span><span class="hint">{f.media}</span><span class="hint">{f.count}</span>
    <span class="prog"><span style="width:{f.pct}%"></span></span></button>{/snippet}
{#if v.open}{@const f = v.open}<div class="ph"><div class="ttl">{" "}<!-- svelte-ignore a11y_missing_content --><h2><input class="h2in" id="fr-name" data-k={f.key} value={f.name} aria-label="Franchise name" onchange={e => rename(f.key, e.currentTarget)}></h2><p>{f.about}</p></div><span class="spacer"></span><button class="btn" data-act="fr-tolist" data-k={f.key}>Make a watch/read-order list</button></div>
    <div class="timeline">{#each f.members as m (m.b.id)}<div class="tl"><span class="yr">{m.year}</span><span class="node" style={m.node}></span>
      <button class="tlc" data-act="open" data-id={m.b.id}><Cover b={m.b} /><span><span class="eyebrow" style="font-size:9.5px">{m.kind}</span><span class="t">{m.title}</span>
        <span class="meta"><StatusPill b={m.b}>{#snippet otherwise()}<span class="hint">{statusWord("want", m.b.medium)}</span>{/snippet}</StatusPill><MyScore b={m.b} /><CrowdPill b={m.b} /></span></span></button></div>{/each}</div>
    {#if f.missing.length}<div class="panel" style="margin-top:20px"><h3>Other parts, not in your library · {f.missing.length}</h3><div class="cands">{#each f.missing as r (r.id)}<div class="cand">{#if r.cover}<Pic src={r.cover} />{:else}<span class="nocov">{r.code}</span>{/if}<span class="t">{r.title}</span><span class="hint">{r.hint}</span><button class="btn sm" data-act="rel-add" data-k={r.id} data-src={f.src}>+ Add</button></div>{/each}</div></div>{/if}{:else}<div class="ph"><div class="ttl"><p>Adaptations, sequels, spin-offs and shared worlds, joined up across media. AniList relations link automatically; link anything else from a card's Connections tab.</p></div></div>
    {#if v.any}{#if v.cross.length}<p class="label" style="margin-bottom:10px">Across media · {v.cross.length}</p><div class="frgrid">{#each v.cross as f (f.key)}{@render card(f)}{/each}</div>{/if}
      {#if v.within.length}<p class="label" style="margin:18px 0 10px">Within one medium · {v.within.length}</p><div class="frgrid">{#each v.within as f (f.key)}{@render card(f)}{/each}</div>{/if}{:else}<div class="empty"><h3>No franchises yet</h3><p>Sync AniList, or link something to its adaptation or sequel in the Connections tab.</p></div>{/if}{/if}
