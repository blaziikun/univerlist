<!--
    src/features/core/menus/ItemMenu.svelte
    ─────────────────────────────────────────────────────────────────
      The right-click menu on a cover, a row or a search result: score it there and then, set its status, Watch or
      Read, favourite, Up next, lists, hide, open the card, and the mode it lives in.

      Opened by openCtx() (core/keys.ts), drawn in the one menu box (#ctx) through core/menus.ts. It reads the entry
      through the store, so a change shows at once. Its buttons keep their data-act names and are handled with the
      same buttons elsewhere (library/handlers.ts: ctx-status, ctx-fav…); the score and the mode box are its own.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../store.svelte";
    import { cleanTitle, fmtScore, MEDIA, patch, scaleOf, STATUS, STATUS_WORDS, titleOf } from "../core";
    import { renderMain } from "../shell";
    import { moveToMode } from "../types";
    import { stageOn } from "../../extensions/builtins";
    import ScoreWidget from "../../library/score/ScoreWidget.svelte";
    import type { Entry } from "../model";

    let { k }: { k: string } = $props();

    // the entry, copied each time it changes (it's changed in place)
    const b = $derived.by((): Entry | null => {
        const x = store.item(k);
        return x ? { id: k, ...x } : null;
    });
    const M = $derived(store.meta);
    const score = (n: number) => patch(k, { rating: n }, "Score");
    function home(v: string) {
        moveToMode([k], v);
        renderMain();
    }
</script>

{#if b}
    {@const words = STATUS_WORDS[MEDIA[b.medium].group]}
    {@const queued = M.queue.includes(b.id)}
    <div class="ctx-h"><b>{cleanTitle(titleOf(b))}</b><small>{[MEDIA[b.medium].one, b.year].filter(Boolean).join(" · ")}</small></div>
    <div class="ctx-s"><span class="ilab">Score{#if b.rating}{" · "}<b>{fmtScore(b.rating, scaleOf(b))}</b>{/if}</span><ScoreWidget {b} act="ctx-rate" pick={score} typed={score} /></div>
    <div class="ctx-st">{#each STATUS as s}<button data-act="ctx-status" data-k={s} aria-pressed={b.status === s}>{words[s]}</button>{/each}</div>
    <div class="ctx-a">{#if stageOn()}{#if ["anime", "tv", "film"].includes(b.medium)}<button data-act="watch-open" data-id={b.id}>▶ Watch</button>{:else if ["book", "manga", "manhwa", "novel", "comic"].includes(b.medium)}<button data-act="read-open" data-id={b.id}>❡ Read</button>{/if}{/if}<button data-act="ctx-fav">{b.fav ? "♥ Unfavourite" : "♡ Favourite"}</button><button data-act="ctx-queue">{queued ? "✓ In Up next" : "+ Up next"}</button><button data-act="ctx-lists">≡ Lists…</button>
        <button data-act="ctx-hide">{b.hidden ? "Show in lists" : "Hide from lists"}</button><button data-act="ctx-open">Open card</button></div>
    <div class="ctx-m"><span class="ilab">Lives in</span><select class="sel" id="ctx-mode" onchange={e => home(e.currentTarget.value)}>{#each [["auto", "Where its type puts it"], ...M.modes.filter(x => x.id !== "universal").map(x => [x.id, x.name])] as [v, l]}<option value={v} selected={(b.modeHome || "auto") === v}>{l}</option>{/each}</select></div>
{/if}
