<!--
    src/features/insights/pages/PlayingPage.svelte
    ─────────────────────────────────────────────────────────────────
      Playing (the Games mode's tab): what you're playing, how long the backlog really is, the short ones, and the
      platforms you play on. playingView() in mode-pages.ts works it out.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { store } from "../../core/store.svelte";
    import { titleOf } from "../../core/core";
    import { modeItems } from "../../core/views";
    import Bars from "../../library/blocks/Bars.svelte";
    import HiddenNote from "../../core/page/HiddenNote.svelte";
    import GameCard from "./GameCard.svelte";
    import { playingView } from "../mode-pages";

    const v = $derived.by(() => {
        void store.itemsByFrame; // your library, taken in once a frame
        void store.meta;
        void store.ui;
        return playingView(modeItems());
    });
</script>

<HiddenNote />
<div class="ph"><div class="ttl"><p>What you're playing, how long the backlog really is, and what you play on.</p></div></div>
<section class="group"><div class="plaque"><h3>Now playing</h3><span class="n">{v.now.length}</span></div>{#if v.now.length}<div class="gcards">{#each v.now as b (b.id)}<GameCard {b} />{/each}</div>{:else}<p class="hint">Start something from the library.</p>{/if}</section>
<div class="dash"><section class="panel span4"><h3>Backlog</h3><div class="tiles"><div class="tile"><div class="v">{v.back}</div><div class="k">Planned</div></div><div class="tile"><div class="v">{v.hrs ? "~" + v.hrs : "–"}</div><div class="k">Hours to beat them all</div></div></div></section>
    <section class="panel span4"><h3>Short ones (12 h or less)</h3>{#if v.quick.length}<div class="mini">{#each v.quick as b (b.id)}<button data-act="open" data-id={b.id}><span class="t">{titleOf(b)}</span><span class="hint">~{b.total} h</span></button>{/each}</div>{:else}<p class="hint">Time-to-beat fills in with a RAWG key, or set it in Edit details.</p>{/if}</section>
    <section class="panel span4"><h3>Platforms</h3>{#if v.plat.length}<Bars rows={v.plat.map(([p, n]) => ({ l: p, v: n }))} />{:else}<p class="hint">Choose a platform on a game's card.</p>{/if}</section></div>
