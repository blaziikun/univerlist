<!--
    src/features/watch-read/player/PlayerOpts.svelte
    ─────────────────────────────────────────────────────────────────
      The player's settings (⚙ on the controls, there even with nothing playing): this episode (the one before,
      watched), the speed, the picture, playing on, resuming, hiding the controls, how far the jumps and S go, what to
      do when a stream is slow, and the badge. Each saves as you change it (playerSet in watch.ts); the speed, the
      picture and the jumps show at once, the rest from the next video. Subtitles have their own panel (CC). The keys
      are listed at the foot. It closes on a click anywhere else (Cinema.svelte).
    ─────────────────────────────────────────────────────────────────
-->

<script lang="ts">
    import { stageNews } from "../stage-state.svelte";
    import { playerSet, PS, speedSet, W } from "../watch";
    import { SPEEDS, type PlayerView } from "./view";

    let { v }: { v: PlayerView } = $props();

    const o = $derived.by(() => {
        void stageNews.look;
        void stageNews.player;
        return PS();
    });
    const marked = $derived.by(() => {
        void stageNews.mark;
        return !!W.player?.marked;
    });
    const FITS: [string, string][] = [
        ["contain", "Fit"],
        ["cover", "Fill"],
        ["fill", "Stretch"],
    ];
    const STARTS: [string, string][] = [
        ["now", "Start at once"],
        ["smooth", "Wait so it won't stop"],
    ];
    // a number box: never below 0, and 0 when it isn't a number
    const num = (x: string) => Math.max(0, parseFloat(x) || 0);
</script>

{#snippet tick(k: "autoNext" | "resume" | "hideUI" | "netBadge", l: string, on: boolean)}<label class="ctl"><input type="checkbox" data-po={k} checked={on} onchange={e => playerSet(k, e.currentTarget.checked)}>{" " + l}</label>{/snippet}
<div class="cin-pop cin-opts" role="dialog" aria-label="Player settings"><p class="ilab">Player settings</p>{#if v.p.e != null}<div class="po-row"><span>This {v.p.film ? "film" : "episode"}</span><div class="po-a">{#if !v.p.film}<button class="chip" data-act="cin-prev">⏮ Previous</button>{/if}<button class="chip" data-act="cin-mark" aria-pressed={marked}>{marked ? "✓ Watched" : "Mark watched"}</button></div></div>{/if}<div class="po-row"><span>Speed</span><div class="seg sm" role="group" aria-label="Speed">{#each SPEEDS as x (x)}<button data-po="speed" aria-pressed={+o.speed === x} onclick={() => speedSet(x)}>{x === 1 ? "Normal" : x + "×"}</button>{/each}</div></div><div class="po-row"><span>Picture</span><div class="seg sm" role="group" aria-label="Picture">{#each FITS as [x, l] (x)}<button data-po="fit" data-v={x} aria-pressed={o.fit === x} onclick={() => playerSet("fit", x)}>{l}</button>{/each}</div></div>{@render tick("autoNext", "Play the next episode automatically", o.autoNext)}{@render tick("resume", "Resume where I stopped", o.resume)}{@render tick("hideUI", "Hide the controls while it plays", o.hideUI)}<label class="po-row"><span>Jumps</span><span class="po-a"><input class="inp po-n" data-pon="seek" inputmode="numeric" value={o.seek} onchange={e => playerSet("seek", num(e.currentTarget.value) || 15)}> s</span></label><label class="po-row" title="Used when the episode has no marked opening"><span>Skip intro jumps</span><span class="po-a"><input class="inp po-n" data-pon="skip" inputmode="numeric" value={o.skip} onchange={e => playerSet("skip", num(e.currentTarget.value))}> s</span></label><div class="po-row"><span>If a stream is slow</span><div class="seg sm" role="group" aria-label="When a stream is slow">{#each STARTS as [x, l] (x)}<button data-po="startMode" data-v={x} aria-pressed={o.startMode === x} onclick={() => playerSet("startMode", x)}>{l}</button>{/each}</div></div>{@render tick("netBadge", "Show how much of a stream has arrived", o.netBadge !== false)}<p class="hint keys">Keys: space play/pause · ← → jump · ↑ ↓ volume · F full screen · T cinema · L lights · M mute · N next · S skip intro · C subtitles · Esc back</p><button class="linkbtn" data-act="open-settings">All settings…</button></div>
