<!--
    src/features/watch-read/player/Cinema.svelte
    ─────────────────────────────────────────────────────────────────
      The player (#cinema, over everything), laid out like a streaming site's: a top bar (Back, the show's name, which
      opens its card, the servers and this page's settings), the player itself (the video, what's drawn over it, its
      controls and their panels: everything full screen takes along), a line under it (the episode and the lights),
      and the blocks (the seasons with their episodes, and the description) under it, or beside it on either side.
      Cinema mode makes the player as big as the window, with the blocks below; switching only changes the layout, so
      the video plays on untouched (the stage is the same element in both). The lights darken everything but the
      player. Mounted on <body> when something plays and let go when it closes (watch-read/surfaces.ts, renderPlayer
      in watch.ts). It draws when the older code asks: renderPlayer() for a new video (CinStage is drawn afresh),
      playerRedraw() and the smaller asks for what's around it; never while it plays. Its own: the keys (playerKey in
      watch.ts), the controls hiding when the pointer is still, and its panels closing on a click anywhere else.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import Icon from "../../core/Icon.svelte";
    import { closestTo, ui } from "../../core/core";
    import { stageNews } from "../stage-state.svelte";
    import { isFull, lookVars, panelsClose } from "../player";
    import { cinLights, playerKey, PS, W } from "../watch";
    import CinBlocks from "./CinBlocks.svelte";
    import CinStage from "./CinStage.svelte";
    import Controls from "./Controls.svelte";
    import PageOpts from "./PageOpts.svelte";
    import PlayerOpts from "./PlayerOpts.svelte";
    import SourcesPanel from "./SourcesPanel.svelte";
    import SubsPanel from "./SubsPanel.svelte";
    import { blocksView, playerView, srvButtonView } from "./view";

    const v = $derived.by(() => {
        void stageNews.player;
        void stageNews.video;
        return playerView();
    });
    const b = $derived.by(() => {
        void stageNews.side;
        void stageNews.player;
        return W.player ? blocksView(W.player) : null;
    });
    const srv = $derived.by(() => {
        void stageNews.srv;
        void stageNews.player;
        return W.player ? srvButtonView(W.player) : null;
    });
    const pageOpts = $derived.by(() => {
        void stageNews.side;
        void stageNews.player;
        return !!ui.wpOpts;
    });
    const lights = $derived.by(() => {
        void stageNews.mark;
        void stageNews.player;
        return !!PS().lights;
    });
    const look = $derived.by(() => {
        void stageNews.look;
        void stageNews.player;
        return lookVars();
    });
    // full screen: the button's icon, and the layout inside it
    let full = $state(isFull());

    // the controls hide when the pointer is still while it plays; on a phone a tap shows or hides them
    let idle = $state(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const HIDE_AFTER = 3000;
    function wake() {
        idle = false;
        clearTimeout(timer);
        timer = setTimeout(() => {
            const vd = document.querySelector<HTMLVideoElement>("#cinema video"),
                p = W.player;
            if (PS().hideUI && vd && !vd.paused && p && !(p.opts || p.cc || p.srcOpen)) idle = true;
        }, HIDE_AFTER);
    }
    function sleep() {
        clearTimeout(timer);
        const p = W.player;
        if (p && !(p.opts || p.cc || p.srcOpen)) idle = true;
    }
    const shown = () => !idle;
    // each time it's drawn the clock starts again, as it did when the player was drawn as HTML
    $effect(() => {
        void stageNews.player;
        untrack(wake);
    });
    onDestroy(() => clearTimeout(timer));

    function key(e: KeyboardEvent) {
        if (!playerKey(e)) return;
        e.preventDefault();
        e.stopPropagation();
        wake();
    }
    // a click anywhere but on a panel, or on the button that opens it, closes the panels (as a menu closes)
    function outside(e: PointerEvent) {
        if (closestTo(e, "#cinema .cin-pop, #cinema [data-pop], #ctx, #overlay")) return;
        panelsClose();
    }
</script>

<svelte:document onkeydowncapture={key} onpointerdowncapture={outside} onfullscreenchange={() => (full = isFull())} />
{#if v}<!-- svelte-ignore a11y_no_static_element_interactions: the pointer moving anywhere over it shows the controls --><div id="cinema" data-svelte="" class="cin plr" class:cinema={v.cinema} class:lights class:idle class:full class:empty={!v.url} class:hasleft={!!b?.left.length} class:hasside={!!b?.side.length} style:--sub-scale={look.sub} style:--sub-pos={look.subPos} style:--sub-bg={look.subBg} onpointermove={e => e.pointerType !== "touch" && wake()}>{#if lights}<!-- svelte-ignore a11y_click_events_have_key_events: L turns the lights back on too --><div class="cin-dark" onclick={() => cinLights(false)}></div>{/if}<header class="cin-head"><button class="cb back" data-act="cin-close" title="Back (Esc)" aria-label="Back (Esc)"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>{#if v.card}<button class="cin-name" data-act="open" data-id={v.card} title="Open its card">{v.showName}</button>{:else}<b class="cin-name">{v.showName}</b>{#if v.canAdd}<button class="cb wide" data-act="watch-add" title="Add to my list">+ List</button>{/if}{/if}<span class="spacer"></span>{#if srv}<span class="cin-hbtn"><button class="cb srvbtn" data-act="cin-srcs" data-pop="" aria-expanded={srv.open} aria-label={srv.title} title={srv.title}><Icon name="servers" />{#if srv.n > 1}<span class="srvn">{srv.n}</span>{/if}{#if srv.looking}<span class="dots" aria-hidden="true"></span>{/if}</button>{#if srv.open}<SourcesPanel p={v.p} />{/if}</span>{/if}<span class="cin-hbtn"><button class="cb" data-act="wp-opts" data-pop="" title="This page's settings" aria-label="This page's settings" aria-expanded={pageOpts}><Icon name="gear" /></button>{#if pageOpts}<PageOpts />{/if}</span></header><div class="cin-body">{#if b && b.left.length}<aside class="cin-side left"><CinBlocks {b} keys={b.left} /></aside>{/if}<div class="cin-col"><div class="cin-main">{#key stageNews.video}<CinStage {v} {wake} {sleep} {shown} />{/key}{#if v.f.custom || !v.url}<Controls {v} {full} />{/if}{#if v.p.opts}<PlayerOpts {v} />{/if}{#if v.p.cc}<SubsPanel p={v.p} />{/if}</div><div class="cin-under"><span class="cin-ep">{v.epLine}</span><span class="spacer"></span><button class="cb bulb" data-act="cin-lights" title={lights ? "Lights on (L)" : "Lights off (L)"} aria-label={lights ? "Lights on (L)" : "Lights off (L)"} aria-pressed={lights}><Icon name="bulb" /></button></div>{#if b && b.main.length}<div class="cin-mb"><CinBlocks {b} keys={b.main} /></div>{/if}</div>{#if b && b.side.length}<aside class="cin-side"><CinBlocks {b} keys={b.side} /></aside>{/if}</div></div>{/if}
