<!--
    src/features/insights/discover/DiscoverBooks.svelte
    ─────────────────────────────────────────────────────────────────
      Discover's Books from forums: your book interests (the subjects of your top books, from Open Library, which you
      can leave out one by one), the shelf, the source (Reddit, Open Library subjects, award winners, Hacker News,
      Stack Exchange) and what it starts from or which awards count. Choices go back through `choose` (the dialog's
      state); Sync is "sync" (insights/handlers.ts), as it changes your books.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { fmtDate, MEDIA, titleOf } from "../../core/core";
    import { AWARDS, SOURCE_ABOUT, SOURCE_SHELVES, SOURCES, topSeeds } from "../discover";
    import type { Modal } from "../../core/model";

    let { m, choose }: { m: Modal; choose: (change: Partial<Modal>) => void } = $props();

    const v = $derived.by(() => {
        void store.items;
        const meta = store.meta,
            shelf = m.shelf || "fiction";
        return {
            shelf,
            source: m.source || "reddit",
            seeds: topSeeds(() => true, 40),
            subs: [...(meta.interests.subjects[shelf] || [])],
            synced: meta.interests.syncedAt,
            from: meta.interests.seeds.length,
            off: new Set(m.off || []),
            offAwards: new Set(m.offAwards || []),
        };
    });
    function toggle(set: Set<string>, k: string) {
        const s = new Set(set);
        if (s.has(k)) s.delete(k);
        else s.add(k);
        return s;
    }
</script>

<div class="sec"><p class="label">Your book interests</p>
    <p class="hint">{v.synced ? `Synced ${fmtDate(v.synced)} from ${v.from} of your books.` : "Not synced yet. Syncing reads the subjects of your top books from Open Library."}</p>
    <div class="bar"><button class="btn" data-act="sync" disabled={!!(m.busy || m.syncing)}>{m.syncing ? `Syncing ${m.syncDone} of ${m.syncTotal}…` : v.synced ? "Sync again" : "Sync my interests"}</button>{#if m.syncing}<button class="btn ghost" data-act="stop">Stop</button>{/if}</div>
    {#if v.subs.length}<div class="chips wrapchips" role="group" aria-label="Subjects">{#each v.subs as s}<button class="chip" data-act="subj-toggle" data-k={s.name} aria-pressed={!v.off.has(s.name)} title="weight {s.w}" onclick={() => choose({ off: toggle(v.off, s.name) })}>{s.name}</button>{/each}</div><p class="hint">Tap a subject to leave it out of Open Library results.</p>{/if}</div>
<div class="sec"><p class="label">Shelf</p><div class="seg" role="group">{#each [["fiction", "Fiction"], ["academic", "Academic"], ["nonfiction", "Non-fiction"]] as [k, l]}<button data-act="disc-shelf" data-k={k} aria-pressed={m.shelf === k} onclick={() => choose({ shelf: k, seed: "auto", results: null, error: "" })}>{l}</button>{/each}</div>
    <p class="label" style="margin-top:14px">Source</p><div class="chips wrapchips" role="group">{#each SOURCES.filter(([k]) => SOURCE_SHELVES[k].includes(v.shelf)) as [k, l]}<button class="chip" data-act="disc-source" data-k={k} aria-pressed={v.source === k} onclick={() => choose({ source: k, results: null, error: "" })}>{l}</button>{/each}</div>
    <p class="hint" style="margin-top:6px">{SOURCE_ABOUT[v.source]}</p>
    {#if ["reddit", "hn", "stack"].includes(v.source)}<div class="field" style="margin-top:10px;max-width:460px"><label for="d-seed">Start from</label><select id="d-seed" value={m.seed || "auto"} onchange={e => choose({ seed: e.currentTarget.value, results: null })}><option value="auto">My top {v.source === "reddit" ? 2 : 4} {v.shelf === "academic" ? "academic" : v.shelf === "nonfiction" ? "non-fiction" : "fiction"} books</option>{#each v.seeds as s (s.id)}<option value={s.id}>{MEDIA[s.medium].one}: {titleOf(s)}</option>{/each}</select></div>{/if}
    {#if v.source === "awards"}<div class="chips wrapchips" style="margin-top:10px" role="group" aria-label="Awards">{#each AWARDS as [k] (k)}<button class="chip" data-act="award-toggle" data-k={k} aria-pressed={!v.offAwards.has(k)} onclick={() => choose({ offAwards: toggle(v.offAwards, k) })}>{k}</button>{/each}</div>{/if}</div>
