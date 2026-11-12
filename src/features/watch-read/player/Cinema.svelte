<!--
    src/features/watch-read/player/Cinema.svelte
    ─────────────────────────────────────────────────────────────────
      The player (#cinema, over everything): docked beside the episodes (a header with the servers, the stage, the
      buttons under it, the blocks beside or under it) or in cinema mode (the video fills the window, the buttons over
      it); its panels (the servers, its settings, Customise this page) and, while you arrange it, the edit bar. Mounted
      on <body> when something plays and let go when it closes (watch-read/surfaces.ts, renderPlayer in watch.ts).
      It draws when the older code asks: renderPlayer() for a new video (CinStage is drawn afresh), playerRedraw() and
      the smaller asks for what's around it; never while it plays. Its own: the keys (playerKey in watch.ts), the
      controls hiding when the mouse is still, and dragging buttons between the video, under it and Hidden.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import { closestTo, ui } from "../../core/core";
    import { stageNews } from "../stage-state.svelte";
    import { LOOK, lookVars, wtMove } from "../player";
    import { playerKey, PS, W } from "../watch";
    import CinBlocks from "./CinBlocks.svelte";
    import CinStage from "./CinStage.svelte";
    import Controls from "./Controls.svelte";
    import EditBar from "./EditBar.svelte";
    import PageOpts from "./PageOpts.svelte";
    import PlayerOpts from "./PlayerOpts.svelte";
    import ServerStrip from "./ServerStrip.svelte";
    import SourcesPanel from "./SourcesPanel.svelte";
    import Tool from "./Tool.svelte";
    import { blocksView, playerView, toolsAt } from "./view";

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
    const wpOpts = $derived.by(() => {
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
        return { ...lookVars(), sub: PS().subSize + "%" };
    });
    const edit = $derived.by(() => {
        void stageNews.player;
        return !!ui.wpEdit;
    });
    const cls = $derived(
        v
            ? "cin" +
                  (v.o.hideUI ? " autohide" : "") +
                  " lay-" +
                  v.f.lay +
                  (lights ? " lights" : "") +
                  (v.f.lay === "docked" && b && !b.side.length ? " noside" : "")
            : "cin"
    );
    // with the browser's own controls in cinema mode, the bar under the video holds these
    const BOT = ["prev", "back", "fwd", "skip", "gap", "subs", "speed", "pip", "full", "mark", "next"];

    // the controls hide when the mouse is still (not while you arrange them, nor while the player's own are paused)
    let idle = $state(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    function wake() {
        idle = false;
        clearTimeout(timer);
        timer = setTimeout(() => {
            const vd = document.querySelector<HTMLVideoElement>("#cinema video");
            if (!ui.wpEdit && !(vd && vd.paused && W.player?.frame?.custom)) idle = true;
        }, LOOK().hideAfter * 1000);
    }
    // each time it's drawn the clock starts again, as it did when the HTML player was drawn
    $effect(() => {
        void stageNews.player;
        untrack(wake);
    });
    onDestroy(() => clearTimeout(timer));

    function key(e: KeyboardEvent) {
        if (!playerKey(e)) return;
        e.preventDefault();
        e.stopPropagation();
    }

    // dragging buttons between the video, under it and Hidden (and into place among the others)
    const drag = $state<{ k: string | null; zone: string | null }>({ k: null, zone: null });
    function dragstart(e: DragEvent) {
        const w = closestTo(e, "#cinema .wt");
        if (!w) return;
        drag.k = w.dataset.tool ?? null;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            try {
                e.dataTransfer.setData("text/plain", drag.k || "");
            } catch (_) {}
        }
    }
    function dragend() {
        drag.k = null;
        drag.zone = null;
    }
    function dragover(e: DragEvent) {
        const z = drag.k ? closestTo(e, "#cinema .wz") : null;
        if (!z) return;
        e.preventDefault();
        drag.zone = z.dataset.zone ?? null;
    }
    function drop(e: DragEvent) {
        const k = drag.k,
            z = k ? closestTo(e, "#cinema .wz") : null;
        if (!k || !z) return;
        e.preventDefault();
        const before = [...z.querySelectorAll<HTMLElement>(".wt")].find(w => {
            const r = w.getBoundingClientRect();
            return w.dataset.tool !== k && e.clientX < r.left + r.width / 2 && e.clientY < r.bottom;
        });
        dragend();
        wtMove(k, z.dataset.zone || "", before ? before.dataset.tool || null : null);
    }
</script>

<svelte:document onkeydowncapture={key} />
{#if v}<!-- svelte-ignore a11y_no_static_element_interactions: the mouse moving anywhere over it shows the controls; dragging is for arranging buttons --><div id="cinema" data-svelte="" class={cls} class:editing={edit} class:custom={v.f.custom} class:idle style:--subsize={look.sub} style:--pl-size={look.size} style:--side-w={look.side} style:--pl-radius={look.radius} style:--ctl-scale={look.ctl} style:--pc-dim={look.dim} style:--sub-bg={look.subBg} onpointermove={wake} ondragstart={dragstart} ondragend={dragend} ondragover={dragover} ondrop={drop}>{#if v.f.lay === "docked"}<div class="cin-col"><div class="cin-head"><button class="cb" data-act="cin-close" title="Back (Esc)" aria-label="Back (Esc)">←</button><b>{v.showName}</b><span class="spacer"></span><ServerStrip />{#if v.card}<button class="cb" data-act="open" title="Open its card" aria-label="Open its card" data-id={v.card}>◫</button>{:else if v.canAdd}<button class="cb wide" data-act="watch-add" title="Add to my list">+ List</button>{/if}<button class="cb" data-act="wp-opts" title="Customise this page" aria-label="Customise this page" aria-pressed={wpOpts}>⋯</button></div>{" "}<div class="cin-main">{#key stageNews.video}<CinStage {v} {wake} />{/key}{#if v.f.custom}<Controls {v} cinema={false} {edit} {drag} />{/if}</div><div class="cin-under{v.f.custom ? ' wz' : ''}{drag.zone === 'under' ? ' over' : ''}" data-zone="under">{#each toolsAt(v, v.f.custom ? "under" : "bar") as k (k)}<Tool {k} {v} wrap={v.f.custom && edit ? "plain" : ""} dragging={drag.k === k} />{/each}</div><div class="cin-mb">{#if b}<CinBlocks {b} keys={b.main} />{/if}</div></div>{#if b && b.side.length}<aside class="cin-side"><div class="cs-body"><CinBlocks {b} keys={b.side} /></div></aside>{/if}{:else}<div class="cin-main"><div class="cin-top"><button class="cb" data-act="cin-close" title="Back (Esc)" aria-label="Back (Esc)">←</button><div class="cin-title"><b>{v.showName}</b>{#if v.epTag}<small>{v.epLine}</small>{/if}</div><span class="spacer"></span><ServerStrip /><button class="cb" data-act="cin-lay" title="Show the episode list (T)" aria-label="Show the episode list (T)">☰</button><button class="cb" data-act="cin-lights" title={lights ? "Lights on (L)" : "Lights off (L)"} aria-label={lights ? "Lights on (L)" : "Lights off (L)"} aria-pressed={lights}>{lights ? "☀" : "☾"}</button><button class="cb" data-act="cin-opts" title="Player settings" aria-label="Player settings" aria-pressed={!!v.p.opts}>⚙</button></div>{" "}{#key stageNews.video}<CinStage {v} {wake} />{/key}{#if v.f.custom}<Controls {v} cinema {edit} {drag} />{:else}<div class="cin-bot">{#each BOT as k (k)}<Tool {k} {v} />{/each}</div>{/if}</div>{/if}{#if v.p.srcOpen}<SourcesPanel p={v.p} />{/if}{" "}{#if v.p.opts}<PlayerOpts o={v.o} />{/if}{#if edit}<EditBar {drag} />{/if}{#if wpOpts}<PageOpts />{/if}</div>{/if}
