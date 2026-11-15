<!--
    src/features/watch-read/player/Controls.svelte
    ─────────────────────────────────────────────────────────────────
      The player's controls on the video, as a streaming site lays them out: the scrub bar (what has loaded, where you
      are, hover for the time, drag or click to go there, ← → on it), then play or pause, the next episode, the volume
      and the time on the left; on the right, from the far right in: full screen, cinema mode, subtitles (CC) and the
      player's settings (⚙), which is there even with nothing playing. What moves as the video plays is drawn by
      pcDraw in player.ts, not here. The buttons go through their data-act (handlers.ts).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import Icon from "../../core/Icon.svelte";
    import { stageNews } from "../stage-state.svelte";
    import { pcPart, pcScrub, pcVolumeSet } from "../player";
    import { subOn } from "./subtitles";
    import type { PlayerView } from "./view";

    let { v, full }: { v: PlayerView; full: boolean } = $props();

    // CC is lit while subtitles show
    const cc = $derived.by(() => {
        void stageNews.subs;
        void stageNews.player;
        return !!v.p.subPick || subOn(document.querySelector<HTMLVideoElement>("#cinema video"));
    });
</script>

<div class="pc">{#if v.f.custom}<div class="pc-scrub" role="slider" aria-label="Seek" tabindex="0" aria-valuemin="0" aria-valuenow="0" {@attach pcScrub}><span class="pc-buf"></span><span class="pc-done"></span><span class="pc-knob"></span><span class="pc-tip" hidden></span></div>{/if}<div class="pc-row">{#if v.f.custom}<button class="cb pc-play" data-act="pc-play" aria-label="Play (space)" {@attach pcPart("play")}><span class="i-play"><Icon name="playBig" /></span><span class="i-pause"><Icon name="pause" /></span></button>{/if}{#if v.hasNext}<button class="cb" data-act="cin-next" title="Next episode (N)" aria-label="Next episode (N)"><Icon name="nextEp" /></button>{/if}{#if v.f.custom}<span class="pc-vol"><button class="cb pc-mute" data-act="pc-mute" title="Mute (M)" aria-label="Mute (M)" {@attach pcPart("mute")}><span class="i-on"><Icon name="volume" /></span><span class="i-off"><Icon name="muted" /></span></button><input type="range" class="pc-volr" min="0" max="1" step="0.05" value={v.o.volume} aria-label="Volume" oninput={e => pcVolumeSet(+e.currentTarget.value)} {@attach pcPart("volr")}></span>{/if}<span class="spacer"></span>{#if v.f.custom}<span class="pc-time" aria-live="off" {@attach pcPart("time")}>0:00 / 0:00</span>{/if}<button class="cb" data-act="cin-opts" data-pop="" title="Player settings" aria-label="Player settings" aria-expanded={!!v.p.opts}><Icon name="gear" /></button>{#if v.f.custom}<button class="cb pc-cc" data-act="cin-cc" data-pop="" title="Subtitles (C)" aria-label="CC: subtitles (C)" aria-expanded={!!v.p.cc} class:on={cc}>CC</button>{/if}<button class="cb pc-lay" data-act="cin-lay" title={v.cinema ? "Leave cinema mode (T)" : "Cinema mode (T)"} aria-label={v.cinema ? "Leave cinema mode (T)" : "Cinema mode (T)"} aria-pressed={v.cinema}><Icon name={v.cinema ? "theaterOff" : "theater"} /></button>{#if v.f.custom}<button class="cb" data-act="cin-full" title={full ? "Leave full screen (F)" : "Full screen (F)"} aria-label={full ? "Leave full screen (F)" : "Full screen (F)"}><Icon name={full ? "fullscreenOff" : "fullscreen"} /></button>{/if}</div></div>
