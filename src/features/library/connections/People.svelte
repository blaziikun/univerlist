<!--
    src/features/library/connections/People.svelte
    ─────────────────────────────────────────────────────────────────
      Stats › People: everyone behind what's in this mode, with their roles and covers, by role, filtered by what you
      type, as a grid or a list, and with or without the people with one credit. What it shows comes from peopleView()
      in connect.ts. The filter box and the tick are this view's own (remembered while the app is open: ui.peopleQ,
      ui.peopleAll); the buttons go through layout-view, people-role, person-add and open-person.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { ticked, titleOf, ui } from "../../core/core";
    import { renderMain } from "../../core/shell";
    import LayoutSeg from "../../core/page/LayoutSeg.svelte";
    import Pic from "../../core/dialog/Pic.svelte";
    import { peopleView } from "../connect";
    import Cover from "../tiles/Cover.svelte";

    const v = $derived.by(() => {
        void store.itemsByFrame;
        void store.meta;
        void store.ui;
        return peopleView();
    });
    let q = $state(ui.peopleQ || "");
    function filter(value: string) {
        q = ui.peopleQ = value;
        store.flush("ui");
    }
    function everyone(box: HTMLInputElement) {
        ui.peopleAll = ticked(box);
        renderMain();
    }
</script>

<div class="ph"><div class="ttl"><p>Everyone behind what you love: authors, mangaka, directors, actors, voice actors, studios, developers. A person can hold any number of roles.</p></div><span class="spacer"></span>
      <LayoutSeg s={v.seg} /><input class="inp" id="people-q" placeholder="Filter" value={q} oninput={e => filter(e.currentTarget.value)} style="max-width:180px"><button class="btn gold" data-act="person-add">+ Add a person</button></div>
    <div class="chips" style="margin-bottom:12px"><button class="chip" data-act="people-role" data-k="" aria-pressed={!v.role}>Everyone</button>{#each v.roles as [r, n] (r)}<button class="chip" data-act="people-role" data-k={r} aria-pressed={v.role === r}>{r} <span class="cn">{n}</span></button>{/each}
      <label class="ctl" style="margin-left:8px"><input type="checkbox" id="people-all" checked={v.all} onchange={e => everyone(e.currentTarget)}> Include people with one credit</label></div>
    {#if v.people.length}<div class="pgrid {v.view}">{#each v.people as p, i (i)}<div class="pcard"><button class="pimg" data-act="open-person" data-k={p.name}>{#if p.img}<Pic src={p.img} loading="lazy" />{:else}<span class="noimg">{p.name.charAt(0)}</span>{/if}</button>
      <div class="cbody"><button class="t" data-act="open-person" data-k={p.name}>{p.title}</button><div class="hint">{p.roles}</div>
        <div class="pcov">{#each p.covers as b (b.id)}<button data-act="open" data-id={b.id} title={titleOf(b)}><Cover {b} /></button>{/each}{#if p.more}<span class="hint">+{p.more}</span>{/if}</div></div></div>{/each}</div>{:else}<div class="empty"><h3>No people here yet</h3><p>Creators appear as you add things; tick "Include people with one credit" to see everyone.</p></div>{/if}
