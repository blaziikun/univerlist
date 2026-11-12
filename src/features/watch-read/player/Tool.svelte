<!--
    src/features/watch-read/player/Tool.svelte
    ─────────────────────────────────────────────────────────────────
      One of the player's buttons (TOOLS in watch.ts), wherever you've put it: on the video, under it, or in the bar.
      While you arrange the player it's wrapped to be dragged (Cinema.svelte moves it), and one with nothing to show
      right now shows its name instead. Play, the time and the volume are drawn as the video plays (pcPart in
      player.ts); the Watched tick and Lights follow their own news (stageNews.mark). The buttons go through their
      data-act (handlers.ts); Speed and the subtitles are boxes, handled here.
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { stageNews } from "../stage-state.svelte";
    import { pcPart, pcVolumeSet } from "../player";
    import { PS, speedSet, subPicked, toolName, W } from "../watch";
    import { SPEEDS, subPickView, toolHas, type PlayerView } from "./view";

    let {
        k,
        v,
        wrap = "",
        dragging = false,
    }: { k: string; v: PlayerView; wrap?: "" | "titled" | "plain"; dragging?: boolean } = $props();

    const has = $derived(toolHas(v, k));
    const name = $derived(toolName(k) || k);
    // what changes while it plays: ticked watched, the lights
    const live = $derived.by(() => {
        void stageNews.mark;
        void stageNews.player;
        return { marked: !!W.player?.marked, lights: !!PS().lights };
    });
    const subs = $derived.by(() => {
        void stageNews.subs;
        void stageNews.player;
        return subPickView(v.p);
    });
</script>

{#snippet body()}{#if k === "prev"}<button class="cb" data-act="cin-prev" title="Previous episode" aria-label="Previous episode">⏮</button>{:else if k === "back"}<button class="cb" data-act="cin-back" title="Back {v.o.seek}s (←)" aria-label="Back −{v.o.seek} s (←)">−{v.o.seek}</button>{:else if k === "fwd"}<button class="cb" data-act="cin-fwd" title="Forward {v.o.seek}s (→)" aria-label="Forward +{v.o.seek} s (→)">+{v.o.seek}</button>{:else if k === "skip"}<button class="cb wide" data-act="cin-skip" title="Skip intro (S)">Skip intro</button>{:else if k === "ep"}<span class="cin-ep">{v.epLine}</span>{:else if k === "gap"}<span class="spacer"></span>{:else if k === "subs"}<span class="cin-subpick">{#if subs.list.length}<select class="cinsel" id="cin-sub" aria-label="Subtitles" title="Subtitles (C)" value={subs.cur} onchange={e => subPicked(e.currentTarget.value)}><option value="">Subtitles off</option>{#each subs.list as s, i (i)}<option value={s.url}>{s.label}</option>{/each}</select>{/if}</span><button class="cb" data-act="cin-subs" title="Load subtitles from a file (.srt or .vtt)" aria-label="CC: load subtitles from a file (.srt or .vtt)">CC</button>{:else if k === "speed"}<select class="cinsel" id="cin-speed" aria-label="Speed" title="Speed" value={String(+v.o.speed)} onchange={e => speedSet(+e.currentTarget.value)}>{#each SPEEDS as x (x)}<option value={String(x)}>{x}×</option>{/each}</select>{:else if k === "pip"}<button class="cb" data-act="cin-pip" title="Picture in picture" aria-label="Picture in picture">⧉</button>{:else if k === "full"}<button class="cb" data-act="cin-full" title="Full screen (F)" aria-label="Full screen (F)">⛶</button>{:else if k === "cinema"}<button class="cb" data-act="cin-lay" title="Cinema mode (T)" aria-label="Cinema mode (T)">▭</button>{:else if k === "lights"}<button class="cb" data-act="cin-lights" title={live.lights ? "Lights on (L)" : "Lights off (L)"} aria-label={live.lights ? "Lights on (L)" : "Lights off (L)"} aria-pressed={live.lights}>{live.lights ? "☀" : "☾"}</button>{:else if k === "settings"}<button class="cb" data-act="cin-opts" title="Player settings" aria-label="Player settings" aria-pressed={!!v.p.opts}>⚙</button>{:else if k === "mark"}<button class="cb" data-act="cin-mark" title={live.marked ? "Watched (click to undo)" : "Mark watched"} aria-label={live.marked ? "Watched (click to undo)" : "Mark watched"} aria-pressed={live.marked}>{live.marked ? "✓" : "○"}</button>{:else if k === "next"}<button class="cb next" data-act="cin-next" title="Next episode (N)">Next ⏭</button>{:else if k === "play"}<button class="cb pc-play" data-act="pc-play" title="Play / pause (space)" aria-label="Play or pause" {@attach pcPart("play")}>▶</button>{:else if k === "time"}<span class="pc-time" aria-live="off" {@attach pcPart("time")}>0:00 / 0:00</span>{:else if k === "vol"}<span class="pc-vol"><button class="cb" data-act="pc-mute" title="Mute (M)" aria-label="Mute or unmute" {@attach pcPart("mute")}>{W.vol && W.vol.muted ? "🔇" : "🔊"}</button><input type="range" class="pc-volr" min="0" max="1" step="0.05" value={v.o.volume} aria-label="Volume" oninput={e => pcVolumeSet(+e.currentTarget.value)} {@attach pcPart("volr")}></span>{/if}{/snippet}
{#if wrap === "titled"}<span class="wt{dragging ? ' dragging' : ''}" draggable="true" data-tool={k} title="Drag to move: {name}">{#if has}{@render body()}{:else}<span class="cb wtname">{name}</span>{/if}</span>{:else if wrap === "plain"}<span class="wt{dragging ? ' dragging' : ''}" draggable="true" data-tool={k}>{#if has}{@render body()}{:else}<span class="cb wtname">{name}</span>{/if}</span>{:else if has}{@render body()}{/if}
