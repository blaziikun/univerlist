<!--
    src/features/library/score/ScoreWidget.svelte
    ─────────────────────────────────────────────────────────────────
      Your score, in the scale you chose (stored out of 10 underneath): five stars, ten buttons, or a slider with a box
      for 100 points or 10 with decimals. The item card uses it (your score, and each thing you score in detail), and so
      does the right-click menu on a cover.

      Where it's used says what a score does: pick(n) for a star or a number pressed (n out of 10, 0 for "clear"),
      typed(n) for the slider or the box (n out of 10, worked out from the scale). Its buttons keep their data-act
      names (rate, crit, ctx-rate) so the tests and keybinds can press them.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { parseScore, scaleOf } from "../../core/core";
    import type { Item } from "../../core/model";

    let {
        b,
        act = "rate",
        crit,
        value,
        pick,
        typed,
    }: {
        b: Item;
        /** the buttons' data-act (and the boxes' data-rate / data-ratenum) */
        act?: string;
        /** the thing scored in detail ("Story"), if it's one of those */
        crit?: string;
        /** the score shown, out of 10 (your score unless given) */
        value?: number;
        pick: (n: number) => void;
        typed: (n: number) => void;
    } = $props();

    const look = $derived.by(() => {
        void store.meta; // your usual scale
        const sc = scaleOf(b),
            val = value != null ? value : b.rating || 0,
            max = sc === "100" ? 100 : 10;
        return { sc, val, max, shown: val ? (sc === "100" ? Math.round(val * 10) : val) : "", step: sc === "100" ? 1 : 0.1 };
    });
    // what the box shows: the score, or where the slider is while it's dragged
    let box = $state("");
    $effect.pre(() => {
        box = String(look.shown);
    });
    function commit(raw: string) {
        box = String(look.shown); // a score that doesn't change still shows as it's kept
        typed(raw === "" ? 0 : parseScore(raw, look.sc));
    }
</script>

{#snippet clear()}{#if look.val}<button class="linkbtn" data-act={act} data-k="0" data-crit={crit} onclick={() => pick(0)}>clear</button>{/if}{/snippet}
{#if look.sc === "5"}
    {@const v = look.val / 2}
    <div class="stars" role="group" aria-label="Score">{#each [1, 2, 3, 4, 5] as n}<span class="star{v >= n ? ' on' : v >= n - 0.5 ? ' half' : ''}"><button data-act={act} data-k={n * 2 - 1} data-crit={crit} aria-label="{n - 0.5} stars" onclick={() => pick(n * 2 - 1)}></button><button data-act={act} data-k={n * 2} data-crit={crit} aria-label="{n} stars" onclick={() => pick(n * 2)}></button>★</span>{/each}{@render clear()}</div>
{:else if look.sc === "10"}
    <div class="rate10">{#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as n}<button class={Math.round(look.val) >= n ? "on" : ""} data-act={act} data-k={n} data-crit={crit} aria-label="{n} out of 10" onclick={() => pick(n)}>{n}</button>{/each}{@render clear()}</div>
{:else}
    <div class="rateslide"><input type="range" min="0" max={look.max} step={look.step} value={look.shown || 0} data-rate={act} data-crit={crit} aria-label="Score out of {look.max}" oninput={e => (box = e.currentTarget.value)} onchange={e => commit(e.currentTarget.value)}><input class="inp rnum" inputmode="decimal" value={box} data-ratenum={act} data-crit={crit} placeholder="–" aria-label="Score" onchange={e => commit(e.currentTarget.value)}><span class="hint">/ {look.max}</span>{@render clear()}</div>
{/if}
