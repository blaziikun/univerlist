<!--
    src/features/learning-centre/pages/PathBoard.svelte
    ─────────────────────────────────────────────────────────────────
      A pathway's readings laid out without its modules, three ways: the Map (a row per thread, a column per stage:
      what each reading waits on decides its stage), Stages (a group per stage) and Threads (a group per thread, in
      stage order).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import type { Pathway } from "../../core/model";
    import { lcLane, pwColor } from "../learning";
    import { laneDone, pwCardLook, stageName, type pathLook } from "./look";
    import PwCard from "./PwCard.svelte";

    let { P, v }: { P: Pathway; v: ReturnType<typeof pathLook> } = $props();

    const stages = $derived(Array.from({ length: v.maxS + 1 }, (_, i) => i));
    // each reading's place, found once: by thread and stage (the map), and by stage alone
    const cells = $derived.by(() => {
        const m = new Map<string, typeof v.main>();
        for (const b of v.main)
            for (const k of [`${lcLane(P, b)}|${v.stg[b.id] || 0}`, `|${v.stg[b.id] || 0}`]) {
                const L = m.get(k);
                if (L) L.push(b);
                else m.set(k, [b]);
            }
        return m;
    });
    const at = (th: string | null, i: number) => cells.get(`${th ?? ""}|${i}`) || [];
</script>

{#if v.view === "map"}<div class="pwmap" style="--cols:{v.maxS + 1}"><div class="pwmh"><span></span>{#each stages as i}<span>{stageName(i)}</span>{/each}</div>
    {#each v.lanes as th, j (j + th)}{@const d = laneDone(P, v.main, th)}<div class="pwrow" style="--th:{pwColor(P, th)}"><div class="pwlane"><b>{th}</b><small>{d.done}/{d.L.length}</small></div>
        {#each stages as i}<div class="pwcell">{#each at(th, i) as b, k (k + b.id)}<PwCard c={pwCardLook(P, b)} />{/each}</div>{/each}</div>{/each}</div>
{:else if v.view === "stages"}{#each stages as i}{@const L = at(null, i)}{#if L.length}<section class="group"><div class="plaque"><h3>{stageName(i)}</h3><span class="n">{L.length}</span></div><div class="pwgrid">{#each L as b, k (k + b.id)}<PwCard c={pwCardLook(P, b, true)} />{/each}</div></section>{/if}{/each}
{:else}{#each v.lanes as th, j (j + th)}{@const d = laneDone(P, v.main, th)}{@const L = d.L.slice().sort((a, c) => (v.stg[a.id] || 0) - (v.stg[c.id] || 0))}<section class="group" style="--th:{pwColor(P, th)}"><div class="plaque pwplq"><h3>{th}</h3><span class="n">{d.done}/{L.length}</span></div><div class="pwgrid">{#each L as b, k (k + b.id)}<PwCard c={pwCardLook(P, b)} />{/each}</div></section>{/each}{/if}
